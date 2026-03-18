import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

export async function generateCertificate(reconciliationRunId: string): Promise<string | null> {
  const run = await prisma.reconciliationRun.findUnique({
    where: { id: reconciliationRunId },
    include: {
      firm: { select: { id: true, name: true, regime: true, fcaFrn: true } },
      rulePack: { select: { name: true } },
    },
  });

  if (!run) {
    logger.warn({ reconciliationRunId }, 'Cannot generate certificate: run not found');
    return null;
  }

  // Only generate for successful reconciliations (MET or EXCESS)
  if (run.status !== 'MET' && run.status !== 'EXCESS') {
    return null;
  }

  // Rules engine gate: certificate only issued when eligible
  if (run.certificateEligible === false) {
    logger.info({ reconciliationRunId, complianceScore: run.complianceScore }, 'Certificate blocked: rules engine determined not eligible');
    return null;
  }

  const clientFunds = toNum(run.totalRequirement);
  const safeguardedFunds = toNum(run.totalResource);
  const variance = toNum(run.variance);
  const coverageRatio = clientFunds === 0 ? 1 : safeguardedFunds / clientFunds;
  const issuedAt = new Date();

  // Compute SHA-256 hash over: firm_id + reconciliation_run_id + issued_at + client_funds + safeguarded_funds + variance
  const hashInput = [
    run.firmId,
    reconciliationRunId,
    issuedAt.toISOString(),
    clientFunds.toFixed(2),
    safeguardedFunds.toFixed(2),
    variance.toFixed(2),
  ].join('|');

  const sha256Hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  const certificateData = {
    version: '1.0',
    type: 'SAFEGUARDING_VERIFICATION',
    firm: {
      id: run.firm.id,
      name: run.firm.name,
      regime: run.firm.regime,
      fcaFrn: run.firm.fcaFrn,
    },
    reconciliation: {
      id: reconciliationRunId,
      date: run.reconciliationDate.toISOString().split('T')[0],
      type: run.reconciliationType,
      currency: run.currency,
      status: run.status,
    },
    financials: {
      clientFunds: clientFunds.toFixed(2),
      safeguardedFunds: safeguardedFunds.toFixed(2),
      variance: variance.toFixed(2),
      coverageRatio: parseFloat(coverageRatio.toFixed(4)),
    },
    framework: run.rulePack?.name || run.firm.regime,
    compliance: {
      score: run.complianceScore,
      rulesEngineVersion: run.rulesEngineVersion,
      frameworkRulesApplied: run.frameworkRulesApplied,
      certificateStatus: (run.frameworkRulesApplied as Record<string, unknown>)?.certificateStatus || 'FULLY_COMPLIANT',
    },
    issuedAt: issuedAt.toISOString(),
    sha256Hash,
    verificationUrl: `https://safeheld.com/api/v1/certificates/${sha256Hash}/verify`,
  };

  const certificate = await prisma.verificationCertificate.create({
    data: {
      firmId: run.firmId,
      reconciliationRunId,
      issuedAt,
      clientFunds,
      safeguardedFunds,
      variance,
      coverageRatio: parseFloat(coverageRatio.toFixed(4)),
      framework: run.rulePack?.name || run.firm.regime,
      status: 'VALID',
      sha256Hash,
      certificateData,
    },
  });

  logger.info({ certificateId: certificate.id, sha256Hash, firmId: run.firmId }, 'Verification certificate generated');

  return certificate.id;
}

export async function verifyCertificate(identifier: string) {
  // Determine if identifier is a UUID or a SHA-256 hash
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const where = isUuid
    ? { OR: [{ id: identifier }, { sha256Hash: identifier }] }
    : { sha256Hash: identifier };

  const certificate = await prisma.verificationCertificate.findFirst({
    where,
    include: {
      firm: { select: { name: true, regime: true, fcaFrn: true } },
      reconciliationRun: {
        select: {
          reconciliationDate: true,
          reconciliationType: true,
          currency: true,
          status: true,
        },
      },
    },
  });

  if (!certificate) return null;

  // Recompute the hash to prove integrity
  const hashInput = [
    certificate.firmId,
    certificate.reconciliationRunId,
    certificate.issuedAt.toISOString(),
    toNum(certificate.clientFunds).toFixed(2),
    toNum(certificate.safeguardedFunds).toFixed(2),
    toNum(certificate.variance).toFixed(2),
  ].join('|');

  const recomputedHash = crypto.createHash('sha256').update(hashInput).digest('hex');
  const integrityValid = recomputedHash === certificate.sha256Hash;

  return {
    certificate: {
      id: certificate.id,
      status: certificate.status,
      issuedAt: certificate.issuedAt,
      sha256Hash: certificate.sha256Hash,
      integrityValid,
      firm: {
        name: certificate.firm.name,
        regime: certificate.firm.regime,
        fcaFrn: certificate.firm.fcaFrn,
      },
      reconciliation: {
        date: certificate.reconciliationRun.reconciliationDate,
        type: certificate.reconciliationRun.reconciliationType,
        currency: certificate.reconciliationRun.currency,
        status: certificate.reconciliationRun.status,
      },
      financials: {
        clientFunds: toNum(certificate.clientFunds).toFixed(2),
        safeguardedFunds: toNum(certificate.safeguardedFunds).toFixed(2),
        variance: toNum(certificate.variance).toFixed(2),
        coverageRatio: toNum(certificate.coverageRatio),
      },
      framework: certificate.framework,
      certificateData: certificate.certificateData,
    },
  };
}

export async function getCertificatesForFirm(
  firmId: string,
  filters: { page?: number; pageSize?: number }
) {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const skip = (page - 1) * pageSize;

  const [certificates, total] = await Promise.all([
    prisma.verificationCertificate.findMany({
      where: { firmId },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        issuedAt: true,
        clientFunds: true,
        safeguardedFunds: true,
        variance: true,
        coverageRatio: true,
        framework: true,
        status: true,
        sha256Hash: true,
      },
    }),
    prisma.verificationCertificate.count({ where: { firmId } }),
  ]);

  return { certificates, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
