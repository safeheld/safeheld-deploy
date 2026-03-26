import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import {
  InsuranceCoverageType,
  InsuranceStatus,
  InsuranceContingencyStatus,
} from '@prisma/client';

// ─── List Insurance Policies ────────────────────────────────────────────────

export async function getInsurancePolicies(firmId: string) {
  const policies = await prisma.insuranceGuarantee.findMany({
    where: { firmId },
    orderBy: { expiryDate: 'asc' },
  });

  const today = new Date();

  return policies.map((p) => ({
    ...p,
    coverageAmount: Number(p.coverageAmount),
    premium: p.premium ? Number(p.premium) : null,
    daysUntilExpiry: Math.ceil(
      (p.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    ),
  }));
}

// ─── Create Insurance Policy ────────────────────────────────────────────────

export interface CreateInsurancePolicyData {
  insurerName: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  coverageAmount: number;
  coverageCurrency: string;
  effectiveDate: string;
  expiryDate: string;
  contingencyPlanRequiredBy: string;
  premium?: number;
  hasRestrictiveConditions?: boolean;
  restrictiveConditionDetails?: string;
  switchToSegregationPlan?: string;
}

export async function createInsurancePolicy(firmId: string, data: CreateInsurancePolicyData) {
  const expiryDate = new Date(data.expiryDate);
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 86400000);

  // Auto-flag restrictive conditions beyond insolvency certification (CASS 15.5.4R(2))
  const hasRestrictiveConditions = data.hasRestrictiveConditions ?? false;

  // Determine status
  let status: InsuranceStatus;
  if (expiryDate < today) {
    status = 'EXPIRED';
  } else if (expiryDate < in30Days) {
    status = 'EXPIRING';
  } else {
    status = 'ACTIVE';
  }

  const policy = await prisma.insuranceGuarantee.create({
    data: {
      firmId,
      insurerName: data.insurerName,
      policyNumber: data.policyNumber,
      coverageType: data.coverageType,
      coverageAmount: data.coverageAmount,
      coverageCurrency: data.coverageCurrency.toUpperCase(),
      effectiveDate: new Date(data.effectiveDate),
      expiryDate,
      contingencyPlanRequiredBy: new Date(data.contingencyPlanRequiredBy),
      contingencyPlanStatus: 'NOT_DUE',
      premium: data.premium,
      hasRestrictiveConditions,
      restrictiveConditionDetails: data.restrictiveConditionDetails,
      switchToSegregationPlan: data.switchToSegregationPlan,
      status,
    },
  });

  logger.info(
    { firmId, policyId: policy.id, hasRestrictiveConditions },
    hasRestrictiveConditions
      ? 'Insurance policy created with restrictive conditions flag (CASS 15.5.4R(2) concern)'
      : 'Insurance policy created',
  );

  return {
    ...policy,
    coverageAmount: Number(policy.coverageAmount),
    premium: policy.premium ? Number(policy.premium) : null,
    restrictiveConditionsWarning: hasRestrictiveConditions
      ? 'WARNING: This policy has conditions beyond insolvency certification. Per CASS 15.5.4R(2), insurance/guarantee policies should not contain restrictive conditions beyond the requirement for insolvency certification.'
      : null,
  };
}

// ─── Expiry Management ──────────────────────────────────────────────────────

export interface ExpiryManagementItem {
  id: string;
  insurerName: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  coverageAmount: number;
  expiryDate: Date;
  daysUntilExpiry: number;
  threeMonthCountdownActive: boolean;
  decisionMade: boolean;
  decisionDate: Date | null;
  fcaNotifiedBeforeFirstUse: boolean;
  contingencyPlanStatus: InsuranceContingencyStatus;
  switchToSegregationPlan: string | null;
  criticalRisk: boolean;
  status: InsuranceStatus;
}

