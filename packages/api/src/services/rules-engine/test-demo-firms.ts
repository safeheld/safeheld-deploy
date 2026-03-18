/**
 * Test script: runs the rules engine against all demo firms.
 *
 * Usage: npx tsx src/services/rules-engine/test-demo-firms.ts
 *
 * This script:
 * 1. Loads all active firms
 * 2. Creates a test reconciliation run for each
 * 3. Runs the rules engine
 * 4. Reports compliance scores, pass/fail, certificate eligibility
 */

import { PrismaClient } from '@prisma/client';
import { RulesEngine } from './index';

const prisma = new PrismaClient();
const engine = new RulesEngine();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SAFEHELD RULES ENGINE — DEMO FIRM TEST REPORT');
  console.log('  Engine Version: 1.0.0');
  console.log(`  Test Date: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Count rules per framework
  const allRules = await prisma.frameworkRule.findMany({ where: { active: true } });
  const byFramework: Record<string, number> = {};
  for (const rule of allRules) {
    byFramework[rule.framework] = (byFramework[rule.framework] || 0) + 1;
  }

  console.log('FRAMEWORK RULES LOADED:');
  console.log('─────────────────────────────────────────');
  let totalRules = 0;
  for (const [fw, count] of Object.entries(byFramework).sort()) {
    console.log(`  ${fw.padEnd(10)} ${String(count).padStart(3)} rules`);
    totalRules += count;
  }
  console.log(`  ${'TOTAL'.padEnd(10)} ${String(totalRules).padStart(3)} rules`);
  console.log();

  // Load all active firms
  const firms = await prisma.firm.findMany({
    where: { status: 'ACTIVE', id: { not: '00000000-0000-0000-0000-000000000010' } }, // Exclude system firm
    orderBy: { name: 'asc' },
  });

  console.log(`TESTING ${firms.length} DEMO FIRMS:\n`);

  // Get or create a rule pack for each regime
  const rulePackCache: Record<string, string> = {};
  for (const firm of firms) {
    if (!rulePackCache[firm.regime]) {
      let pack = await prisma.rulePack.findFirst({
        where: { regime: firm.regime, status: 'ACTIVE' },
        orderBy: { version: 'desc' },
      });
      if (!pack) {
        pack = await prisma.rulePack.create({
          data: {
            name: `${firm.regime}_V1`,
            regime: firm.regime,
            version: 1,
            rulesConfig: { regime: firm.regime, reconciliation: { internal_required: true, external_required: true } },
            effectiveFrom: new Date('2025-01-01'),
            status: 'ACTIVE',
          },
        });
      }
      rulePackCache[firm.regime] = pack.id;
    }
  }

  const results: Array<{
    firm: string;
    regime: string;
    score: number;
    passed: number;
    failed: number;
    warnings: number;
    na: number;
    total: number;
    eligible: boolean;
    status: string;
    criticalFindings: string[];
    highFindings: string[];
  }> = [];

  for (const firm of firms) {
    const reconciliationDate = new Date();
    reconciliationDate.setDate(reconciliationDate.getDate() - 1);

    // Create a test reconciliation run
    const run = await prisma.reconciliationRun.create({
      data: {
        firmId: firm.id,
        reconciliationDate,
        reconciliationType: 'INTERNAL',
        fundType: 'ALL',
        currency: firm.baseCurrency,
        totalRequirement: 1000000,
        totalResource: 1005000,  // Slight excess — compliant on balance
        variance: 5000,
        variancePercentage: 0.5,
        status: 'EXCESS',
        rulePackId: rulePackCache[firm.regime],
        trigger: 'MANUAL',
        dataCompleteness: 'COMPLETE',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    try {
      const verdict = await engine.evaluate(run.id);

      const criticalFindings = verdict.findings
        .filter(f => f.status === 'FAIL' && f.severity === 'CRITICAL')
        .map(f => `${f.ruleCode}: ${f.detail.substring(0, 80)}`);

      const highFindings = verdict.findings
        .filter(f => f.status === 'FAIL' && f.severity === 'HIGH')
        .map(f => `${f.ruleCode}: ${f.detail.substring(0, 80)}`);

      results.push({
        firm: firm.name,
        regime: firm.regime,
        score: verdict.score,
        passed: verdict.rulesPassed,
        failed: verdict.rulesFailed,
        warnings: verdict.findings.filter(f => f.status === 'WARNING').length,
        na: verdict.findings.filter(f => f.status === 'NOT_APPLICABLE').length,
        total: verdict.rulesApplied,
        eligible: verdict.certificateEligible,
        status: verdict.certificateStatus,
        criticalFindings,
        highFindings,
      });
    } catch (err) {
      console.error(`  ERROR: ${firm.name}: ${(err as Error).message}`);
      results.push({
        firm: firm.name,
        regime: firm.regime,
        score: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        na: 0,
        total: 0,
        eligible: false,
        status: 'ERROR',
        criticalFindings: [(err as Error).message],
        highFindings: [],
      });
    }
  }

  // Print results
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  COMPLIANCE RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const r of results) {
    const statusIcon = r.status === 'FULLY_COMPLIANT' ? '[GREEN]'
      : r.status === 'PARTIAL_COMPLIANCE' ? '[AMBER]'
      : '[RED]  ';

    console.log(`${statusIcon} ${r.firm}`);
    console.log(`   Regime: ${r.regime}`);
    console.log(`   Score: ${r.score}/100 | Rules: ${r.total} (${r.passed} pass, ${r.failed} fail, ${r.warnings} warn, ${r.na} n/a)`);
    console.log(`   Certificate: ${r.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} | Status: ${r.status}`);

    if (r.criticalFindings.length > 0) {
      console.log(`   CRITICAL failures:`);
      r.criticalFindings.forEach(f => console.log(`     - ${f}`));
    }
    if (r.highFindings.length > 0) {
      console.log(`   HIGH failures:`);
      r.highFindings.forEach(f => console.log(`     - ${f}`));
    }
    console.log();
  }

  // Summary table
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total firms tested:        ${results.length}`);
  console.log(`  Fully compliant:           ${results.filter(r => r.status === 'FULLY_COMPLIANT').length}`);
  console.log(`  Partial compliance:        ${results.filter(r => r.status === 'PARTIAL_COMPLIANCE').length}`);
  console.log(`  Non-compliant:             ${results.filter(r => r.status === 'NON_COMPLIANT').length}`);
  console.log(`  Errors:                    ${results.filter(r => r.status === 'ERROR').length}`);
  console.log(`  Certificate eligible:      ${results.filter(r => r.eligible).length}`);
  console.log(`  Average compliance score:  ${Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)}/100`);
  console.log(`  Total rules evaluated:     ${results.reduce((s, r) => s + r.total, 0)}`);
  console.log(`  Total rules passed:        ${results.reduce((s, r) => s + r.passed, 0)}`);
  console.log(`  Total rules failed:        ${results.reduce((s, r) => s + r.failed, 0)}`);
  console.log();

  // Gaps analysis
  console.log('IDENTIFIED GAPS:');
  console.log('─────────────────────────────────────────');
  console.log('  1. CASS 6/7 evaluators rely on manual verification for stock lending and rehypothecation');
  console.log('     (requires structured data input for automated checks)');
  console.log('  2. PSD2 jurisdiction-specific rules require country-of-authorisation data on firm model');
  console.log('  3. GENIUS Act state-level rules need state-of-registration field on firm');
  console.log('  4. Consumer Duty programme documentation check is advisory (no structured data)');
  console.log('  5. DORA/PS21/3 rules are primarily manual verification (ICT risk framework docs)');
  console.log('  6. Gambling Commission protection level not stored as structured field on firm');
  console.log('  7. Insurance renewal monitoring could be enhanced with insurer rating data feed');
  console.log('  8. Real estate deposit protection scheme membership needs structured tracking');

  // Cleanup test runs
  console.log('\nCleaning up test reconciliation runs...');
  const testRunIds = results.map(r => r.firm); // We'd need to track IDs, but leaving runs for inspection
  console.log('Test runs preserved for inspection.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
