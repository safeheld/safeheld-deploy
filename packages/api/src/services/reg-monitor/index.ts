import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { sendEmail } from '../../utils/email';
import { logAudit } from '../../modules/audit/service';
import { rulesEngine } from '../rules-engine';
import { analyseRegulatoryChange } from './ai-analyst';
import { regulatoryChangeAlertEmail, firmImpactAlertEmail } from './email-templates';
import { runFrameworkIngestion } from '../deep-ingestion';

// ─── Source monitoring ──────────────────────────────────────────────────────

/**
 * Fetch a URL and return its text content.
 * Uses a simple timeout and user-agent to be polite.
 */
async function fetchSourceContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SafeheldRegMonitor/1.0 (compliance monitoring; contact: admin@safeheld.com)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check a single regulatory source for changes.
 */
export async function checkSource(sourceId: string): Promise<{
  changed: boolean;
  eventId?: string;
  error?: string;
}> {
  const source = await prisma.regulatorySource.findUnique({ where: { id: sourceId } });
  if (!source || !source.active) {
    return { changed: false, error: 'Source not found or inactive' };
  }

  try {
    const content = await fetchSourceContent(source.sourceUrl);
    const newHash = hashContent(content);
    const now = new Date();

    // Update last_checked regardless
    await prisma.regulatorySource.update({
      where: { id: sourceId },
      data: { lastChecked: now },
    });

    // Compare hashes
    if (source.contentHash && source.contentHash === newHash) {
      logger.debug({ sourceId, framework: source.framework }, 'No change detected');
      return { changed: false };
    }

    // Change detected — create event
    const event = await prisma.regulatoryChangeEvent.create({
      data: {
        sourceId,
        detectedAt: now,
        previousHash: source.contentHash,
        newHash,
        rawContent: content.substring(0, 50_000), // Cap at 50KB for storage
        status: 'DETECTED',
      },
    });

    // Update source
    await prisma.regulatorySource.update({
      where: { id: sourceId },
      data: { contentHash: newHash, lastChanged: now, lastChecked: now },
    });

    logger.info({ sourceId, eventId: event.id, framework: source.framework }, 'Regulatory change detected');

    // Audit trail
    await logAudit({
      action: 'REG_CHANGE_DETECTED',
      entityType: 'regulatory_change_events',
      entityId: event.id,
      details: {
        sourceId,
        framework: source.framework,
        sourceName: source.sourceName,
        previousHash: source.contentHash,
        newHash,
      },
    });

    // Trigger AI analysis asynchronously
    analyseAndPropose(event.id, source.framework, content).catch(err => {
      logger.error({ err, eventId: event.id }, 'AI analysis failed');
    });

    return { changed: true, eventId: event.id };
  } catch (err) {
    logger.error({ err, sourceId, url: source.sourceUrl }, 'Failed to check regulatory source');
    return { changed: false, error: (err as Error).message };
  }
}

/**
 * Run AI analysis on a change event and create proposals.
 */
async function analyseAndPropose(eventId: string, framework: string, content: string): Promise<void> {
  const event = await prisma.regulatoryChangeEvent.findUnique({
    where: { id: eventId },
    include: { source: true },
  });
  if (!event) return;

  try {
    const analysis = await analyseRegulatoryChange(framework, content);

    // Update event with AI analysis
    await prisma.regulatoryChangeEvent.update({
      where: { id: eventId },
      data: {
        aiAnalysis: analysis as object,
        changeSummary: analysis.summary || 'AI analysis completed',
        status: 'ANALYSED',
      },
    });

    // Create proposals from AI analysis
    if (analysis.affected_rules && analysis.affected_rules.length > 0) {
      for (const rule of analysis.affected_rules) {
        // Look up current rule text
        const existingRule = await prisma.frameworkRule.findUnique({
          where: { ruleCode: rule.rule_code },
        });

        await prisma.regulatoryUpdateProposal.create({
          data: {
            changeEventId: eventId,
            ruleCode: rule.rule_code,
            framework: rule.framework || framework,
            proposedChangeType: rule.change_type || 'UPDATE',
            currentRuleText: existingRule?.ruleDescription || null,
            proposedRuleText: rule.proposed_text,
            changeRationale: rule.rationale,
            severity: rule.severity || 'MEDIUM',
            effectiveDate: rule.effective_date ? new Date(rule.effective_date) : null,
            status: 'PENDING',
          },
        });
      }

      await prisma.regulatoryChangeEvent.update({
        where: { id: eventId },
        data: { status: 'PROPOSED' },
      });

      // Audit trail
      await logAudit({
        action: 'REG_PROPOSALS_CREATED',
        entityType: 'regulatory_change_events',
        entityId: eventId,
        details: {
          framework,
          proposalCount: analysis.affected_rules.length,
          rules: analysis.affected_rules.map((r: { rule_code: string }) => r.rule_code),
        },
      });

      // Send notifications based on severity
      await sendChangeNotifications(eventId, framework, analysis);
    }
  } catch (err) {
    logger.error({ err, eventId }, 'AI analysis and proposal creation failed');
  }
}

