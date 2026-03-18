import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { logAudit } from '../../modules/audit/service';
import { sendEmail } from '../../utils/email';
import { config } from '../../config';
import { LEGISLATIVE_SOURCES, type LegislativeSource } from './sources';
import { fetchDocument, chunkContent } from './fetcher';
import { extractObligations, type ExtractedObligation } from './extractor';
import { validateObligations, type ValidationResult } from './validator';

export interface IngestionRunResult {
  framework: string;
  sourceName: string;
  status: 'COMPLETE' | 'FAILED';
  documentId: string | null;
  pageCount: number | null;
  chunkCount: number;
  obligationsExtracted: number;
  rulesVerified: number;
  rulesUpdated: number;
  rulesCreated: number;
  rulesUnverified: number;
  error?: string;
  confidenceDistribution: {
    high: number;    // 90-100
    medium: number;  // 70-89
    low: number;     // 50-69
    veryLow: number; // <50
  };
}

export interface FullIngestionResult {
  startedAt: string;
  completedAt: string;
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  results: IngestionRunResult[];
  summary: {
    totalObligations: number;
    totalVerified: number;
    totalUpdated: number;
    totalCreated: number;
    totalUnverified: number;
  };
}

// ─── Single document ingestion ──────────────────────────────────────────────

async function ingestDocument(source: LegislativeSource): Promise<IngestionRunResult> {
  const result: IngestionRunResult = {
    framework: source.framework,
    sourceName: source.sourceName,
    status: 'FAILED',
    documentId: null,
    pageCount: null,
    chunkCount: 0,
    obligationsExtracted: 0,
    rulesVerified: 0,
    rulesUpdated: 0,
    rulesCreated: 0,
    rulesUnverified: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0, veryLow: 0 },
  };

  // Create document record
  const doc = await prisma.ingestionDocument.create({
    data: {
      framework: source.framework,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      status: 'PENDING',
    },
  });
  result.documentId = doc.id;

  try {
    // Step 1: Fetch
    await prisma.ingestionDocument.update({ where: { id: doc.id }, data: { status: 'FETCHING' } });
    logger.info({ framework: source.framework, url: source.sourceUrl }, 'Fetching legislative document');

    const { content, hash, pageCount } = await fetchDocument(source);
    result.pageCount = pageCount;

    await prisma.ingestionDocument.update({
      where: { id: doc.id },
      data: {
        rawContent: content.substring(0, 500_000), // Cap at 500KB
        contentHash: hash,
        pageCount,
        status: 'CHUNKING',
      },
    });

    // Step 2: Chunk
    const chunks = chunkContent(content);
    result.chunkCount = chunks.length;

    await prisma.ingestionDocument.update({
      where: { id: doc.id },
      data: { chunkCount: chunks.length, status: 'EXTRACTING' },
    });

    logger.info({ framework: source.framework, chunks: chunks.length, contentLength: content.length }, 'Content chunked');

    // Step 3: Extract obligations from each chunk
    const allObligations: ExtractedObligation[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const obligations = await extractObligations(source.framework, chunks[i], i, chunks.length);
      allObligations.push(...obligations);

      // Rate limit between API calls
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    result.obligationsExtracted = allObligations.length;
    logger.info({ framework: source.framework, obligations: allObligations.length }, 'Obligations extracted');

    // Step 4: Validate
    await prisma.ingestionDocument.update({ where: { id: doc.id }, data: { status: 'VALIDATING' } });

    const validationResults = await validateObligations(source.framework, doc.id, allObligations);

    // Tally results
    for (const vr of validationResults) {
      switch (vr.validationStatus) {
        case 'VERIFIED': result.rulesVerified++; break;
        case 'UPDATED': result.rulesUpdated++; break;
        case 'CREATED': result.rulesCreated++; break;
        case 'UNVERIFIED': result.rulesUnverified++; break;
      }

      const cs = vr.confidenceScore;
      if (cs >= 90) result.confidenceDistribution.high++;
      else if (cs >= 70) result.confidenceDistribution.medium++;
      else if (cs >= 50) result.confidenceDistribution.low++;
      else result.confidenceDistribution.veryLow++;
    }

    // Mark complete
    await prisma.ingestionDocument.update({
      where: { id: doc.id },
      data: { status: 'COMPLETE', ingestedAt: new Date() },
    });

    result.status = 'COMPLETE';

    await logAudit({
      action: 'DEEP_INGESTION_DOC_COMPLETE',
      entityType: 'ingestion_documents',
      entityId: doc.id,
      details: {
        framework: source.framework,
        sourceName: source.sourceName,
        obligations: result.obligationsExtracted,
        verified: result.rulesVerified,
        updated: result.rulesUpdated,
        created: result.rulesCreated,
        unverified: result.rulesUnverified,
      },
    });

    logger.info({
      framework: source.framework,
      verified: result.rulesVerified,
      updated: result.rulesUpdated,
      created: result.rulesCreated,
      unverified: result.rulesUnverified,
    }, 'Document ingestion complete');

  } catch (err) {
    result.error = (err as Error).message;
    result.status = 'FAILED';

    await prisma.ingestionDocument.update({
      where: { id: doc.id },
      data: { status: 'FAILED', errorMessage: (err as Error).message },
    });

    logger.error({ err, framework: source.framework, url: source.sourceUrl }, 'Document ingestion failed');

    await logAudit({
      action: 'DEEP_INGESTION_DOC_FAILED',
      entityType: 'ingestion_documents',
      entityId: doc.id,
      details: { framework: source.framework, error: (err as Error).message },
    });
  }

  return result;
}

