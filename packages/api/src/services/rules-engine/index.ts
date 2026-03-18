import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import {
  RULES_ENGINE_VERSION,
  ComplianceVerdict,
  RuleFinding,
  EvaluationContext,
  FirmContext,
  ReconciliationContext,
  GovernanceContext,
  SafeguardingAccountContext,
  CryptoContext,
  FrameworkRuleRecord,
  REGIME_FRAMEWORK_MAP,
} from './types';
import { EVALUATORS } from './evaluators';

export { RULES_ENGINE_VERSION } from './types';
export type { ComplianceVerdict, RuleFinding } from './types';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

export class RulesEngine {
  /**
   * Evaluate a reconciliation run against all applicable framework rules.
   */
  async evaluate(reconciliationRunId: string): Promise<ComplianceVerdict> {
    const run = await prisma.reconciliationRun.findUnique({
      where: { id: reconciliationRunId },
      include: {
        firm: {
          include: {
            safeguardingAccounts: { where: { status: 'ACTIVE' } },
            acknowledgementLetters: true,
            policyDocuments: true,
            responsibilityAssignments: true,
            insuranceGuarantees: true,
            thirdPartyDueDiligence: true,
            resolutionPackHealths: { orderBy: { checkDate: 'desc' }, take: 1 },
            wallets: true,
            stablecoinTokens: true,
            reserveAssets: true,
            reserveAttestations: { orderBy: { snapshotDate: 'desc' }, take: 5 },
            proofOfReserves: { orderBy: { snapshotDate: 'desc' }, take: 5 },
          },
        },
      },
    });

    if (!run) throw new Error(`Reconciliation run ${reconciliationRunId} not found`);
    const firm = run.firm;
    const now = new Date();

    // Build context
    const firmCtx: FirmContext = {
      id: firm.id,
      name: firm.name,
      regime: firm.regime,
      safeguardingMethod: firm.safeguardingMethod,
      baseCurrency: firm.baseCurrency,
      materialDiscrepancyPct: firm.materialDiscrepancyPct ? toNum(firm.materialDiscrepancyPct) : null,
      materialDiscrepancyAbs: firm.materialDiscrepancyAbs ? toNum(firm.materialDiscrepancyAbs) : null,
      fcaFrn: firm.fcaFrn,
      cassClassification: firm.cassClassification,
    };

    const reconCtx: ReconciliationContext = {
      runId: run.id,
      reconciliationDate: run.reconciliationDate,
      reconciliationType: run.reconciliationType,
      currency: run.currency,
      totalRequirement: toNum(run.totalRequirement),
      totalResource: toNum(run.totalResource),
      variance: toNum(run.variance),
      variancePercentage: toNum(run.variancePercentage),
      status: run.status,
      fundType: run.fundType,
    };

    const govCtx: GovernanceContext = {
      acknowledgementLetters: firm.acknowledgementLetters.map(l => ({
        id: l.id,
        safeguardingAccountId: l.safeguardingAccountId,
        status: l.status,
        expiryDate: l.expiryDate,
        effectiveDate: l.effectiveDate,
      })),
      policyDocuments: firm.policyDocuments.map(p => ({
        id: p.id,
        documentType: p.documentType,
        status: p.status,
        boardApproved: p.boardApproved,
        annualReviewDue: p.annualReviewDue,
      })),
      responsibilityAssignments: firm.responsibilityAssignments.map(r => ({
        roleType: r.roleType,
        personName: r.personName,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      })),
      insuranceGuarantees: firm.insuranceGuarantees.map(i => ({
        id: i.id,
        coverageAmount: toNum(i.coverageAmount),
        coverageCurrency: i.coverageCurrency,
        expiryDate: i.expiryDate,
        status: i.status,
      })),
      dueDiligence: firm.thirdPartyDueDiligence.map(d => ({
        id: d.id,
        safeguardingAccountId: d.safeguardingAccountId,
        reviewStatus: d.reviewStatus,
        nextReviewDue: d.nextReviewDue,
        ddOutcome: d.ddOutcome,
      })),
      resolutionPackHealth: firm.resolutionPackHealths[0]
        ? {
            overallStatus: firm.resolutionPackHealths[0].overallStatus,
            components: firm.resolutionPackHealths[0].components as Record<string, unknown>,
            missingComponents: firm.resolutionPackHealths[0].missingComponents as string[] | null,
          }
        : null,
    };

    const accountsCtx: SafeguardingAccountContext[] = firm.safeguardingAccounts.map(a => ({
      id: a.id,
      bankName: a.bankName,
      designation: a.designation,
      letterStatus: a.letterStatus,
      fundType: a.fundType,
      currency: a.currency,
      status: a.status,
    }));

    const cryptoCtx: CryptoContext = {
      wallets: firm.wallets.map(w => ({
        id: w.id,
        walletType: w.walletType,
        network: w.network,
        status: w.status,
      })),
      stablecoinTokens: firm.stablecoinTokens.map(t => ({
        id: t.id,
        symbol: t.symbol,
        pegStatus: t.pegStatus,
        totalSupply: t.totalSupply ? toNum(t.totalSupply) : null,
        circulatingSupply: t.circulatingSupply ? toNum(t.circulatingSupply) : null,
        regime: t.regime,
      })),
      reserveAssets: firm.reserveAssets.map(a => ({
        assetType: a.assetType,
        faceValue: toNum(a.faceValue),
        marketValue: a.marketValue ? toNum(a.marketValue) : null,
        currency: a.currency,
        custodian: a.custodian,
        maturityDate: a.maturityDate,
      })),
      reserveAttestations: firm.reserveAttestations.map(a => ({
        snapshotDate: a.snapshotDate,
        coverageRatio: toNum(a.coverageRatio),
        status: a.status,
      })),
      proofOfReserves: firm.proofOfReserves.map(p => ({
        snapshotDate: p.snapshotDate,
        reserveRatio: toNum(p.reserveRatio),
        status: p.status,
      })),
    };

    const evalCtx: EvaluationContext = {
      firm: firmCtx,
      reconciliation: reconCtx,
      governance: govCtx,
      safeguardingAccounts: accountsCtx,
      crypto: cryptoCtx,
      now,
    };

    // Determine applicable frameworks
    const frameworks = REGIME_FRAMEWORK_MAP[firm.regime] || [];

    // Load active rules for applicable frameworks
    const rules = await prisma.frameworkRule.findMany({
      where: {
        framework: { in: frameworks },
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: [{ framework: 'asc' }, { ruleCode: 'asc' }],
    });

    // Evaluate each rule
    const findings: RuleFinding[] = [];
    for (const rule of rules) {
      const ruleRecord: FrameworkRuleRecord = {
        id: rule.id,
        framework: rule.framework,
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        ruleDescription: rule.ruleDescription,
        severity: rule.severity,
        active: rule.active,
        version: rule.version,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        sourceRegulation: rule.sourceRegulation,
        sourceArticle: rule.sourceArticle,
        evaluationConfig: rule.evaluationConfig as Record<string, unknown> | null,
      };

      const evaluator = EVALUATORS[rule.ruleCode];
      if (evaluator) {
        try {
          const finding = evaluator(ruleRecord, evalCtx);
          findings.push(finding);
        } catch (err) {
          logger.error({ err, ruleCode: rule.ruleCode }, 'Rule evaluation error');
          findings.push({
            ruleId: rule.id,
            ruleCode: rule.ruleCode,
            framework: rule.framework,
            severity: rule.severity,
            status: 'WARNING',
            detail: `Rule evaluation error: ${(err as Error).message}`,
            ruleVersion: rule.version,
          });
        }
      } else {
        // No evaluator — mark as warning
        findings.push({
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          framework: rule.framework,
          severity: rule.severity,
          status: 'WARNING',
          detail: `No evaluator registered for rule ${rule.ruleCode} — manual assessment required`,
          ruleVersion: rule.version,
        });
      }
    }

    // Calculate score and verdicts
    const totalRules = findings.length;
    const passed = findings.filter(f => f.status === 'PASS').length;
    const failed = findings.filter(f => f.status === 'FAIL').length;
    const warnings = findings.filter(f => f.status === 'WARNING').length;
    const notApplicable = findings.filter(f => f.status === 'NOT_APPLICABLE').length;
    const applicableRules = totalRules - notApplicable;

    // Score: PASS = full credit, WARNING = half credit, FAIL = zero, N/A excluded
    const score = applicableRules === 0
      ? 100
      : Math.round(((passed + warnings * 0.5) / applicableRules) * 100);

    const criticalFailures = findings.filter(f => f.status === 'FAIL' && f.severity === 'CRITICAL').length;
    const highFailures = findings.filter(f => f.status === 'FAIL' && f.severity === 'HIGH').length;

    let certificateStatus: 'FULLY_COMPLIANT' | 'PARTIAL_COMPLIANCE' | 'NON_COMPLIANT';
    if (criticalFailures > 0) {
      certificateStatus = 'NON_COMPLIANT';
    } else if (highFailures > 0) {
      certificateStatus = 'PARTIAL_COMPLIANCE';
    } else {
      certificateStatus = 'FULLY_COMPLIANT';
    }

    const certificateEligible = certificateStatus === 'FULLY_COMPLIANT';

    const verdict: ComplianceVerdict = {
      compliant: certificateEligible,
      score,
      findings,
      certificateEligible,
      frameworkSpecificData: {
        regime: firm.regime,
        frameworks,
        applicableRules,
        notApplicable,
        warnings,
      },
      rulesEngineVersion: RULES_ENGINE_VERSION,
      frameworksVerified: frameworks,
      rulesApplied: totalRules,
      rulesPassed: passed,
      rulesFailed: failed,
      criticalFindings: criticalFailures,
      certificateStatus,
    };

    // Persist results
    await this.persistVerdict(reconciliationRunId, firm.id, verdict);

    logger.info(
      {
        runId: reconciliationRunId,
        firmId: firm.id,
        score,
        passed,
        failed,
        warnings,
        certificateStatus,
      },
      'Rules engine evaluation complete'
    );

    return verdict;
  }

  private async persistVerdict(
    reconciliationRunId: string,
    firmId: string,
    verdict: ComplianceVerdict
  ): Promise<void> {
    // Update reconciliation run with rules engine results
    await prisma.reconciliationRun.update({
      where: { id: reconciliationRunId },
      data: {
        rulesEngineVersion: verdict.rulesEngineVersion,
        complianceScore: verdict.score,
        rulesFindings: verdict.findings as unknown as object[],
        certificateEligible: verdict.certificateEligible,
        frameworkRulesApplied: {
          frameworksVerified: verdict.frameworksVerified,
          rulesApplied: verdict.rulesApplied,
          rulesPassed: verdict.rulesPassed,
          rulesFailed: verdict.rulesFailed,
          criticalFindings: verdict.criticalFindings,
          certificateStatus: verdict.certificateStatus,
        },
      },
    });

    // Create compliance findings and remediation actions
    const now = new Date();
    for (const finding of verdict.findings) {
      const dbFinding = await prisma.complianceFinding.create({
        data: {
          reconciliationRunId,
          ruleId: finding.ruleId,
          ruleCode: finding.ruleCode,
          framework: finding.framework,
          severity: finding.severity,
          status: finding.status,
          detail: finding.detail,
          remediationGuidance: finding.remediationGuidance || null,
          ruleVersion: finding.ruleVersion,
        },
      });

      // Create remediation action for failed rules
      if (finding.status === 'FAIL') {
        const deadline = this.calculateDeadline(now, finding.severity);
        const escalationPath = this.getEscalationPath(finding.severity);

        await prisma.remediationAction.create({
          data: {
            findingId: dbFinding.id,
            firmId,
            actionDescription: finding.remediationGuidance || finding.detail,
            deadline,
            severity: finding.severity,
            status: 'OPEN',
            assignedTo: 'Compliance Officer',
            escalationPath,
          },
        });
      }
    }
  }

  private calculateDeadline(from: Date, severity: string): Date {
    const deadline = new Date(from);
    switch (severity) {
      case 'CRITICAL':
        // Next business day
        deadline.setDate(deadline.getDate() + 1);
        while (deadline.getDay() === 0 || deadline.getDay() === 6) {
          deadline.setDate(deadline.getDate() + 1);
        }
        break;
      case 'HIGH':
        deadline.setDate(deadline.getDate() + 5);
        break;
      case 'MEDIUM':
        deadline.setDate(deadline.getDate() + 30);
        break;
      case 'LOW':
      default:
        deadline.setDate(deadline.getDate() + 90);
        break;
    }
    return deadline;
  }

  private getEscalationPath(severity: string): string {
    switch (severity) {
      case 'CRITICAL':
        return 'Immediate escalation to MLRO and Board';
      case 'HIGH':
        return 'Escalate to Head of Compliance within 24 hours';
      case 'MEDIUM':
        return 'Escalate to Compliance Officer if not resolved within 15 days';
      case 'LOW':
      default:
        return 'Review at next compliance committee meeting';
    }
  }
}

// Singleton instance
export const rulesEngine = new RulesEngine();

// ─── Service functions for API routes ───────────────────────────────────────

export async function getComplianceScore(firmId: string) {
  const latestRuns = await prisma.reconciliationRun.findMany({
    where: { firmId, complianceScore: { not: null } },
    orderBy: { reconciliationDate: 'desc' },
    take: 10,
    select: {
      id: true,
      reconciliationDate: true,
      complianceScore: true,
      certificateEligible: true,
      frameworkRulesApplied: true,
      rulesEngineVersion: true,
    },
  });

  const latest = latestRuns[0];
  const trend = latestRuns.map(r => ({
    date: r.reconciliationDate,
    score: r.complianceScore,
  }));

  return {
    currentScore: latest?.complianceScore ?? null,
    certificateEligible: latest?.certificateEligible ?? null,
    frameworkRulesApplied: latest?.frameworkRulesApplied ?? null,
    rulesEngineVersion: latest?.rulesEngineVersion ?? null,
    trend,
  };
}

export async function getRunFindings(reconciliationRunId: string) {
  return prisma.complianceFinding.findMany({
    where: { reconciliationRunId },
    orderBy: [{ severity: 'asc' }, { status: 'asc' }],
    include: {
      rule: { select: { ruleName: true, sourceRegulation: true, sourceArticle: true } },
      remediationActions: true,
    },
  });
}

export async function getRemediationActions(
  firmId: string,
  filters: { status?: string; page?: number; pageSize?: number }
) {
  const where: Record<string, unknown> = { firmId };
  if (filters.status) where.status = filters.status;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [actions, total] = await Promise.all([
    prisma.remediationAction.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { deadline: 'asc' }],
      skip,
      take: pageSize,
      include: {
        finding: {
          select: { ruleCode: true, framework: true, detail: true, reconciliationRunId: true },
        },
      },
    }),
    prisma.remediationAction.count({ where }),
  ]);

  return { actions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateRemediationAction(
  id: string,
  firmId: string,
  data: { status: string; assignedTo?: string }
) {
  const action = await prisma.remediationAction.findFirst({ where: { id, firmId } });
  if (!action) throw new Error('Remediation action not found');

  const updateData: Record<string, unknown> = { status: data.status };
  if (data.assignedTo) updateData.assignedTo = data.assignedTo;
  if (data.status === 'RESOLVED') updateData.resolvedAt = new Date();

  return prisma.remediationAction.update({ where: { id }, data: updateData });
}

export async function getFrameworkRules(framework: string) {
  return prisma.frameworkRule.findMany({
    where: { framework },
    orderBy: [{ ruleCode: 'asc' }],
  });
}

export async function upsertFrameworkRule(data: {
  ruleCode: string;
  framework: string;
  ruleName: string;
  ruleDescription: string;
  severity: string;
  sourceRegulation: string;
  sourceArticle: string;
  active?: boolean;
  effectiveFrom?: Date;
}) {
  const existing = await prisma.frameworkRule.findUnique({ where: { ruleCode: data.ruleCode } });

  if (existing) {
    return prisma.frameworkRule.update({
      where: { ruleCode: data.ruleCode },
      data: {
        ...data,
        version: existing.version + 1,
        severity: data.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      },
    });
  }

  return prisma.frameworkRule.create({
    data: {
      ...data,
      severity: data.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
      effectiveFrom: data.effectiveFrom || new Date(),
    },
  });
}

// Check and escalate overdue remediation actions
export async function escalateOverdueActions(): Promise<number> {
  const now = new Date();
  const overdue = await prisma.remediationAction.findMany({
    where: {
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      deadline: { lt: now },
    },
  });

  for (const action of overdue) {
    await prisma.remediationAction.update({
      where: { id: action.id },
      data: {
        status: 'OVERDUE',
        // Escalate severity by one level
        severity: action.severity === 'LOW' ? 'MEDIUM'
          : action.severity === 'MEDIUM' ? 'HIGH'
          : action.severity === 'HIGH' ? 'CRITICAL'
          : 'CRITICAL',
      },
    });
  }

  return overdue.length;
}