/**
 * Send email notifications for detected changes based on severity.
 */
async function sendChangeNotifications(
  eventId: string,
  framework: string,
  analysis: { summary?: string; affected_rules?: Array<{ rule_code: string; severity: string }> }
): Promise<void> {
  const hasCritical = analysis.affected_rules?.some(r => r.severity === 'CRITICAL');
  const hasHigh = analysis.affected_rules?.some(r => r.severity === 'HIGH');

  if (hasCritical || hasHigh) {
    // Send immediate email to admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { email: true, id: true },
    });

    const html = regulatoryChangeAlertEmail({
      framework,
      severity: hasCritical ? 'CRITICAL' : 'HIGH',
      summary: analysis.summary || 'Regulatory change detected',
      rulesAffected: analysis.affected_rules?.length || 0,
      eventId,
    });

    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `[Safeheld] Regulatory Update Alert — ${framework} — ${hasCritical ? 'CRITICAL' : 'HIGH'}`,
        html,
        userId: admin.id,
        emailType: 'REG_CHANGE_ALERT',
      }).catch(() => {});
    }

    // For CRITICAL: also notify MLROs
    if (hasCritical) {
      const mlros = await prisma.user.findMany({
        where: {
          role: 'COMPLIANCE_OFFICER',
          status: 'ACTIVE',
          firm: { status: 'ACTIVE' },
        },
        select: { email: true, id: true, firmId: true },
      });

      for (const mlro of mlros) {
        await sendEmail({
          to: mlro.email,
          subject: `[Safeheld] CRITICAL Regulatory Update — ${framework}`,
          html,
          firmId: mlro.firmId,
          userId: mlro.id,
          emailType: 'REG_CHANGE_ALERT_CRITICAL',
        }).catch(() => {});
      }
    }
  }
  // MEDIUM/LOW handled in weekly digest (scheduled job)
}

// ─── Full monitoring run ────────────────────────────────────────────────────

/**
 * Run monitoring across all active sources.
 */
export async function runFullMonitor(): Promise<{
  checked: number;
  changed: number;
  errors: number;
}> {
  const sources = await prisma.regulatorySource.findMany({
    where: { active: true },
    orderBy: { framework: 'asc' },
  });

  let checked = 0;
  let changed = 0;
  let errors = 0;

  for (const source of sources) {
    // Check frequency
    const now = new Date();
    if (source.lastChecked) {
      const hoursSince = (now.getTime() - source.lastChecked.getTime()) / (1000 * 60 * 60);
      if (source.monitorFrequency === 'DAILY' && hoursSince < 20) continue;
      if (source.monitorFrequency === 'WEEKLY' && hoursSince < 144) continue; // ~6 days
      if (source.monitorFrequency === 'MONTHLY' && hoursSince < 672) continue; // ~28 days
    }

    const result = await checkSource(source.id);
    checked++;
    if (result.changed) changed++;
    if (result.error) errors++;

    // Rate limit between fetches
    await new Promise(r => setTimeout(r, 2000));
  }

  logger.info({ checked, changed, errors }, 'Full regulatory monitoring run complete');

  await logAudit({
    action: 'REG_MONITOR_RUN',
    entityType: 'regulatory_sources',
    entityId: '00000000-0000-0000-0000-000000000000',
    details: { checked, changed, errors },
  });

  return { checked, changed, errors };
}

// ─── Proposal management ────────────────────────────────────────────────────