// ─── Full ingestion run ─────────────────────────────────────────────────────

/**
 * Run deep ingestion for all legislative sources.
 */
export async function runFullIngestion(): Promise<FullIngestionResult> {
  const startedAt = new Date().toISOString();
  logger.info('Starting full deep ingestion run');

  await logAudit({
    action: 'DEEP_INGESTION_STARTED',
    entityType: 'ingestion_documents',
    entityId: '00000000-0000-0000-0000-000000000000',
    details: { totalSources: LEGISLATIVE_SOURCES.length },
  });

  const results: IngestionRunResult[] = [];

  for (const source of LEGISLATIVE_SOURCES) {
    const result = await ingestDocument(source);
    results.push(result);
  }

  const completedAt = new Date().toISOString();
  const successfulSources = results.filter(r => r.status === 'COMPLETE').length;
  const failedSources = results.filter(r => r.status === 'FAILED').length;

  const fullResult: FullIngestionResult = {
    startedAt,
    completedAt,
    totalSources: LEGISLATIVE_SOURCES.length,
    successfulSources,
    failedSources,
    results,
    summary: {
      totalObligations: results.reduce((s, r) => s + r.obligationsExtracted, 0),
      totalVerified: results.reduce((s, r) => s + r.rulesVerified, 0),
      totalUpdated: results.reduce((s, r) => s + r.rulesUpdated, 0),
      totalCreated: results.reduce((s, r) => s + r.rulesCreated, 0),
      totalUnverified: results.reduce((s, r) => s + r.rulesUnverified, 0),
    },
  };

  await logAudit({
    action: 'DEEP_INGESTION_COMPLETE',
    entityType: 'ingestion_documents',
    entityId: '00000000-0000-0000-0000-000000000000',
    details: {
      ...fullResult.summary,
      successfulSources,
      failedSources,
      duration: `${((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000).toFixed(0)}s`,
    },
  });

  // Notify admin if any sources failed
  if (failedSources > 0) {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { email: true, id: true },
    });
    const failedNames = results.filter(r => r.status === 'FAILED').map(r => `${r.framework}: ${r.error}`).join('; ');
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `[Safeheld] Deep Ingestion — ${failedSources} source(s) failed`,
        html: `<p>${failedSources} of ${LEGISLATIVE_SOURCES.length} sources failed during deep ingestion.</p><p>Failures: ${failedNames}</p>`,
        userId: admin.id,
        emailType: 'DEEP_INGESTION_ALERT',
      }).catch(() => {});
    }
  }

  logger.info(fullResult.summary, 'Full deep ingestion run complete');
  return fullResult;
}

/**
 * Run deep ingestion for a single framework.
 */
