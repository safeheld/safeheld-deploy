import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import {
  ThirdPartyType,
  DueDiligenceOutcome,
  DueDiligenceReviewStatus,
} from '@prisma/client';

// ─── Third-Party Register ───────────────────────────────────────────────────

export interface CreateThirdPartyData {
  name: string;
  partyType: ThirdPartyType;
  jurisdiction?: string;
  dateAppointed: string; // YYYY-MM-DD
  servicesProvided?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  linkedSafeguardingAccountId?: string;
}

export async function getThirdPartyRegister(firmId: string) {
  const parties = await prisma.thirdPartyRegister.findMany({
    where: { firmId },
    orderBy: [{ isActive: 'desc' }, { dateAppointed: 'desc' }],
  });
  return parties;
}

export async function createThirdParty(firmId: string, data: CreateThirdPartyData) {
  const party = await prisma.thirdPartyRegister.create({
    data: {
      firmId,
      name: data.name,
      partyType: data.partyType,
      jurisdiction: data.jurisdiction,
      dateAppointed: new Date(data.dateAppointed),
      servicesProvided: data.servicesProvided,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      linkedSafeguardingAccountId: data.linkedSafeguardingAccountId,
    },
  });

  logger.info({ firmId, partyId: party.id, name: data.name }, 'Third party created');
  return party;
}

export async function updateThirdParty(
  firmId: string,
  partyId: string,
  data: Partial<Omit<CreateThirdPartyData, 'dateAppointed'>> & { isActive?: boolean; dateAppointed?: string },
) {
  const existing = await prisma.thirdPartyRegister.findFirst({
    where: { id: partyId, firmId },
  });
  if (!existing) throw new NotFoundError('Third party');

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.partyType !== undefined) updateData.partyType = data.partyType;
  if (data.jurisdiction !== undefined) updateData.jurisdiction = data.jurisdiction;
  if (data.dateAppointed !== undefined) updateData.dateAppointed = new Date(data.dateAppointed);
  if (data.servicesProvided !== undefined) updateData.servicesProvided = data.servicesProvided;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
  if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
  if (data.linkedSafeguardingAccountId !== undefined) updateData.linkedSafeguardingAccountId = data.linkedSafeguardingAccountId;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const updated = await prisma.thirdPartyRegister.update({
    where: { id: partyId },
    data: updateData,
  });

  logger.info({ firmId, partyId }, 'Third party updated');
  return updated;
}

// ─── Due Diligence Assessment ───────────────────────────────────────────────

export interface CreateDueDiligenceData {
  safeguardingAccountId: string;
  bankName: string;
  initialDdDate: string;
  lastReviewDate: string;
  nextReviewDue: string;
  creditworthinessAssessment?: string;
  financialStabilityAssessment?: string;
  regulatoryStatusAssessment?: string;
  serviceQualityAssessment?: string;
  jurisdictionRiskAssessment?: string;
  diversificationConsidered?: boolean;
  ddOutcome: DueDiligenceOutcome;
  approvedByName?: string;
  approvedByRole?: string;
}

export async function createDueDiligenceAssessment(
  firmId: string,
  partyId: string,
  data: CreateDueDiligenceData,
) {
  // Verify third party exists and is linked to firm
  const party = await prisma.thirdPartyRegister.findFirst({
    where: { id: partyId, firmId },
  });
  if (!party) throw new NotFoundError('Third party');

  const nextReviewDue = new Date(data.nextReviewDue);
  const today = new Date();
  const reviewStatus: DueDiligenceReviewStatus = nextReviewDue < today
    ? 'OVERDUE'
    : nextReviewDue < new Date(today.getTime() + 30 * 86400000)
      ? 'DUE'
      : 'CURRENT';

  const dd = await prisma.thirdPartyDueDiligence.create({
    data: {
      firmId,
      safeguardingAccountId: data.safeguardingAccountId,
      bankName: data.bankName,
      initialDdDate: new Date(data.initialDdDate),
      lastReviewDate: new Date(data.lastReviewDate),
      nextReviewDue,
      reviewStatus,
      creditworthinessAssessment: data.creditworthinessAssessment,
      financialStabilityAssessment: data.financialStabilityAssessment,
      regulatoryStatusAssessment: data.regulatoryStatusAssessment,
      serviceQualityAssessment: data.serviceQualityAssessment,
      jurisdictionRiskAssessment: data.jurisdictionRiskAssessment,
      diversificationConsidered: data.diversificationConsidered ?? false,
      ddOutcome: data.ddOutcome,
      approvedByName: data.approvedByName,
      approvedByRole: data.approvedByRole,
      approvedDate: data.approvedByName ? new Date() : null,
    },
  });

  logger.info({ firmId, partyId, ddId: dd.id }, 'Due diligence assessment created');
  return dd;
}

// ─── Diversification Assessment ─────────────────────────────────────────────

export async function getDiversificationAssessment(firmId: string) {
  const latest = await prisma.diversificationAssessment.findFirst({
    where: { firmId },
    orderBy: { assessmentDate: 'desc' },
  });
  return latest;
}

export interface CreateDiversificationData {
  isDiversified: boolean;
  rationale: string;
  assessedBy: string;
}

export async function createDiversificationAssessment(
  firmId: string,
  data: CreateDiversificationData,
) {
  // Auto-flag if only one bank used
  const distinctBanks = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    select: { bankName: true },
    distinct: ['bankName'],
  });

  const singleBankFlag = distinctBanks.length <= 1;

  const assessment = await prisma.diversificationAssessment.create({
    data: {
      firmId,
      assessmentDate: new Date(),
      isDiversified: data.isDiversified,
      rationale: data.rationale,
      singleBankFlag,
      assessedBy: data.assessedBy,
    },
  });

  logger.info({ firmId, assessmentId: assessment.id, singleBankFlag }, 'Diversification assessment created');
  return assessment;
}

// ─── DD Alerts ──────────────────────────────────────────────────────────────

export interface DueDiligenceAlert {
  type: 'OVERDUE_REVIEW' | 'DUE_SOON';
  severity: 'HIGH' | 'MEDIUM';
  ddId: string;
  bankName: string;
  nextReviewDue: Date;
  daysPastDue?: number;
  message: string;
}

export async function getDueDiligenceAlerts(firmId: string): Promise<DueDiligenceAlert[]> {
  const records = await prisma.thirdPartyDueDiligence.findMany({
    where: {
      firmId,
      reviewStatus: { in: ['OVERDUE', 'DUE'] },
    },
    orderBy: { nextReviewDue: 'asc' },
  });

  const today = new Date();
  const alerts: DueDiligenceAlert[] = [];

  for (const dd of records) {
    if (dd.reviewStatus === 'OVERDUE') {
      const daysPastDue = Math.floor(
        (today.getTime() - dd.nextReviewDue.getTime()) / (1000 * 60 * 60 * 24),
      );
      alerts.push({
        type: 'OVERDUE_REVIEW',
        severity: 'HIGH',
        ddId: dd.id,
        bankName: dd.bankName,
        nextReviewDue: dd.nextReviewDue,
        daysPastDue,
        message: `Due diligence review for ${dd.bankName} is ${daysPastDue} day(s) overdue.`,
      });
    } else if (dd.reviewStatus === 'DUE') {
      alerts.push({
        type: 'DUE_SOON',
        severity: 'MEDIUM',
        ddId: dd.id,
        bankName: dd.bankName,
        nextReviewDue: dd.nextReviewDue,
        message: `Due diligence review for ${dd.bankName} is due by ${dd.nextReviewDue.toISOString().split('T')[0]}.`,
      });
    }
  }

  return alerts;
}
