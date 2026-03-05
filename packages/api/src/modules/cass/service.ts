import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';

// ─── Client Assets ───────────────────────────────────────────────────────────

export async function getClientAssets(firmId: string, opts: {
  page: number; pageSize: number; assetType?: string; clientId?: string; recordDate?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.assetType) where.assetType = opts.assetType;
  if (opts.clientId) where.clientId = opts.clientId;
  if (opts.recordDate) where.recordDate = new Date(opts.recordDate);

  const [assets, total] = await Promise.all([
    prisma.clientAsset.findMany({
      where, orderBy: { recordDate: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.clientAsset.count({ where }),
  ]);

  return {
    assets, page: opts.page, pageSize: opts.pageSize, total,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export async function createClientAsset(firmId: string, data: {
  assetName: string; assetType: string; isin?: string; sedol?: string;
  clientId: string; clientName?: string; quantity: number; marketValue?: number;
  currency: string; custodian?: string; subCustodian?: string;
  accountReference?: string; status?: string; recordDate: string;
}) {
  return prisma.clientAsset.create({
    data: {
      firmId,
      assetName: data.assetName,
      assetType: data.assetType as any,
      isin: data.isin,
      sedol: data.sedol,
      clientId: data.clientId,
      clientName: data.clientName,
      quantity: data.quantity,
      marketValue: data.marketValue,
      currency: data.currency.toUpperCase(),
      custodian: data.custodian,
      subCustodian: data.subCustodian,
      accountReference: data.accountReference,
      status: (data.status as any) || 'HELD',
      recordDate: new Date(data.recordDate),
    },
  });
}

// ─── CMAR Submissions ────────────────────────────────────────────────────────

export async function getCmarSubmissions(firmId: string, opts: {
  page: number; pageSize: number; status?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.status) where.status = opts.status;

  const [submissions, total] = await Promise.all([
    prisma.cmarSubmission.findMany({
      where, orderBy: { reportingPeriodEnd: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.cmarSubmission.count({ where }),
  ]);

  return {
    submissions, page: opts.page, pageSize: opts.pageSize, total,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export async function createCmarSubmission(firmId: string, data: {
  reportingPeriodStart: string; reportingPeriodEnd: string; submissionDeadline: string;
  clientMoneyHeld?: number; custodyAssetsHeld?: number; numberOfClients?: number;
  reconciliationBreaches?: number; notes?: string;
}) {
  // Auto-populate from reconciliation data
  const periodStart = new Date(data.reportingPeriodStart);
  const periodEnd = new Date(data.reportingPeriodEnd);

  const breachCount = data.reconciliationBreaches ?? await prisma.breach.count({
    where: {
      firmId,
      createdAt: { gte: periodStart, lte: periodEnd },
    },
  });

  const clientCount = data.numberOfClients ?? await prisma.clientAccount.count({
    where: { firmId, status: 'ACTIVE' },
  });

  return prisma.cmarSubmission.create({
    data: {
      firmId,
      reportingPeriodStart: periodStart,
      reportingPeriodEnd: periodEnd,
      submissionDeadline: new Date(data.submissionDeadline),
      clientMoneyHeld: data.clientMoneyHeld,
      custodyAssetsHeld: data.custodyAssetsHeld,
      numberOfClients: clientCount,
      reconciliationBreaches: breachCount,
      notes: data.notes,
    },
  });
}

export async function updateCmarSubmission(id: string, firmId: string, data: {
  status?: string; clientMoneyHeld?: number; custodyAssetsHeld?: number;
  numberOfClients?: number; reconciliationBreaches?: number; notes?: string;
  fcaReference?: string; submittedBy?: string;
}) {
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.clientMoneyHeld !== undefined) updateData.clientMoneyHeld = data.clientMoneyHeld;
  if (data.custodyAssetsHeld !== undefined) updateData.custodyAssetsHeld = data.custodyAssetsHeld;
  if (data.numberOfClients !== undefined) updateData.numberOfClients = data.numberOfClients;
  if (data.reconciliationBreaches !== undefined) updateData.reconciliationBreaches = data.reconciliationBreaches;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.fcaReference) updateData.fcaReference = data.fcaReference;
  if (data.status === 'SUBMITTED') {
    updateData.submittedAt = new Date();
    updateData.submittedBy = data.submittedBy;
  }

  return prisma.cmarSubmission.update({
    where: { id, firmId },
    data: updateData,
  });
}

// ─── Risk Controls ───────────────────────────────────────────────────────────

const LIKELIHOOD_SCORES: Record<string, number> = {
  RARE: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, ALMOST_CERTAIN: 5,
};
const IMPACT_SCORES: Record<string, number> = {
  NEGLIGIBLE: 1, MINOR: 2, MODERATE: 3, MAJOR: 4, SEVERE: 5,
};

export async function getRiskControls(firmId: string, opts: {
  page: number; pageSize: number; category?: string; status?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.category) where.category = opts.category;
  if (opts.status) where.status = opts.status;

  const [controls, total] = await Promise.all([
    prisma.riskControl.findMany({
      where, orderBy: { riskScore: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.riskControl.count({ where }),
  ]);

  return {
    controls, page: opts.page, pageSize: opts.pageSize, total,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export async function createRiskControl(firmId: string, data: {
  category: string; title: string; description: string;
  likelihood: string; impact: string; controlDescription: string;
  controlOwner?: string; status?: string; nextReviewDue?: string;
  mitigatingActions?: string;
}) {
  const riskScore = (LIKELIHOOD_SCORES[data.likelihood] || 1) * (IMPACT_SCORES[data.impact] || 1);
  return prisma.riskControl.create({
    data: {
      firmId,
      category: data.category as any,
      title: data.title,
      description: data.description,
      likelihood: data.likelihood as any,
      impact: data.impact as any,
      riskScore,
      controlDescription: data.controlDescription,
      controlOwner: data.controlOwner,
      status: (data.status as any) || 'NOT_TESTED',
      nextReviewDue: data.nextReviewDue ? new Date(data.nextReviewDue) : null,
      mitigatingActions: data.mitigatingActions,
    },
  });
}

export async function updateRiskControl(id: string, firmId: string, data: {
  status?: string; likelihood?: string; impact?: string;
  controlDescription?: string; controlOwner?: string;
  nextReviewDue?: string; mitigatingActions?: string;
}) {
  const existing = await prisma.riskControl.findFirst({ where: { id, firmId } });
  if (!existing) throw new Error('Risk control not found');

  const likelihood = data.likelihood || existing.likelihood;
  const impact = data.impact || existing.impact;
  const riskScore = (LIKELIHOOD_SCORES[likelihood] || 1) * (IMPACT_SCORES[impact] || 1);

  const updateData: Record<string, unknown> = { riskScore };
  if (data.status) updateData.status = data.status;
  if (data.likelihood) updateData.likelihood = data.likelihood;
  if (data.impact) updateData.impact = data.impact;
  if (data.controlDescription) updateData.controlDescription = data.controlDescription;
  if (data.controlOwner !== undefined) updateData.controlOwner = data.controlOwner;
  if (data.nextReviewDue) updateData.nextReviewDue = new Date(data.nextReviewDue);
  if (data.mitigatingActions !== undefined) updateData.mitigatingActions = data.mitigatingActions;
  if (data.status === 'EFFECTIVE' || data.status === 'PARTIALLY_EFFECTIVE' || data.status === 'INEFFECTIVE') {
    updateData.lastTestedAt = new Date();
  }

  return prisma.riskControl.update({ where: { id }, data: updateData });
}

// ─── Regulatory Updates ──────────────────────────────────────────────────────

export async function getRegulatoryUpdates(firmId: string, opts: {
  page: number; pageSize: number; status?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.status) where.status = opts.status;

  const [updates, total] = await Promise.all([
    prisma.regulatoryUpdate.findMany({
      where, orderBy: { publishedDate: 'desc' }, skip, take: opts.pageSize,
      include: { impactAssessments: true },
    }),
    prisma.regulatoryUpdate.count({ where }),
  ]);

  return {
    updates, page: opts.page, pageSize: opts.pageSize, total,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export async function createRegulatoryUpdate(firmId: string, data: {
  title: string; source: string; publishedDate: string;
  effectiveDate?: string; summary: string; affectedRegimes: string[];
  assignedTo?: string; notes?: string;
}) {
  return prisma.regulatoryUpdate.create({
    data: {
      firmId,
      title: data.title,
      source: data.source,
      publishedDate: new Date(data.publishedDate),
      effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
      summary: data.summary,
      affectedRegimes: data.affectedRegimes as unknown as Prisma.InputJsonValue,
      assignedTo: data.assignedTo,
      notes: data.notes,
    },
  });
}

export async function updateRegulatoryUpdate(id: string, firmId: string, data: {
  status?: string; assignedTo?: string; notes?: string;
}) {
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
  if (data.notes !== undefined) updateData.notes = data.notes;

  return prisma.regulatoryUpdate.update({ where: { id, firmId }, data: updateData });
}

// ─── Impact Assessments ──────────────────────────────────────────────────────

export async function getImpactAssessments(firmId: string, opts: {
  page: number; pageSize: number; status?: string; regulatoryUpdateId?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.status) where.status = opts.status;
  if (opts.regulatoryUpdateId) where.regulatoryUpdateId = opts.regulatoryUpdateId;

  const [assessments, total] = await Promise.all([
    prisma.impactAssessment.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: opts.pageSize,
      include: { regulatoryUpdate: { select: { title: true, source: true } } },
    }),
    prisma.impactAssessment.count({ where }),
  ]);

  return {
    assessments, page: opts.page, pageSize: opts.pageSize, total,
    totalPages: Math.ceil(total / opts.pageSize),
  };
}

export async function createImpactAssessment(firmId: string, data: {
  regulatoryUpdateId: string; assessedBy: string; impactLevel: string;
  affectedProcesses: string[]; requiredChanges: string;
  implementationDeadline?: string;
}) {
  const assessment = await prisma.impactAssessment.create({
    data: {
      firmId,
      regulatoryUpdateId: data.regulatoryUpdateId,
      assessedBy: data.assessedBy,
      impactLevel: data.impactLevel as any,
      affectedProcesses: data.affectedProcesses as unknown as Prisma.InputJsonValue,
      requiredChanges: data.requiredChanges,
      implementationDeadline: data.implementationDeadline ? new Date(data.implementationDeadline) : null,
    },
  });

  // Mark the regulatory update as IMPACT_ASSESSED
  await prisma.regulatoryUpdate.update({
    where: { id: data.regulatoryUpdateId },
    data: { status: 'IMPACT_ASSESSED' },
  });

  return assessment;
}

export async function updateImpactAssessment(id: string, firmId: string, data: {
  status?: string; approvedBy?: string;
}) {
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.status === 'APPROVED') {
    updateData.approvedBy = data.approvedBy;
    updateData.approvedAt = new Date();
  }
  return prisma.impactAssessment.update({ where: { id, firmId }, data: updateData });
}

// ─── CASS Dashboard ──────────────────────────────────────────────────────────

export async function getCassDashboard(firmId: string) {
  const [
    totalAssets,
    totalAssetValue,
    cmarDrafts,
    nextCmarDeadline,
    highRisks,
    newRegUpdates,
    pendingAssessments,
    openBreaches,
  ] = await Promise.all([
    prisma.clientAsset.count({ where: { firmId, status: 'HELD' } }),
    prisma.clientAsset.aggregate({
      where: { firmId, status: 'HELD' },
      _sum: { marketValue: true },
    }),
    prisma.cmarSubmission.count({ where: { firmId, status: 'DRAFT' } }),
    prisma.cmarSubmission.findFirst({
      where: { firmId, status: { in: ['DRAFT', 'IN_REVIEW'] } },
      orderBy: { submissionDeadline: 'asc' },
      select: { submissionDeadline: true, reportingPeriodEnd: true },
    }),
    prisma.riskControl.count({
      where: { firmId, riskScore: { gte: 15 } },
    }),
    prisma.regulatoryUpdate.count({ where: { firmId, status: 'NEW' } }),
    prisma.impactAssessment.count({ where: { firmId, status: { in: ['DRAFT', 'IN_REVIEW'] } } }),
    prisma.breach.count({ where: { firmId, status: { in: ['DETECTED', 'ACKNOWLEDGED', 'REMEDIATING'] } } }),
  ]);

  return {
    custodyAssets: totalAssets,
    totalAssetValue: totalAssetValue._sum.marketValue?.toString() || '0',
    cmarDrafts,
    nextCmarDeadline: nextCmarDeadline?.submissionDeadline || null,
    highRiskControls: highRisks,
    newRegulatoryUpdates: newRegUpdates,
    pendingAssessments,
    openBreaches,
  };
}