export async function runFrameworkIngestion(framework: string): Promise<IngestionRunResult[]> {
  const sources = LEGISLATIVE_SOURCES.filter(s => s.framework === framework);
  if (sources.length === 0) {
    throw new Error(`No legislative sources configured for framework: ${framework}`);
  }

  await logAudit({
    action: 'DEEP_INGESTION_FRAMEWORK_STARTED',
    entityType: 'ingestion_documents',
    entityId: '00000000-0000-0000-0000-000000000000',
    details: { framework, sourceCount: sources.length },
  });

  const results: IngestionRunResult[] = [];
  for (const source of sources) {
    results.push(await ingestDocument(source));
  }

  return results;
}

// ─── Data access ────────────────────────────────────────────────────────────

export async function getIngestionStatus() {
  const documents = await prisma.ingestionDocument.findMany({
    orderBy: [{ framework: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      framework: true,
      sourceName: true,
      status: true,
      pageCount: true,
      chunkCount: true,
      ingestedAt: true,
      errorMessage: true,
      createdAt: true,
      _count: { select: { validationResults: true } },
    },
  });

  // Aggregate by framework
  const byFramework: Record<string, {
    framework: string;
    documents: number;
    lastIngested: string | null;
    status: string;
    verified: number;
    updated: number;
    created: number;
    unverified: number;
  }> = {};

  for (const doc of documents) {
    if (!byFramework[doc.framework]) {
      byFramework[doc.framework] = {
        framework: doc.framework,
        documents: 0,
        lastIngested: null,
        status: doc.status,
        verified: 0, updated: 0, created: 0, unverified: 0,
      };
    }
    byFramework[doc.framework].documents++;
    if (doc.ingestedAt) {
      const ts = doc.ingestedAt.toISOString();
      if (!byFramework[doc.framework].lastIngested || ts > byFramework[doc.framework].lastIngested!) {
        byFramework[doc.framework].lastIngested = ts;
      }
    }
  }

  // Get validation counts per framework
  const validationCounts = await prisma.ingestionValidationResult.groupBy({
    by: ['framework', 'validationStatus'],
    _count: true,
  });

  for (const vc of validationCounts) {
    const fw = byFramework[vc.framework];
    if (!fw) continue;
    switch (vc.validationStatus) {
      case 'VERIFIED': fw.verified = vc._count; break;
      case 'UPDATED': fw.updated = vc._count; break;
      case 'CREATED': fw.created = vc._count; break;
      case 'UNVERIFIED': fw.unverified = vc._count; break;
    }
  }

  return { documents, byFramework: Object.values(byFramework) };
}

export async function getValidationResults(filters: {
  framework?: string;
  validationStatus?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.framework) where.framework = filters.framework;
  if (filters.validationStatus) where.validationStatus = filters.validationStatus;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [results, total] = await Promise.all([
    prisma.ingestionValidationResult.findMany({
      where,
      orderBy: [{ confidenceScore: 'asc' }, { validationStatus: 'asc' }],
      skip,
      take: pageSize,
      include: { document: { select: { sourceName: true, sourceUrl: true } } },
    }),
    prisma.ingestionValidationResult.count({ where }),
  ]);

  return { results, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function confirmValidationResult(id: string, userId: string): Promise<void> {
  const result = await prisma.ingestionValidationResult.findUnique({ where: { id } });
  if (!result) throw new Error('Validation result not found');

  await prisma.ingestionValidationResult.update({
    where: { id },
    data: { adminReviewed: true, validationStatus: 'VERIFIED' },
  });

  await logAudit({
    userId,
    action: 'DEEP_INGESTION_RESULT_CONFIRMED',
    entityType: 'ingestion_validation_results',
    entityId: id,
    details: { ruleCode: result.ruleCode, framework: result.framework },
  });
}

export async function rejectValidationResult(id: string, userId: string): Promise<void> {
  const result = await prisma.ingestionValidationResult.findUnique({ where: { id } });
  if (!result) throw new Error('Validation result not found');

  // If a rule was created, deactivate it
  if (result.ruleCode && result.validationStatus === 'CREATED') {
    await prisma.frameworkRule.updateMany({
      where: { ruleCode: result.ruleCode },
      data: { active: false },
    });
  }

  await prisma.ingestionValidationResult.update({
    where: { id },
    data: { adminReviewed: true },
  });

  await logAudit({
    userId,
    action: 'DEEP_INGESTION_RESULT_REJECTED',
    entityType: 'ingestion_validation_results',
    entityId: id,
    details: { ruleCode: result.ruleCode, framework: result.framework },
  });
}
