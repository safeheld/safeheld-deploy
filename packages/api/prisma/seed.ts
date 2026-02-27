import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create rule packs
  const ps25PiRulesPack = await prisma.rulePack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'PS25_PI_V1',
      regime: 'PS25_PI',
      version: 1,
      rulesConfig: {
        regime: 'PS25_PI',
        reconciliation: {
          internal_required: true,
          external_required: true,
          separate_fund_types: false,
          reconciliation_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          stale_data_threshold_days: 3,
        },
        shortfall_severity: {
          LOW: { percentage: 0.5, absolute_gbp: 10000 },
          MEDIUM: { percentage: 2.0, absolute_gbp: 100000 },
          HIGH: { percentage: 5.0, absolute_gbp: 500000 },
          CRITICAL: { percentage_above: 5.0, absolute_above_gbp: 500000 },
        },
        material_discrepancy_threshold: {
          percentage: 1.0,
          absolute_gbp: 50000,
        },
        escalation_timers: {
          acknowledge_hours: 24,
          remediation_warn_days: 14,
          remediation_escalation_days: 30,
        },
        reporting: {
          safeguarding_return_required: true,
          cmar_required: false,
          audit_required_threshold_gbp: 100000,
        },
      },
      effectiveFrom: new Date('2025-01-01'),
      status: 'ACTIVE',
    },
  });

  const ps25EmiRulePack = await prisma.rulePack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'PS25_EMI_V1',
      regime: 'PS25_EMI',
      version: 1,
      rulesConfig: {
        regime: 'PS25_EMI',
        reconciliation: {
          internal_required: true,
          external_required: true,
          separate_fund_types: true,
          fund_types: ['E_MONEY', 'PAYMENT_SERVICES'],
          reconciliation_days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          stale_data_threshold_days: 3,
        },
        shortfall_severity: {
          LOW: { percentage: 0.5, absolute_gbp: 10000 },
          MEDIUM: { percentage: 2.0, absolute_gbp: 100000 },
          HIGH: { percentage: 5.0, absolute_gbp: 500000 },
          CRITICAL: { percentage_above: 5.0, absolute_above_gbp: 500000 },
        },
        material_discrepancy_threshold: {
          percentage: 1.0,
          absolute_gbp: 50000,
        },
        escalation_timers: {
          acknowledge_hours: 24,
          remediation_warn_days: 14,
          remediation_escalation_days: 30,
        },
        reporting: {
          safeguarding_return_required: true,
          cmar_required: false,
          audit_required_threshold_gbp: 100000,
        },
      },
      effectiveFrom: new Date('2025-01-01'),
      status: 'ACTIVE',
    },
  });

  // Create system admin firm
  const adminFirm = await prisma.firm.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Safeheld System',
      regime: 'PS25_PI',
      status: 'ACTIVE',
      baseCurrency: 'GBP',
      dateFormat: 'DD_MM_YYYY',
      safeguardingMethod: 'SEGREGATION',
    },
  });

  // Create admin user
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@SafeHeld2024!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@safeheld.io' },
    update: {},
    create: {
      firmId: adminFirm.id,
      email: 'admin@safeheld.io',
      passwordHash,
      role: 'ADMIN',
      name: 'System Administrator',
      status: 'ACTIVE',
    },
  });

  // ─── Test firms ────────────────────────────────────────────────────────────

  const testFirmAlpha = await prisma.firm.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'Alpha Payments Ltd',
      fcaFrn: 'FRN123456',
      regime: 'PS25_PI',
      status: 'ACTIVE',
      baseCurrency: 'GBP',
      dateFormat: 'DD_MM_YYYY',
      safeguardingMethod: 'SEGREGATION',
      materialDiscrepancyPct: 1.0,
      materialDiscrepancyAbs: 50000,
    },
  });

  const testFirmBeta = await prisma.firm.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      name: 'Beta E-Money Ltd',
      fcaFrn: 'FRN789012',
      regime: 'PS25_EMI',
      status: 'ACTIVE',
      baseCurrency: 'GBP',
      dateFormat: 'DD_MM_YYYY',
      safeguardingMethod: 'SEGREGATION',
      materialDiscrepancyPct: 1.0,
      materialDiscrepancyAbs: 50000,
    },
  });

  // ─── TestBank UK ───────────────────────────────────────────────────────────

  const testBank = await prisma.bankInstitution.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      name: 'TestBank UK',
      leiCode: 'GB00TESTBANK0001',
      status: 'ACTIVE',
      pilotStartDate: new Date('2025-01-01'),
      commercialStatus: 'PILOT',
    },
  });

  // Link TestBank UK to both test firms
  await prisma.bankInstitutionFirm.upsert({
    where: {
      bankInstitutionId_firmId: {
        bankInstitutionId: testBank.id,
        firmId: testFirmAlpha.id,
      },
    },
    update: {},
    create: {
      bankInstitutionId: testBank.id,
      firmId: testFirmAlpha.id,
      safeguardingAccountCount: 3,
      totalFundsHeld: 5250000,
    },
  });

  await prisma.bankInstitutionFirm.upsert({
    where: {
      bankInstitutionId_firmId: {
        bankInstitutionId: testBank.id,
        firmId: testFirmBeta.id,
      },
    },
    update: {},
    create: {
      bankInstitutionId: testBank.id,
      firmId: testFirmBeta.id,
      safeguardingAccountCount: 2,
      totalFundsHeld: 3100000,
    },
  });

  // Create a BANK_VIEWER user for TestBank UK
  const bankViewerPassword = process.env.BANK_VIEWER_PASSWORD || 'BankViewer@Safeheld2024!';
  const bankViewerHash = await bcrypt.hash(bankViewerPassword, 12);

  await prisma.user.upsert({
    where: { email: 'viewer@testbank-uk.com' },
    update: {},
    create: {
      firmId: adminFirm.id,
      email: 'viewer@testbank-uk.com',
      passwordHash: bankViewerHash,
      role: 'BANK_VIEWER',
      name: 'TestBank UK Viewer',
      status: 'ACTIVE',
      bankInstitutionId: testBank.id,
      accessExpiresAt: new Date('2027-12-31'),
    },
  });

  console.log(`Seed complete:`);
  console.log(`  Rule packs: PS25_PI_V1 (${ps25PiRulesPack.id}), PS25_EMI_V1 (${ps25EmiRulePack.id})`);
  console.log(`  Admin firm: ${adminFirm.id}`);
  console.log(`  Admin user: ${adminUser.email}`);
  console.log(`  Test firms: ${testFirmAlpha.name} (${testFirmAlpha.id}), ${testFirmBeta.name} (${testFirmBeta.id})`);
  console.log(`  Bank institution: ${testBank.name} (${testBank.id})`);
  console.log(`  Bank viewer: viewer@testbank-uk.com`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