export async function getExpiryManagement(firmId: string) {
  const policies = await prisma.insuranceGuarantee.findMany({
    where: { firmId, status: { in: ['ACTIVE', 'EXPIRING'] } },
    orderBy: { expiryDate: 'asc' },
  });

  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 86400000);

  // Check if firm can safeguard all through segregation
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { safeguardingMethod: true },
  });
  const isInsuranceOnly = firm?.safeguardingMethod === 'INSURANCE' || firm?.safeguardingMethod === 'GUARANTEE';

  const items: ExpiryManagementItem[] = policies.map((p) => {
    const daysUntilExpiry = Math.ceil(
      (p.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const threeMonthCountdownActive = p.expiryDate <= in90Days;
    const criticalRisk = isInsuranceOnly && threeMonthCountdownActive && !p.decisionMade;

    return {
      id: p.id,
      insurerName: p.insurerName,
      policyNumber: p.policyNumber,
      coverageType: p.coverageType,
      coverageAmount: Number(p.coverageAmount),
      expiryDate: p.expiryDate,
      daysUntilExpiry,
      threeMonthCountdownActive,
      decisionMade: p.decisionMade,
      decisionDate: p.decisionDate,
      fcaNotifiedBeforeFirstUse: p.fcaNotifiedBeforeFirstUse,
      contingencyPlanStatus: p.contingencyPlanStatus,
      switchToSegregationPlan: p.switchToSegregationPlan,
      criticalRisk,
      status: p.status,
    };
  });

  const summary = {
    totalPolicies: items.length,
    expiringWithin90Days: items.filter((i) => i.threeMonthCountdownActive).length,
    decisionsPending: items.filter((i) => i.threeMonthCountdownActive && !i.decisionMade).length,
    criticalRisks: items.filter((i) => i.criticalRisk).length,
    isInsuranceOnly,
  };

  return { summary, policies: items };
}

// ─── Record Expiry Decision ─────────────────────────────────────────────────

export interface RecordExpiryDecisionData {
  decision: 'CONTINUE' | 'SWITCH_PROVIDER' | 'SWITCH_TO_SEGREGATION';
  fcaNotified: boolean;
  fcaNotificationDate?: string;
  contingencyPlan?: string;
}

export async function recordExpiryDecision(
  firmId: string,
  policyId: string,
  data: RecordExpiryDecisionData,
) {
  const policy = await prisma.insuranceGuarantee.findFirst({
    where: { id: policyId, firmId },
  });
  if (!policy) throw new NotFoundError('Insurance policy');

  const updateData: Record<string, unknown> = {
    decisionMade: true,
    decisionDate: new Date(),
  };

  if (data.fcaNotified && data.fcaNotificationDate) {
    updateData.fcaChangeNotificationDate = new Date(data.fcaNotificationDate);
  }

  if (data.contingencyPlan) {
    updateData.switchToSegregationPlan = data.contingencyPlan;
  }

  if (data.decision === 'SWITCH_TO_SEGREGATION') {
    updateData.contingencyPlanStatus = 'FILED';
  }

  const updated = await prisma.insuranceGuarantee.update({
    where: { id: policyId },
    data: updateData,
  });

  logger.info({ firmId, policyId, decision: data.decision }, 'Expiry decision recorded');

  return {
    ...updated,
    coverageAmount: Number(updated.coverageAmount),
    premium: updated.premium ? Number(updated.premium) : null,
  };
}

// ─── FCA Notification Tracking ──────────────────────────────────────────────

export interface FcaNotificationItem {
  policyId: string;
  insurerName: string;
  policyNumber: string;
  notificationType: 'FIRST_USE' | 'CHANGE_OF_COVER' | 'CHANGE_OF_PROVIDER';
  notificationRequired: boolean;
  notificationDate: Date | null;
  dueDate: Date | null;
  status: 'COMPLETE' | 'PENDING' | 'OVERDUE';
}

export async function getFcaNotificationTracking(firmId: string): Promise<FcaNotificationItem[]> {
  const policies = await prisma.insuranceGuarantee.findMany({
    where: { firmId },
    orderBy: { effectiveDate: 'desc' },
  });

  const notifications: FcaNotificationItem[] = [];
  const today = new Date();

  for (const p of policies) {
    // First-use notification (required 2 months before first use)
    const twoMonthsBefore = new Date(p.effectiveDate);
    twoMonthsBefore.setMonth(twoMonthsBefore.getMonth() - 2);

    const firstUseStatus = p.fcaNotifiedBeforeFirstUse
      ? 'COMPLETE'
      : today > p.effectiveDate
        ? 'OVERDUE'
        : 'PENDING';

    notifications.push({
      policyId: p.id,
      insurerName: p.insurerName,
      policyNumber: p.policyNumber,
      notificationType: 'FIRST_USE',
      notificationRequired: true,
      notificationDate: p.fcaFirstUseNotificationDate,
      dueDate: twoMonthsBefore,
      status: firstUseStatus,
    });

    // Change of cover/provider notification
    if (p.fcaChangeNotificationDate) {
      notifications.push({
        policyId: p.id,
        insurerName: p.insurerName,
        policyNumber: p.policyNumber,
        notificationType: 'CHANGE_OF_COVER',
        notificationRequired: true,
        notificationDate: p.fcaChangeNotificationDate,
        dueDate: null,
        status: 'COMPLETE',
      });
    }
  }

  return notifications;
}
