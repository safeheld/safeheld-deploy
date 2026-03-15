import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';

/**
 * Generate a CMAR draft auto-populated from live reconciliation data.
 */
export async function generateCmarDraft(firmId: string, reportingPeriodEnd: Date) {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  // Determine reporting period start (one month before period end by default)
  const reportingPeriodStart = new Date(reportingPeriodEnd);
  reportingPeriodStart.setMonth(reportingPeriodStart.getMonth() - 1);
  reportingPeriodStart.setDate(reportingPeriodStart.getDate() + 1);

  // Submission deadline: 15 business days after period end (approx 3 weeks)
  const submissionDeadline = new Date(reportingPeriodEnd);
  submissionDeadline.setDate(submissionDeadline.getDate() + 21);

  logger.info({ firmId, reportingPeriodStart, reportingPeriodEnd }, 'Generating CMAR draft');

  // Pull reconciliation runs for the reporting period
  const reconciliationRuns = await prisma.reconciliationRun.findMany({
    where: {
      firmId,
      reconciliationDate: { gte: reportingPeriodStart, lte: reportingPeriodEnd },
    },
  });

  const totalReconciliations = reconciliationRuns.length;
  const shortfallRuns = reconciliationRuns.filter(r => r.status === 'SHORTFALL');
  const metOrExcessRuns = reconciliationRuns.filter(r => r.status === 'MET' || r.status === 'EXCESS');
  const complianceRate = totalReconciliations > 0
    ? parseFloat(((metOrExcessRuns.length / totalReconciliations) * 100).toFixed(2))
    : 100;

  // Calculate total client money held (latest reconciliation figures)
  const latestInternalRun = await prisma.reconciliationRun.findFirst({
    where: {
      firmId,
      reconciliationType: 'INTERNAL',
      reconciliationDate: { lte: reportingPeriodEnd },
    },
    orderBy: { reconciliationDate: 'desc' },
  });
  const clientMoneyHeld = latestInternalRun ? Number(latestInternalRun.totalRequirement) : 0;

  // Custody assets held
  const custodyAggregate = await prisma.clientAsset.aggregate({
    where: { firmId, status: 'HELD' },
    _sum: { marketValue: true },
  });
  const custodyAssetsHeld = Number(custodyAggregate._sum.marketValue ?? 0);

  // Number of active clients
  const numberOfClients = await prisma.clientAccount.count({
    where: { firmId, status: 'ACTIVE' },
  });

  // Breach summary for the period
  const breaches = await prisma.breach.findMany({
    where: {
      firmId,
      createdAt: { gte: reportingPeriodStart, lte: reportingPeriodEnd },
    },
    select: { breachType: true, severity: true },
  });

  const breachCountByType: Record<string, number> = {};
  const breachCountBySeverity: Record<string, number> = {};
  for (const b of breaches) {
    breachCountByType[b.breachType] = (breachCountByType[b.breachType] || 0) + 1;
    breachCountBySeverity[b.severity] = (breachCountBySeverity[b.severity] || 0) + 1;
  }

  // Safeguarding account details
  const safeguardingAccounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    select: {
      id: true, bankName: true, accountNumberMasked: true,
      currency: true, fundType: true, letterStatus: true,
    },
  });

  // Acknowledgement letter status
  const acknowledgementLetters = await prisma.acknowledgementLetter.findMany({
    where: { firmId, status: 'CURRENT' },
    select: { safeguardingAccountId: true, effectiveDate: true, expiryDate: true },
  });

  const accountsWithCurrentLetter = new Set(acknowledgementLetters.map(l => l.safeguardingAccountId));
  const accountsMissingLetter = safeguardingAccounts.filter(a => !accountsWithCurrentLetter.has(a.id));

  // Build auto-populated data payload
  const dataPayload = {
    reconciliationSummary: {
      totalReconciliations,
      shortfallCount: shortfallRuns.length,
      complianceRate,
    },
    breachSummary: {
      totalBreaches: breaches.length,
      byType: breachCountByType,
      bySeverity: breachCountBySeverity,
    },
    safeguardingAccounts: safeguardingAccounts.map(a => ({
      bankName: a.bankName,
      accountNumberMasked: a.accountNumberMasked,
      currency: a.currency,
      fundType: a.fundType,
      letterStatus: a.letterStatus,
      hasCurrentAckLetter: accountsWithCurrentLetter.has(a.id),
    })),
    acknowledgementLetterSummary: {
      totalAccounts: safeguardingAccounts.length,
      withCurrentLetter: accountsWithCurrentLetter.size,
      missingLetter: accountsMissingLetter.length,
    },
  };

  // Create the CMAR submission record
  const submission = await prisma.cmarSubmission.create({
    data: {
      firmId,
      reportingPeriodStart,
      reportingPeriodEnd,
      submissionDeadline,
      status: 'DRAFT',
      clientMoneyHeld,
      custodyAssetsHeld,
      numberOfClients,
      reconciliationBreaches: breaches.length,
      dataPayload,
      notes: `Auto-generated CMAR draft for period ending ${reportingPeriodEnd.toISOString().split('T')[0]}. Compliance rate: ${complianceRate}%.`,
    },
  });

  logger.info({ firmId, submissionId: submission.id }, 'CMAR draft generated');

  return submission;
}