export async function getProposals(filters: {
  status?: string;
  framework?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.framework) where.framework = filters.framework;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [proposals, total] = await Promise.all([
    prisma.regulatoryUpdateProposal.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: {
        changeEvent: {
          select: { changeSummary: true, detectedAt: true, source: { select: { sourceName: true, sourceUrl: true } } },
        },
      },
    }),
    prisma.regulatoryUpdateProposal.count({ where }),
  ]);

  return { proposals, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function approveProposal(proposalId: string, userId: string): Promise<void> {
  const proposal = await prisma.regulatoryUpdateProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal || proposal.status !== 'PENDING') {
    throw new Error('Proposal not found or not in PENDING status');
  }

  const now = new Date();

  // Apply the change to the framework rule
  if (proposal.proposedChangeType === 'DEPRECATE') {
    await prisma.frameworkRule.updateMany({
      where: { ruleCode: proposal.ruleCode },
      data: { active: false, effectiveTo: now },
    });
  } else if (proposal.proposedChangeType === 'CREATE') {
    await prisma.frameworkRule.create({
      data: {
        framework: proposal.framework,
        ruleCode: proposal.ruleCode,
        ruleName: proposal.ruleCode, // Will be updated with proper name
        ruleDescription: proposal.proposedRuleText,
        severity: proposal.severity,
        sourceRegulation: `Regulatory update — ${proposal.framework}`,
        sourceArticle: 'Auto-generated from regulatory monitoring',
        effectiveFrom: proposal.effectiveDate || now,
        version: 1,
      },
    });
  } else {
    // UPDATE
    const existing = await prisma.frameworkRule.findUnique({
      where: { ruleCode: proposal.ruleCode },
    });
    if (existing) {
      await prisma.frameworkRule.update({
        where: { ruleCode: proposal.ruleCode },
        data: {
          ruleDescription: proposal.proposedRuleText,
          version: existing.version + 1,
          effectiveFrom: proposal.effectiveDate || now,
        },
      });
    }
  }

  // Update proposal status
  await prisma.regulatoryUpdateProposal.update({
    where: { id: proposalId },
    data: {
      status: 'APPROVED',
      reviewedBy: userId,
      reviewedAt: now,
      appliedAt: now,
    },
  });

  // Update parent event
  await prisma.regulatoryChangeEvent.updateMany({
    where: { id: proposal.changeEventId },
    data: { status: 'APPLIED' },
  });

  // Audit trail
  await logAudit({
    userId,
    action: 'REG_PROPOSAL_APPROVED',
    entityType: 'regulatory_update_proposals',
    entityId: proposalId,
    details: {
      ruleCode: proposal.ruleCode,
      changeType: proposal.proposedChangeType,
      framework: proposal.framework,
    },
  });

  // Run firm impact assessment
  assessFirmImpact(proposal.framework, proposal.ruleCode, userId).catch(err => {
    logger.error({ err, proposalId }, 'Firm impact assessment failed');
  });

  // Re-run deep ingestion for the affected framework to validate updated rules
  runFrameworkIngestion(proposal.framework).catch(err => {
    logger.error({ err, proposalId, framework: proposal.framework }, 'Post-approval deep ingestion failed');
  });
}

export async function rejectProposal(proposalId: string, userId: string, reason: string): Promise<void> {
  const proposal = await prisma.regulatoryUpdateProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal || proposal.status !== 'PENDING') {
    throw new Error('Proposal not found or not in PENDING status');
  }

  await prisma.regulatoryUpdateProposal.update({
    where: { id: proposalId },
    data: {
      status: 'REJECTED',
      reviewedBy: userId,
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
  });

  await prisma.regulatoryChangeEvent.updateMany({
    where: { id: proposal.changeEventId },
    data: { status: 'REJECTED' },
  });

  await logAudit({
    userId,
    action: 'REG_PROPOSAL_REJECTED',
    entityType: 'regulatory_update_proposals',
    entityId: proposalId,
    details: {
      ruleCode: proposal.ruleCode,
      framework: proposal.framework,
      reason,
    },
  });
}

// ─── Firm impact assessment ─────────────────────────────────────────────────

