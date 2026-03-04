import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { sendEmail, breachDetectedEmail, breachStatusChangeEmail } from '../../utils/email';
import {
  BreachType,
  BreachSeverity,
  BreachStatus,
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
