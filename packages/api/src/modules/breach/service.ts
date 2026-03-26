import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { sendEmail, breachDetectedEmail, breachStatusChangeEmail } from '../../utils/email';
import { dispatchWebhooks } from '../../utils/webhook';
import { fileStorage } from '../../utils/fileStorage';
import {
  BreachType,
  BreachSeverity,
  BreachStatus,
  BreachCategory,
  FcaNotificationStatus,
  FcaNotificationType,
  Prisma,
} from '@prisma/client';

interface DetectBreachesParams {
  firmId: string;
  reconciliationRunId: string;
  reconciliationType: 'INTERNAL' | 'EXTERNAL';
  currency: string;
  status: string;
  variance: number;
  variancePct: number;
  requirement: number;
  firm: {
    name: string;
    materialDiscrepancyPct?: number | null;
    materialDiscrepancyAbs?: number | null;
  };
  safeguardingAccountId?: string;
  breakAgeDays?: number;
}

function determineInternalBreachSeverity(
  variancePct: number,
  varianceAbs: number,
  materialPct?: number | null,
  materialAbs?: number | null
): BreachSeverity {
  const pctThreshold = materialPct ?? 1.0;
  const absThreshold = materialAbs ?? 1000;

  if (Math.abs(variancePct) >= pctThreshold * 5 || varianceAbs >= absThreshold * 10) return 'CRITICAL';
  if (Math.abs(variancePct) >= pctThreshold * 2 || varianceAbs >= absThreshold * 3) return 'HIGH';
  if (Math.abs(variancePct) >= pctThreshold || varianceAbs >= absThreshold) return 'MEDIUM';
  return 'LOW';
}

export async function detectBreaches(params: DetectBreachesParams): Promise<void> {
  const {
    firmId, reconciliationRunId, reconciliationType, currency,
    status, variance, variancePct, requirement, firm,
    safeguardingAccountId, breakAgeDays = 0,
  } = params;

  const absVariance = Math.abs(variance);
  const absVariancePct = Math.abs(variancePct);

  if (reconciliationType === 'INTERNAL' && status === 'SHORTFALL') {
    const materialPct = Number(firm.materialDiscrepancyPct ?? 1.0);
    const materialAbs = Number(firm.materialDiscrepancyAbs ?? 1000);

    const isMaterial = absVariancePct >= materialPct || absVariance >= materialAbs;
    const severity = determineInternalBreachSeverity(absVariancePct, absVariance, Number(firm.materialDiscrepancyPct), Number(firm.materialDiscrepancyAbs));

    // Check if a breach for this recon run + currency already exists
    const existing = await prisma.breach.findFirst({
      where: { firmId, reconciliationRunId, breachType: 'SHORTFALL', currency },
    });
    if (existing) return;

    const breach = await prisma.breach.create({
      data: {
        firmId,
        reconciliationRunId,
        breachType: 'SHORTFALL',
        severity,
        isNotifiable: isMaterial && (severity === 'HIGH' || severity === 'CRITICAL'),
        materialDiscrepancyExceeded: isMaterial,
        currency,
        shortfallAmount: Math.abs(variance),
        shortfallPercentage: absVariancePct,
        description: `Internal reconciliation shortfall detected for ${currency}. ` +
          `Requirement: ${requirement.toFixed(2)}, Resource: ${(requirement + variance).toFixed(2)}, ` +
          `Shortfall: ${Math.abs(variance).toFixed(2)} (${absVariancePct.toFixed(2)}%).`,
        status: 'DETECTED',
        dateOccurred: new Date(),
        dateIdentified: new Date(),
        breachCategory: 'SHORTFALL',
        isMaterial,
      },
    });

    await notifyBreachStakeholders(firmId, breach.id, firm.name, 'SHORTFALL', severity, breach.description);
    logger.info({ firmId, breachId: breach.id, severity }, 'SHORTFALL breach detected');
  }

  if (reconciliationType === 'EXTERNAL' && status !== 'MET' && breakAgeDays >= 2) {
    const existing = await prisma.breach.findFirst({
      where: { firmId, reconciliationRunId, breachType: 'EXTERNAL_BREAK', currency },
    });
    if (existing) return;

    const severity: BreachSeverity = breakAgeDays >= 10 ? 'CRITICAL' : breakAgeDays >= 5 ? 'HIGH' : 'MEDIUM';

    const breach = await prisma.breach.create({
      data: {
        firmId,
        reconciliationRunId,
        breachType: 'EXTERNAL_BREAK',
        severity,
        isNotifiable: breakAgeDays >= 5,
        materialDiscrepancyExceeded: false,
        currency,
        shortfallAmount: absVariance,
        shortfallPercentage: absVariancePct,
        description: `External reconciliation break for ${currency} on safeguarding account ` +
          `(${safeguardingAccountId}). Break age: ${breakAgeDays} business days. ` +
          `Variance: ${variance.toFixed(2)}.`,
        status: 'DETECTED',
        dateOccurred: new Date(),
        dateIdentified: new Date(),
        breachCategory: 'RECONCILIATION_FAILURE',
        isMaterial: false,
      },
    });

    await notifyBreachStakeholders(firmId, breach.id, firm.name, 'EXTERNAL_BREAK', severity, breach.description);
    logger.info({ firmId, breachId: breach.id, severity, breakAgeDays }, 'EXTERNAL_BREAK breach detected');
  }
}