export async function assessFirmImpact(framework: string, ruleCode: string, userId: string): Promise<{
  affectedFirms: number;
  nowNonCompliant: number;
}> {
  // Map framework to applicable regimes
  const { REGIME_FRAMEWORK_MAP } = await import('../rules-engine/types');
  const affectedRegimes = Object.entries(REGIME_FRAMEWORK_MAP)
    .filter(([, frameworks]) => frameworks.includes(framework))
    .map(([regime]) => regime);

  // Find firms on those regimes
  const firms = await prisma.firm.findMany({
    where: { regime: { in: affectedRegimes as any }, status: 'ACTIVE' },
    select: { id: true, name: true, regime: true },
  });

  let nowNonCompliant = 0;

  for (const firm of firms) {
    // Get latest reconciliation run for this firm
    const latestRun = await prisma.reconciliationRun.findFirst({
      where: { firmId: firm.id },
      orderBy: { reconciliationDate: 'desc' },
    });

    if (!latestRun) continue;

    const previousScore = latestRun.complianceScore;

    // Re-run rules engine
    try {
      const verdict = await rulesEngine.evaluate(latestRun.id);

      if (previousScore !== null && previousScore >= 70 && verdict.score < 70) {
        nowNonCompliant++;

        // Notify firm
        const firmUsers = await prisma.user.findMany({
          where: { firmId: firm.id, role: { in: ['COMPLIANCE_OFFICER', 'ADMIN'] }, status: 'ACTIVE' },
          select: { email: true, id: true },
        });

        const html = firmImpactAlertEmail({
          firmName: firm.name,
          framework,
          previousScore: previousScore || 0,
          newScore: verdict.score,
          ruleCode,
          newRemediations: verdict.rulesFailed,
        });

        for (const user of firmUsers) {
          await sendEmail({
            to: user.email,
            subject: `[Safeheld] Regulatory Update Affects Your Compliance — ${framework}`,
            html,
            firmId: firm.id,
            userId: user.id,
            emailType: 'FIRM_IMPACT_ALERT',
          }).catch(() => {});
        }
      }
    } catch (err) {
      logger.error({ err, firmId: firm.id, ruleCode }, 'Failed to re-evaluate firm after rule update');
    }
  }

  await logAudit({
    userId,
    action: 'FIRM_IMPACT_ASSESSED',
    entityType: 'framework_rules',
    entityId: '00000000-0000-0000-0000-000000000000',
    details: {
      framework,
      ruleCode,
      affectedFirms: firms.length,
      nowNonCompliant,
    },
  });

  return { affectedFirms: firms.length, nowNonCompliant };
}

// ─── Data access helpers ────────────────────────────────────────────────────

export async function getSources() {
  return prisma.regulatorySource.findMany({
    orderBy: [{ framework: 'asc' }, { sourceName: 'asc' }],
    include: {
      _count: { select: { changeEvents: true } },
      changeEvents: {
        orderBy: { detectedAt: 'desc' },
        take: 1,
        select: { id: true, detectedAt: true, status: true, changeSummary: true },
      },
    },
  });
}

export async function getChangeEvents(filters: {
  status?: string;
  sourceId?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.sourceId) where.sourceId = filters.sourceId;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [events, total] = await Promise.all([
    prisma.regulatoryChangeEvent.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        source: { select: { sourceName: true, framework: true, sourceUrl: true } },
        _count: { select: { proposals: true } },
      },
    }),
    prisma.regulatoryChangeEvent.count({ where }),
  ]);

  return { events, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getFirmImpactForProposal(proposalId: string) {
  const proposal = await prisma.regulatoryUpdateProposal.findUnique({
    where: { id: proposalId },
  });
  if (!proposal) throw new Error('Proposal not found');

  const { REGIME_FRAMEWORK_MAP } = await import('../rules-engine/types');
  const affectedRegimes = Object.entries(REGIME_FRAMEWORK_MAP)
    .filter(([, frameworks]) => frameworks.includes(proposal.framework))
    .map(([regime]) => regime);

  const firms = await prisma.firm.findMany({
    where: { regime: { in: affectedRegimes as any }, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      regime: true,
      reconciliationRuns: {
        orderBy: { reconciliationDate: 'desc' },
        take: 1,
        select: { complianceScore: true, certificateEligible: true },
      },
    },
  });

  return firms.map(f => ({
    firmId: f.id,
    firmName: f.name,
    regime: f.regime,
    currentScore: f.reconciliationRuns[0]?.complianceScore ?? null,
    currentlyEligible: f.reconciliationRuns[0]?.certificateEligible ?? null,
    affectedRuleCode: proposal.ruleCode,
    changeType: proposal.proposedChangeType,
  }));
}
