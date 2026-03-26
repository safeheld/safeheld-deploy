import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { hashSHA256 } from '../../utils/crypto';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../../utils/errors';
import { computeRAG, type RAGStatus } from '../bank-dashboard/service';

// ─── API Key Authentication ─────────────────────────────────────────────────

export interface BankApiAuth {
  bankInstitutionId: string;
  bankName: string;
  apiKeyId: string;
}

export async function authenticateBankApiKey(apiKey: string): Promise<BankApiAuth> {
  if (!apiKey || apiKey.length < 10) {
    throw new AuthenticationError('Invalid API key');
  }

  const keyHash = hashSHA256(apiKey);

  const bankApiKey = await prisma.bankApiKey.findUnique({
    where: { keyHash },
  });

  if (!bankApiKey) {
    throw new AuthenticationError('Invalid API key');
  }

  if (!bankApiKey.isActive) {
    throw new AuthorizationError('API key has been deactivated');
  }

  if (bankApiKey.expiresAt && bankApiKey.expiresAt < new Date()) {
    throw new AuthorizationError('API key has expired');
  }

  // Update last used timestamp
  await prisma.bankApiKey.update({
    where: { id: bankApiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // Resolve bank institution
  const bank = await prisma.bankInstitution.findUnique({
    where: { id: bankApiKey.bankInstitutionId },
    select: { id: true, name: true, status: true },
  });

  if (!bank || bank.status !== 'ACTIVE') {
    throw new AuthorizationError('Bank institution is not active');
  }

  return {
    bankInstitutionId: bank.id,
    bankName: bank.name,
    apiKeyId: bankApiKey.id,
  };
}

// ─── Create API Key ─────────────────────────────────────────────────────────

export async function createBankApiKey(bankInstitutionId: string, label: string) {
  const bank = await prisma.bankInstitution.findUnique({
    where: { id: bankInstitutionId },
  });
  if (!bank) throw new NotFoundError('Bank institution');

  // Generate secure API key
  const rawKey = `shbk_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = hashSHA256(rawKey);
  const keyPrefix = rawKey.substring(0, 10);

  const apiKey = await prisma.bankApiKey.create({
    data: {
      bankInstitutionId,
      keyHash,
      keyPrefix,
      label,
      isActive: true,
      rateLimitPerMin: 60,
    },
  });

  logger.info({ bankInstitutionId, apiKeyId: apiKey.id, label }, 'Bank API key created');

  // Return plaintext key ONCE
  return {
    id: apiKey.id,
    key: rawKey,
    keyPrefix,
    label,
    createdAt: apiKey.createdAt,
    rateLimitPerMin: apiKey.rateLimitPerMin,
    message: 'Store this API key securely. It will not be shown again.',
  };
}

// ─── Portfolio View ─────────────────────────────────────────────────────────

export async function getBankPortfolioView(bankInstitutionId: string) {
  const links = await prisma.bankInstitutionFirm.findMany({
    where: { bankInstitutionId },
    include: {
      firm: {
        select: { id: true, name: true, regime: true, safeguardingMethod: true },
      },
    },
  });

  if (links.length === 0) {
    return {
      totalFunds: 0,
      firmCount: 0,
      shortfalls: 0,
      overdueRecons: 0,
      riskHeatmap: [],
    };
  }

  const firmIds = links.map((l) => l.firmId);

  const [reconRuns, openBreaches, accounts, latestRecons] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where: { firmId: { in: firmIds } },
      orderBy: { reconciliationDate: 'desc' },
      select: { firmId: true, reconciliationDate: true, status: true },
    }),
    prisma.breach.findMany({
      where: { firmId: { in: firmIds }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: { firmId: true, severity: true },
    }),
    prisma.safeguardingAccount.findMany({
      where: { firmId: { in: firmIds }, status: 'ACTIVE' },
      select: {
        firmId: true,
        letterStatus: true,
        acknowledgementLetters: {
          where: { status: 'CURRENT' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { status: true, expiryDate: true },
        },
      },
    }),
    prisma.reconciliationRun.findMany({
      where: { firmId: { in: firmIds }, status: 'SHORTFALL' },
      select: { firmId: true },
    }),
  ]);

  // Aggregate total funds
  const totalFundsAgg = await prisma.bankInstitutionFirm.aggregate({
    where: { bankInstitutionId },
    _sum: { totalFundsHeld: true },
  });

  // Count shortfalls (distinct firms with shortfall)
  const firmShortfalls = new Set(latestRecons.map((r) => r.firmId));

  // Count overdue recons (firms where last recon > 2 days old)
  const reconByFirm = new Map<string, Date>();
  for (const run of reconRuns) {
    if (!reconByFirm.has(run.firmId)) {
      reconByFirm.set(run.firmId, run.reconciliationDate);
    }
  }
  const today = new Date();
  let overdueRecons = 0;
  for (const fid of firmIds) {
    const lastReconDate = reconByFirm.get(fid);
    if (!lastReconDate) {
      overdueRecons++;
    } else {
      const daysSince = Math.floor(
        (today.getTime() - lastReconDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince >= 2) overdueRecons++;
    }
  }

  // Risk heatmap
  const riskHeatmap: Array<{
    firmId: string;
    firmName: string;
    regime: string;
    ragStatus: RAGStatus;
    totalFundsHeld: number;
    openBreachCount: number;
  }> = [];

  for (const link of links) {
    const { firm } = link;
    const firmBreaches = openBreaches.filter((b) => b.firmId === firm.id);
    const firmAccounts = accounts.filter((a) => a.firmId === firm.id);
    const lastRecon = reconByFirm.get(firm.id) ?? null;

    const latestLetters = firmAccounts.flatMap((a) =>
      a.acknowledgementLetters.map((l) => ({ status: l.status, expiryDate: l.expiryDate })),
    );

    const ragStatus = computeRAG({
      lastReconStatus: null,
      lastReconDate: lastRecon,
      openBreaches: firmBreaches,
      latestLetters,
    });

    riskHeatmap.push({
      firmId: firm.id,
      firmName: firm.name,
      regime: firm.regime,
      ragStatus,
      totalFundsHeld: Number(link.totalFundsHeld),
      openBreachCount: firmBreaches.length,
    });
  }

  // Sort: RED first, then AMBER, then GREEN
  const ragOrder: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };
  riskHeatmap.sort((a, b) => (ragOrder[a.ragStatus] ?? 99) - (ragOrder[b.ragStatus] ?? 99));

  return {
    totalFunds: Number(totalFundsAgg._sum.totalFundsHeld ?? 0),
    firmCount: links.length,
    shortfalls: firmShortfalls.size,
    overdueRecons,
    riskHeatmap,
  };
}

// ─── Firm View ──────────────────────────────────────────────────────────────

export async function getBankFirmView(bankInstitutionId: string, firmId: string) {
  // Verify bank has access to this firm
  const link = await prisma.bankInstitutionFirm.findUnique({
    where: { bankInstitutionId_firmId: { bankInstitutionId, firmId } },
  });
  if (!link) throw new AuthorizationError('Firm is not linked to this bank institution');

  const [firm, latestRecon, breaches, accounts, monthlyReturn] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        regime: true,
        safeguardingMethod: true,
        auditRequirementStatus: true,
      },
    }),
    prisma.reconciliationRun.findFirst({
      where: { firmId },
      orderBy: { reconciliationDate: 'desc' },
      select: {
        reconciliationDate: true,
        reconciliationType: true,
        status: true,
        variance: true,
        variancePercentage: true,
      },
    }),
    prisma.breach.findMany({
      where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: { id: true, breachType: true, severity: true, status: true, createdAt: true },
      orderBy: { severity: 'desc' },
    }),
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
      include: {
        acknowledgementLetters: {
          where: { status: 'CURRENT' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { status: true, effectiveDate: true, expiryDate: true },
        },
      },
    }),
    prisma.fcaMonthlyReturn.findFirst({
      where: { firmId },
      orderBy: { reportingMonth: 'desc' },
      select: { reportingMonth: true, status: true, finalisedAt: true },
    }),
  ]);

  if (!firm) throw new NotFoundError('Firm');

  // Compute resolution pack health percentage
  const [resolutionPackCheck] = await Promise.all([
    prisma.resolutionPackHealthCheck.findFirst({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
      select: { overallStatus: true, components: true },
    }),
  ]);

  let resolutionPackPct = 0;
  if (resolutionPackCheck && resolutionPackCheck.components) {
    const components = resolutionPackCheck.components as Array<{ status: string }>;
    const greenCount = components.filter((c) => c.status === 'GREEN').length;
    resolutionPackPct = components.length > 0 ? Math.round((greenCount / components.length) * 100) : 0;
  }

  return {
    firmId,
    firmName: firm.name,
    regime: firm.regime,
    safeguardingMethod: firm.safeguardingMethod,
    totalFundsAtBank: Number(link.totalFundsHeld),
    latestReconciliation: latestRecon
      ? {
          date: latestRecon.reconciliationDate,
          type: latestRecon.reconciliationType,
          status: latestRecon.status,
          variance: latestRecon.variance ? Number(latestRecon.variance) : null,
        }
      : null,
    activeBreaches: breaches,
    letterStatusForBank: accounts.map((a) => ({
      accountId: a.id,
      bankName: a.bankName,
      accountNumberMasked: a.accountNumberMasked,
      letterStatus: a.letterStatus,
      currentLetter: a.acknowledgementLetters[0] ?? null,
    })),
    monthlyReturnStatus: monthlyReturn
      ? { reportingMonth: monthlyReturn.reportingMonth, status: monthlyReturn.status }
      : null,
    auditStatus: firm.auditRequirementStatus,
    resolutionPackHealthPct: resolutionPackPct,
  };
}

// ─── Bank Alerts ────────────────────────────────────────────────────────────

export interface BankApiAlert {
  type: 'SHORTFALL' | 'OVERDUE_RECON' | 'MISSING_LETTER';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  firmId: string;
  firmName: string;
  message: string;
  detectedAt: Date;
}

export async function getBankAlerts(bankInstitutionId: string): Promise<BankApiAlert[]> {
  const links = await prisma.bankInstitutionFirm.findMany({
    where: { bankInstitutionId },
    select: { firmId: true, firm: { select: { name: true } } },
  });

  if (links.length === 0) return [];

  const firmIds = links.map((l) => l.firmId);
  const firmNameById = new Map(links.map((l) => [l.firmId, l.firm.name]));
  const alerts: BankApiAlert[] = [];
  const today = new Date();

  // Shortfall breaches
  const shortfallBreaches = await prisma.breach.findMany({
    where: {
      firmId: { in: firmIds },
      breachType: 'SHORTFALL',
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
    select: { firmId: true, createdAt: true, severity: true },
  });

  for (const b of shortfallBreaches) {
    alerts.push({
      type: 'SHORTFALL',
      severity: b.severity === 'CRITICAL' || b.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
      firmId: b.firmId,
      firmName: firmNameById.get(b.firmId) ?? '',
      message: `Safeguarding shortfall detected for ${firmNameById.get(b.firmId)}.`,
      detectedAt: b.createdAt,
    });
  }

  // Overdue reconciliations
  const reconRuns = await prisma.reconciliationRun.findMany({
    where: { firmId: { in: firmIds } },
    orderBy: { reconciliationDate: 'desc' },
    select: { firmId: true, reconciliationDate: true },
  });

  const reconByFirm = new Map<string, Date>();
  for (const run of reconRuns) {
    if (!reconByFirm.has(run.firmId)) {
      reconByFirm.set(run.firmId, run.reconciliationDate);
    }
  }

  for (const fid of firmIds) {
    const lastReconDate = reconByFirm.get(fid);
    if (!lastReconDate) {
      alerts.push({
        type: 'OVERDUE_RECON',
        severity: 'HIGH',
        firmId: fid,
        firmName: firmNameById.get(fid) ?? '',
        message: `No reconciliation on record for ${firmNameById.get(fid)}.`,
        detectedAt: today,
      });
    } else {
      const daysSince = Math.floor(
        (today.getTime() - lastReconDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince >= 3) {
        alerts.push({
          type: 'OVERDUE_RECON',
          severity: 'HIGH',
          firmId: fid,
          firmName: firmNameById.get(fid) ?? '',
          message: `Reconciliation for ${firmNameById.get(fid)} is ${daysSince} days overdue.`,
          detectedAt: today,
        });
      }
    }
  }

  // Missing letters at this bank
  const missingLetterAccounts = await prisma.safeguardingAccount.findMany({
    where: {
      firmId: { in: firmIds },
      status: 'ACTIVE',
      letterStatus: { in: ['PENDING', 'MISSING', 'EXPIRED'] },
    },
    select: { firmId: true, bankName: true, accountNumberMasked: true, letterStatus: true },
  });

  for (const acct of missingLetterAccounts) {
    alerts.push({
      type: 'MISSING_LETTER',
      severity: acct.letterStatus === 'MISSING' ? 'HIGH' : 'MEDIUM',
      firmId: acct.firmId,
      firmName: firmNameById.get(acct.firmId) ?? '',
      message: `Acknowledgement letter ${acct.letterStatus.toLowerCase()} for account ${acct.accountNumberMasked} at ${acct.bankName}.`,
      detectedAt: today,
    });
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));

  return alerts;
}

// ─── API Documentation ──────────────────────────────────────────────────────

export function getApiDocs() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Safeheld Bank API',
      version: '1.0.0',
      description: 'REST API for bank institutions to monitor safeguarding compliance of their client firms. Authenticate using X-API-Key header.',
    },
    servers: [
      { url: '/api/v1/bank-api', description: 'Bank API' },
    ],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    paths: {
      '/portfolio': {
        get: {
          summary: 'Portfolio view',
          description: 'Aggregate view of all firms linked to this bank: total funds, firm count, shortfalls, overdue reconciliations, risk heatmap.',
          responses: {
            '200': { description: 'Portfolio summary with risk heatmap' },
            '401': { description: 'Invalid or missing API key' },
          },
        },
      },
      '/firms/{firmId}': {
        get: {
          summary: 'Firm detail view',
          description: 'Per-firm view: latest reconciliation, breaches, resolution pack health, letter status, monthly return status, audit status.',
          parameters: [
            { name: 'firmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Firm detail' },
            '401': { description: 'Invalid or missing API key' },
            '403': { description: 'Firm not linked to bank' },
          },
        },
      },
      '/alerts': {
        get: {
          summary: 'Alerts',
          description: 'Active alerts: shortfalls, overdue reconciliations, missing acknowledgement letters.',
          responses: {
            '200': { description: 'Alert list sorted by severity' },
            '401': { description: 'Invalid or missing API key' },
          },
        },
      },
      '/keys': {
        post: {
          summary: 'Create API key',
          description: 'Create a new API key for a bank institution. Requires ADMIN user authentication (Bearer token), not API key auth.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['bankInstitutionId', 'label'],
                  properties: {
                    bankInstitutionId: { type: 'string', format: 'uuid' },
                    label: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'API key created (plaintext key returned once)' },
            '401': { description: 'Authentication required' },
            '403': { description: 'ADMIN role required' },
          },
        },
      },
    },
  };
}