/**
 * Validate a CMAR submission before final submission.
 * Cross-references reported figures against actual reconciliation data.
 */
export async function validateCmarSubmission(submissionId: string, firmId: string) {
  const submission = await prisma.cmarSubmission.findFirst({
    where: { id: submissionId, firmId },
  });
  if (!submission) throw new NotFoundError('CMAR Submission');

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check all required fields are populated
  if (submission.clientMoneyHeld === null) errors.push('Client money held is not populated');
  if (submission.numberOfClients === null) errors.push('Number of clients is not populated');
  if (submission.reconciliationBreaches === null) errors.push('Reconciliation breaches count is not populated');

  // Cross-reference breach count against actual data
  const actualBreachCount = await prisma.breach.count({
    where: {
      firmId,
      createdAt: {
        gte: submission.reportingPeriodStart,
        lte: submission.reportingPeriodEnd,
      },
    },
  });

  if (submission.reconciliationBreaches !== null && submission.reconciliationBreaches !== actualBreachCount) {
    warnings.push(
      `Reported breach count (${submission.reconciliationBreaches}) differs from actual count (${actualBreachCount})`
    );
  }

  // Cross-reference client money held against latest reconciliation
  const latestInternalRun = await prisma.reconciliationRun.findFirst({
    where: {
      firmId,
      reconciliationType: 'INTERNAL',
      reconciliationDate: { lte: submission.reportingPeriodEnd },
    },
    orderBy: { reconciliationDate: 'desc' },
  });

  if (latestInternalRun && submission.clientMoneyHeld !== null) {
    const actualClientMoney = Number(latestInternalRun.totalRequirement);
    const reportedClientMoney = Number(submission.clientMoneyHeld);
    const diff = Math.abs(actualClientMoney - reportedClientMoney);
    const threshold = actualClientMoney * 0.01; // 1% tolerance
    if (diff > threshold && threshold > 0) {
      warnings.push(
        `Reported client money (${reportedClientMoney.toFixed(2)}) differs from latest reconciliation figure (${actualClientMoney.toFixed(2)}) by more than 1%`
      );
    }
  }

  // Cross-reference client count
  const actualClientCount = await prisma.clientAccount.count({
    where: { firmId, status: 'ACTIVE' },
  });
  if (submission.numberOfClients !== null && submission.numberOfClients !== actualClientCount) {
    warnings.push(
      `Reported client count (${submission.numberOfClients}) differs from current active count (${actualClientCount})`
    );
  }

  // Check for missing acknowledgement letters
  const accountsMissingLetter = await prisma.safeguardingAccount.count({
    where: { firmId, status: 'ACTIVE', letterStatus: { in: ['MISSING', 'EXPIRED'] } },
  });
  if (accountsMissingLetter > 0) {
    warnings.push(`${accountsMissingLetter} safeguarding account(s) have missing or expired acknowledgement letters`);
  }

  // Check submission deadline
  if (submission.submissionDeadline < new Date()) {
    warnings.push('Submission deadline has passed');
  }

  const isValid = errors.length === 0;

  logger.info({ firmId, submissionId, isValid, errorCount: errors.length, warningCount: warnings.length }, 'CMAR validation complete');

  return {
    submissionId,
    isValid,
    errors,
    warnings,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Mark a CMAR submission as submitted.
 */
export async function submitCmar(submissionId: string, firmId: string, userId: string) {
  const submission = await prisma.cmarSubmission.findFirst({
    where: { id: submissionId, firmId },
  });
  if (!submission) throw new NotFoundError('CMAR Submission');

  if (submission.status === 'SUBMITTED' || submission.status === 'ACCEPTED') {
    throw new ValidationError('CMAR submission has already been submitted');
  }

  const updated = await prisma.cmarSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: userId,
    },
  });

  logger.info({ firmId, submissionId, userId }, 'CMAR submitted');

  return updated;
}