export async function detectGovernanceBreaches(firmId: string): Promise<void> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) return;

  const today = new Date();
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  // Check for expiring/missing letters
  const accounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    include: {
      acknowledgementLetters: {
        where: { status: 'CURRENT' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  for (const account of accounts) {
    const letter = account.acknowledgementLetters[0];

    if (!letter) {
      // Missing letter
      const existing = await prisma.breach.findFirst({
        where: { firmId, breachType: 'LETTER_MISSING', status: { notIn: ['RESOLVED', 'CLOSED'] } },
      });
      if (!existing) {
        await prisma.breach.create({
          data: {
            firmId,
            breachType: 'LETTER_MISSING',
            severity: 'HIGH',
            isNotifiable: true,
            materialDiscrepancyExceeded: false,
            description: `No acknowledgement letter on file for safeguarding account ${account.bankName} (${account.accountNumberMasked}).`,
            status: 'DETECTED',
          },
        });
      }
    } else if (letter.expiryDate && letter.expiryDate < today) {
      // Expired letter
      const existing = await prisma.breach.findFirst({
        where: { firmId, breachType: 'LETTER_EXPIRED', status: { notIn: ['RESOLVED', 'CLOSED'] } },
      });
      if (!existing) {
        await prisma.breach.create({
          data: {
            firmId,
            breachType: 'LETTER_EXPIRED',
            severity: 'HIGH',
            isNotifiable: true,
            materialDiscrepancyExceeded: false,
            description: `Acknowledgement letter for ${account.bankName} (${account.accountNumberMasked}) expired on ${letter.expiryDate.toISOString().split('T')[0]}.`,
            status: 'DETECTED',
          },
        });
      }
    }
  }

  // Check for overdue DD
  const overdueDd = await prisma.thirdPartyDueDiligence.findMany({
    where: { firmId, reviewStatus: 'OVERDUE' },
  });
  for (const dd of overdueDd) {
    const existing = await prisma.breach.findFirst({
      where: { firmId, breachType: 'DD_OVERDUE', status: { notIn: ['RESOLVED', 'CLOSED'] } },
    });
    if (!existing) {
      await prisma.breach.create({
        data: {
          firmId,
          breachType: 'DD_OVERDUE',
          severity: 'MEDIUM',
          isNotifiable: false,
          materialDiscrepancyExceeded: false,
          description: `Due diligence review for ${dd.bankName} is overdue. Next review was due: ${dd.nextReviewDue.toISOString().split('T')[0]}.`,
          status: 'DETECTED',
        },
      });
    }
  }
}

async function notifyBreachStakeholders(
  firmId: string,
  breachId: string,
  firmName: string,
  breachType: string,
  severity: BreachSeverity,
  description: string
): Promise<void> {
  try {
    // Get compliance officers for this firm
    const users = await prisma.user.findMany({
      where: { firmId, role: { in: ['COMPLIANCE_OFFICER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { email: true, id: true },
    });

    for (const user of users) {
      await sendEmail({
        to: user.email,
        subject: `[Safeheld] ${severity} Breach Detected - ${breachType.replace(/_/g, ' ')}`,
        html: breachDetectedEmail({ firmName, breachType, severity, description, breachId }),
        firmId,
        userId: user.id,
        emailType: 'BREACH_ALERT',
      }).catch(() => {}); // Don't fail on email errors
    }

    // Dispatch webhooks for breach alerts
    await dispatchWebhooks(firmId, 'BREACH_DETECTED', {
      breachId,
      firmName,
      breachType,
      severity,
      description,
    }).catch(() => {});
  } catch (err) {
    logger.error({ err, breachId }, 'Failed to notify breach stakeholders');
  }
}

export async function acknowledgeBreachService(
  breachId: string,
  firmId: string,
  userId: string,
  remediationAction: string
) {
  const breach = await prisma.breach.findFirst({ where: { id: breachId, firmId } });
  if (!breach) throw new Error('Breach not found');
  if (breach.status !== 'DETECTED') throw new Error('Breach can only be acknowledged when in DETECTED state');

  return prisma.breach.update({
    where: { id: breachId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
      remediationAction,
      version: { increment: 1 },
    },
  });
}

export async function updateBreachStatusService(
  breachId: string,
  firmId: string,
  userId: string,
  newStatus: 'REMEDIATING' | 'RESOLVED' | 'CLOSED',
  evidence?: string
) {
  const breach = await prisma.breach.findFirst({ where: { id: breachId, firmId } });
  if (!breach) throw new Error('Breach not found');

  const validTransitions: Record<string, BreachStatus[]> = {
    ACKNOWLEDGED: ['REMEDIATING'],
    REMEDIATING: ['RESOLVED'],
    RESOLVED: ['CLOSED'],
    DETECTED: ['ACKNOWLEDGED'],
  };

  if (!validTransitions[breach.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${breach.status} to ${newStatus}`);
  }

  const updateData: Prisma.BreachUncheckedUpdateInput = {
    status: newStatus,
    version: { increment: 1 },
  };

  if (newStatus === 'RESOLVED') {
    updateData.resolvedAt = new Date();
    updateData.closureEvidence = evidence;
    updateData.remediationCompletionDate = new Date();
  }
  if (newStatus === 'CLOSED') {
    updateData.closedBy = userId;
    updateData.closedAt = new Date();
    updateData.closureEvidence = evidence;
  }

  const updated = await prisma.breach.update({ where: { id: breachId }, data: updateData });

  // Notify stakeholders of status change
  notifyBreachStatusChange(firmId, breachId, breach.breachType, breach.severity, breach.status, newStatus, userId).catch(() => {});

  return updated;
}

export async function createFcaNotification(
  breachId: string,
  firmId: string,
  userId: string,
  data: { notificationType: FcaNotificationType; description: string }
) {
  const breach = await prisma.breach.findFirst({ where: { id: breachId, firmId } });
  if (!breach) throw new Error('Breach not found');

  return prisma.fcaNotification.create({
    data: {
      firmId,
      breachId,
      notificationType: data.notificationType,
      description: data.description,
      status: 'DRAFT',
    },
  });
}

export async function submitFcaNotification(
  notificationId: string,
  firmId: string,
  userId: string,
  fcaReference?: string
) {
  const notification = await prisma.fcaNotification.findFirst({
    where: { id: notificationId, firmId },
  });
  if (!notification) throw new Error('FCA notification not found');
  if (notification.status !== 'DRAFT') throw new Error('Only DRAFT notifications can be submitted');

  return prisma.fcaNotification.update({
    where: { id: notificationId },
    data: {
      status: 'SUBMITTED',
      submittedBy: userId,
      submittedAt: new Date(),
      fcaReference,
    },
  });
}

async function notifyBreachStatusChange(
  firmId: string,
  breachId: string,
  breachType: BreachType,
  severity: BreachSeverity,
  previousStatus: string,
  newStatus: string,
  changedByUserId: string,
): Promise<void> {
  try {
    const [firm, changedByUser, users] = await Promise.all([
      prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: changedByUserId }, select: { name: true } }),
      prisma.user.findMany({
        where: { firmId, role: { in: ['COMPLIANCE_OFFICER', 'ADMIN'] }, status: 'ACTIVE' },
        select: { email: true, id: true },
      }),
    ]);

    for (const user of users) {
      await sendEmail({
        to: user.email,
        subject: `[Safeheld] Breach ${newStatus.replace(/_/g, ' ')} - ${breachType.replace(/_/g, ' ')}`,
        html: breachStatusChangeEmail({
          firmName: firm?.name || 'Unknown',
          breachType,
          severity,
          breachId,
          previousStatus,
          newStatus,
          changedBy: changedByUser?.name || 'System',
        }),
        firmId,
        userId: user.id,
        emailType: 'BREACH_STATUS_CHANGE',
      }).catch(() => {});
    }
    // Dispatch webhooks for status changes
    await dispatchWebhooks(firmId, 'BREACH_ESCALATED', {
      breachId,
      firmName: firm?.name || 'Unknown',
      breachType,
      severity,
      previousStatus,
      newStatus,
    }).catch(() => {});
  } catch (err) {
    logger.error({ err, breachId, newStatus }, 'Failed to notify breach status change');
  }
}

export async function getBreaches(firmId: string, filters: {
  status?: BreachStatus;
  breachType?: BreachType;
  severity?: BreachSeverity;
  isNotifiable?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const where: Prisma.BreachWhereInput = { firmId };
  if (filters.status) where.status = filters.status;
  if (filters.breachType) where.breachType = filters.breachType;
  if (filters.severity) where.severity = filters.severity;
  if (filters.isNotifiable !== undefined) where.isNotifiable = filters.isNotifiable;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [breaches, total] = await Promise.all([
    prisma.breach.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: {
        fcaNotifications: { select: { id: true, status: true, notificationType: true, submittedAt: true } },
        acknowledger: { select: { name: true } },
        closer: { select: { name: true } },
      },
    }),
    prisma.breach.count({ where }),
  ]);

  return { breaches, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── ENHANCED BREACH REGISTER FUNCTIONS ─────────────────────────────────────

export async function createManualBreach(
  firmId: string,
  data: {
    description: string;
    breachType: BreachType;
    severity: BreachSeverity;
    dateOccurred: string;
    dateIdentified: string;
    dateReportedToSeniorMgmt?: string;
    breachCategory: BreachCategory;
    rootCauseAnalysis?: string;
    personResponsible?: string;
    isMaterial: boolean;
    currency?: string;
    shortfallAmount?: number;
    remediationAction?: string;
  }
) {
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } });
  if (!firm) throw new Error('Firm not found');

  const isNotifiable = data.isMaterial && (data.severity === 'HIGH' || data.severity === 'CRITICAL');

  const breach = await prisma.breach.create({
    data: {
      firmId,
      breachType: data.breachType,
      severity: data.severity,
      isNotifiable,
      materialDiscrepancyExceeded: data.isMaterial,
      isMaterial: data.isMaterial,
      currency: data.currency || null,
      shortfallAmount: data.shortfallAmount || null,
      description: data.description,
      status: 'DETECTED',
      dateOccurred: new Date(data.dateOccurred),
      dateIdentified: new Date(data.dateIdentified),
      dateReportedToSeniorMgmt: data.dateReportedToSeniorMgmt ? new Date(data.dateReportedToSeniorMgmt) : null,
      breachCategory: data.breachCategory,
      rootCauseAnalysis: data.rootCauseAnalysis || null,
      personResponsible: data.personResponsible || null,
      remediationAction: data.remediationAction || null,
      supportingDocPaths: [],
    },
  });

  if (isNotifiable) {
    await notifyBreachStakeholders(firmId, breach.id, firm.name, data.breachType, data.severity, data.description);
  }

  logger.info({ firmId, breachId: breach.id, breachType: data.breachType }, 'Manual breach created');
  return breach;
}

export async function uploadBreachSupportingDoc(
  firmId: string,
  breachId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string }
) {
  const breach = await prisma.breach.findFirst({ where: { id: breachId, firmId } });
  if (!breach) throw new Error('Breach not found');

  const ext = file.originalname.split('.').pop() || 'bin';
  const key = `firms/${firmId}/breaches/${breachId}/docs/${crypto.randomUUID()}.${ext}`;
  const storagePath = await fileStorage.store(key, file.buffer, file.mimetype);

  const existingPaths = (Array.isArray(breach.supportingDocPaths) ? breach.supportingDocPaths : []) as string[];
  const updatedPaths = [...existingPaths, storagePath];

  const updated = await prisma.breach.update({
    where: { id: breachId },
    data: {
      supportingDocPaths: updatedPaths as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  logger.info({ firmId, breachId, storagePath }, 'Supporting document uploaded for breach');
  return { storagePath, breach: updated };
}

export async function autoCreateBreachForMissedRecon(firmId: string, missedDate: string) {
  const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } });
  if (!firm) throw new Error('Firm not found');

  // Check if a breach for this missed date already exists
  const existing = await prisma.breach.findFirst({
    where: {
      firmId,
      breachType: 'RECORD_KEEPING_FAILURE',
      breachCategory: 'RECONCILIATION_FAILURE',
      dateOccurred: new Date(missedDate),
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
  });
  if (existing) return existing;

  const breach = await prisma.breach.create({
    data: {
      firmId,
      breachType: 'RECORD_KEEPING_FAILURE',
      severity: 'HIGH',
      isNotifiable: true,
      materialDiscrepancyExceeded: false,
      isMaterial: false,
      description: `Reconciliation was not performed on scheduled reconciliation day ${missedDate}. ` +
        `PS 25 requires firms to perform internal reconciliation on each business day that is a reconciliation day.`,
      status: 'DETECTED',
      dateOccurred: new Date(missedDate),
      dateIdentified: new Date(),
      breachCategory: 'RECONCILIATION_FAILURE',
      supportingDocPaths: [],
    },
  });

  await notifyBreachStakeholders(firmId, breach.id, firm.name, 'RECORD_KEEPING_FAILURE', 'HIGH', breach.description);
  logger.info({ firmId, breachId: breach.id, missedDate }, 'Auto-created breach for missed reconciliation day');
  return breach;
}

export async function getBreachRegister(firmId: string, filters: {
  breachCategory?: BreachCategory;
  isMaterial?: boolean;
  dateFrom?: string;
  dateTo?: string;
  status?: BreachStatus;
  severity?: BreachSeverity;
  page?: number;
  pageSize?: number;
}) {
  const where: Prisma.BreachWhereInput = { firmId };

  if (filters.breachCategory) where.breachCategory = filters.breachCategory;
  if (filters.isMaterial !== undefined) where.isMaterial = filters.isMaterial;
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.dateTo + 'T23:59:59.999Z');
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [breaches, total] = await Promise.all([
    prisma.breach.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: pageSize,
      include: {
        fcaNotifications: { select: { id: true, status: true, notificationType: true, submittedAt: true } },
        acknowledger: { select: { name: true, email: true } },
        closer: { select: { name: true, email: true } },
        reconciliationRun: { select: { reconciliationDate: true, reconciliationType: true, currency: true } },
      },
    }),
    prisma.breach.count({ where }),
  ]);

  // Summary statistics
  const allBreaches = await prisma.breach.findMany({
    where: { firmId },
    select: { isMaterial: true, status: true, severity: true, breachCategory: true },
  });

  const summary = {
    total: allBreaches.length,
    open: allBreaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status)).length,
    material: allBreaches.filter(b => b.isMaterial).length,
    immaterial: allBreaches.filter(b => !b.isMaterial).length,
    bySeverity: {
      CRITICAL: allBreaches.filter(b => b.severity === 'CRITICAL').length,
      HIGH: allBreaches.filter(b => b.severity === 'HIGH').length,
      MEDIUM: allBreaches.filter(b => b.severity === 'MEDIUM').length,
      LOW: allBreaches.filter(b => b.severity === 'LOW').length,
    },
    byCategory: {
      SHORTFALL: allBreaches.filter(b => b.breachCategory === 'SHORTFALL').length,
      EXCESS: allBreaches.filter(b => b.breachCategory === 'EXCESS').length,
      RECORD_KEEPING: allBreaches.filter(b => b.breachCategory === 'RECORD_KEEPING').length,
      RECONCILIATION_FAILURE: allBreaches.filter(b => b.breachCategory === 'RECONCILIATION_FAILURE').length,
      NOTIFICATION_FAILURE: allBreaches.filter(b => b.breachCategory === 'NOTIFICATION_FAILURE').length,
      SEGREGATION_FAILURE: allBreaches.filter(b => b.breachCategory === 'SEGREGATION_FAILURE').length,
      OTHER: allBreaches.filter(b => b.breachCategory === 'OTHER').length,
    },
  };

  return { breaches, summary, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

type FcaNotificationScenario = 'records_invalid' | 'unable_to_reconcile' | 'unable_to_remedy' | 'material_difference';

export async function generateFcaNotificationTemplate(
  firmId: string,
  breachId: string,
  scenario: FcaNotificationScenario
) {
  const [firm, breach] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: { name: true, fcaFrn: true, regime: true, safeguardingMethod: true, baseCurrency: true },
    }),
    prisma.breach.findFirst({
      where: { id: breachId, firmId },
      include: { reconciliationRun: true },
    }),
  ]);

  if (!firm) throw new Error('Firm not found');
  if (!breach) throw new Error('Breach not found');

  const today = new Date().toISOString().split('T')[0];
  const breachDate = breach.dateOccurred
    ? breach.dateOccurred.toISOString().split('T')[0]
    : breach.createdAt.toISOString().split('T')[0];
  const identifiedDate = breach.dateIdentified
    ? breach.dateIdentified.toISOString().split('T')[0]
    : breach.createdAt.toISOString().split('T')[0];

  const scenarioTemplates: Record<FcaNotificationScenario, { subject: string; body: string; regulation: string }> = {
    records_invalid: {
      subject: 'Notification under Electronic Money Regulations / Payment Services Regulations - Records Found to be Inaccurate or Incomplete',
      regulation: 'Regulation 21(4) EMR 2011 / Regulation 23(13) PSR 2017',
      body: `Dear Sir/Madam,

We are writing to notify the Financial Conduct Authority that ${firm.name} (FRN: ${firm.fcaFrn || '[FRN]'}) has identified that its records relating to safeguarded funds are inaccurate or incomplete.

Date of occurrence: ${breachDate}
Date identified: ${identifiedDate}

Description of the issue:
${breach.description}

${breach.rootCauseAnalysis ? `Root cause analysis:\n${breach.rootCauseAnalysis}\n` : ''}
The inaccuracy/incompleteness relates to:
[Describe specific records affected, e.g., client ledger entries, bank reconciliation records, transaction records]

Impact assessment:
- Affected currency: ${breach.currency || '[Currency]'}
${breach.shortfallAmount ? `- Amount affected: ${Number(breach.shortfallAmount).toFixed(2)}` : '- Amount affected: [Amount]'}
- Material discrepancy threshold exceeded: ${breach.materialDiscrepancyExceeded ? 'Yes' : 'No'}

Remedial steps taken or planned:
${breach.remediationAction || '[Describe remedial steps]'}

We confirm that we are taking all necessary steps to rectify this matter and will keep the FCA informed of progress.

Yours faithfully,

[Name]
[Title]
${firm.name}
Date: ${today}`,
    },

    unable_to_reconcile: {
      subject: 'Notification under Electronic Money Regulations / Payment Services Regulations - Unable to Perform Reconciliation',
      regulation: 'Regulation 21(4) EMR 2011 / Regulation 23(13) PSR 2017',
      body: `Dear Sir/Madam,

We are writing to notify the Financial Conduct Authority that ${firm.name} (FRN: ${firm.fcaFrn || '[FRN]'}) has been unable to perform its required reconciliation of safeguarded funds.

Date reconciliation was due: ${breachDate}
Date issue identified: ${identifiedDate}

Description of the issue:
${breach.description}

${breach.rootCauseAnalysis ? `Root cause analysis:\n${breach.rootCauseAnalysis}\n` : ''}
Reason for inability to reconcile:
[Describe reason - e.g., system failure, missing data, bank statement unavailability]

Duration of non-compliance:
[Number of business days reconciliation has not been performed]

Impact assessment:
- Last successful reconciliation date: [Date]
- Safeguarding method: ${firm.safeguardingMethod.replace(/_/g, ' ')}
- Estimated funds at risk: [Amount]

Remedial steps taken or planned:
${breach.remediationAction || '[Describe remedial steps and expected resolution date]'}

We confirm that we are taking all necessary steps to restore our reconciliation capability and will keep the FCA informed of progress.

Yours faithfully,

[Name]
[Title]
${firm.name}
Date: ${today}`,
    },

    unable_to_remedy: {
      subject: 'Notification under Electronic Money Regulations / Payment Services Regulations - Unable to Remedy Discrepancy',
      regulation: 'Regulation 21(4) EMR 2011 / Regulation 23(13) PSR 2017',
      body: `Dear Sir/Madam,

We are writing to notify the Financial Conduct Authority that ${firm.name} (FRN: ${firm.fcaFrn || '[FRN]'}) has identified a discrepancy in its safeguarded funds that it has been unable to remedy by close of business on the next business day.

Date discrepancy first identified: ${identifiedDate}
Date of occurrence: ${breachDate}
Business days since identification: [Number]

Description of the discrepancy:
${breach.description}

${breach.rootCauseAnalysis ? `Root cause analysis:\n${breach.rootCauseAnalysis}\n` : ''}
Nature of the discrepancy:
- Type: ${breach.breachType.replace(/_/g, ' ')}
- Category: ${breach.breachCategory?.replace(/_/g, ' ') || '[Category]'}
- Affected currency: ${breach.currency || '[Currency]'}
${breach.shortfallAmount ? `- Discrepancy amount: ${Number(breach.shortfallAmount).toFixed(2)}` : '- Discrepancy amount: [Amount]'}
- Material: ${breach.isMaterial ? 'Yes' : 'No'}

Steps taken to remedy:
${breach.remediationAction || '[Describe all steps taken to date]'}

Expected resolution:
[Describe expected timeline and approach]

We confirm that we continue to take all necessary steps to remedy this discrepancy and will keep the FCA informed of progress.

Yours faithfully,

[Name]
[Title]
${firm.name}
Date: ${today}`,
    },

    material_difference: {
      subject: 'Notification under Electronic Money Regulations / Payment Services Regulations - Material Difference Identified',
      regulation: 'Regulation 21(4) EMR 2011 / Regulation 23(13) PSR 2017',
      body: `Dear Sir/Madam,

We are writing to notify the Financial Conduct Authority that ${firm.name} (FRN: ${firm.fcaFrn || '[FRN]'}) has identified a material difference between the amount of safeguarded funds required to be held and the amount actually safeguarded.

Date of identification: ${identifiedDate}
Date of occurrence: ${breachDate}

Description of the material difference:
${breach.description}

${breach.rootCauseAnalysis ? `Root cause analysis:\n${breach.rootCauseAnalysis}\n` : ''}
Quantification of the material difference:
- Affected currency: ${breach.currency || '[Currency]'}
- Amount required to be safeguarded: [Amount]
- Amount actually safeguarded: [Amount]
${breach.shortfallAmount ? `- Shortfall/Excess: ${Number(breach.shortfallAmount).toFixed(2)}` : '- Shortfall/Excess: [Amount]'}
${breach.shortfallPercentage ? `- Percentage difference: ${Number(breach.shortfallPercentage).toFixed(4)}%` : '- Percentage difference: [Percentage]'}

Cause of the material difference:
${breach.rootCauseAnalysis || '[Describe root cause]'}

Person responsible: ${breach.personResponsible || '[Name and title]'}

${breach.dateReportedToSeniorMgmt ? `Date reported to senior management: ${breach.dateReportedToSeniorMgmt.toISOString().split('T')[0]}` : 'Date reported to senior management: [Date]'}

Remedial steps taken or planned:
${breach.remediationAction || '[Describe all remedial steps]'}

Consumer impact assessment:
[Describe any impact on consumers and steps taken to protect them]

We confirm that we are taking all necessary steps to remedy this material difference and will keep the FCA informed of progress.

Yours faithfully,

[Name]
[Title]
${firm.name}
Date: ${today}`,
    },
  };

  const template = scenarioTemplates[scenario];

  return {
    scenario,
    regulation: template.regulation,
    subject: template.subject,
    body: template.body,
    firmName: firm.name,
    firmFrn: firm.fcaFrn,
    breachId: breach.id,
    breachType: breach.breachType,
    breachCategory: breach.breachCategory,
    generatedAt: new Date().toISOString(),
  };
}
