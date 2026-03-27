import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data for newer pages...');

  // ─── Find or create the demo firm ─────────────────────────────────────────
  let firm = await prisma.firm.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  if (!firm) {
    firm = await prisma.firm.create({
      data: {
        name: 'Acme Payments Ltd',
        fcaFrn: 'FRN900100',
        regime: 'PS25_PI',
        status: 'ACTIVE',
        baseCurrency: 'GBP',
        dateFormat: 'DD_MM_YYYY',
        safeguardingMethod: 'SEGREGATION',
        materialDiscrepancyPct: 1.0,
        materialDiscrepancyAbs: 50000,
      },
    });
    console.log(`  Created firm: ${firm.name} (${firm.id})`);
  } else {
    console.log(`  Using existing firm: ${firm.name} (${firm.id})`);
  }

  const firmId = firm.id;

  // Find an admin/compliance user for uploadedBy / generatedBy references
  let user = await prisma.user.findFirst({
    where: { firmId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  if (!user) {
    // Fall back to any active admin user
    user = await prisma.user.findFirst({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!user) {
    throw new Error('No active user found in the database. Run the base seed first: npx tsx prisma/seed.ts');
  }

  const userId = user.id;
  console.log(`  Using user: ${user.email} (${userId})`);

  // ─── FCA Monthly Returns ──────────────────────────────────────────────────
  console.log('  Seeding FCA Monthly Returns...');

  const sectionABase = {
    firmName: firm.name,
    frn: firm.fcaFrn || 'FRN900100',
    safeguardingMethod: 'SEGREGATION',
    reportingCurrency: 'GBP',
    contactName: 'Sarah Thompson',
    contactEmail: 'sarah.thompson@acmepayments.co.uk',
    contactPhone: '+44 20 7946 0958',
  };

  const sectionBBase = {
    totalRelevantFunds: 2543218.45,
    totalSafeguardedFunds: 2556102.89,
    surplus: 12884.44,
    reconDaysInPeriod: 63,
    reconDaysCompleted: 63,
    reconCompletionRate: 100,
    maxShortfall: 0,
    avgSafeguardedAmount: 2501345.67,
  };

  const sectionCBase = [
    {
      bankName: 'Northgate Bank',
      accountRef: '****4521',
      sortCode: '20-45-67',
      currency: 'GBP',
      balance: 1523456.78,
      letterStatus: 'CURRENT',
      letterExpiry: '2027-01-15',
    },
    {
      bankName: 'Barclays',
      accountRef: '****8832',
      sortCode: '20-00-00',
      currency: 'GBP',
      balance: 845210.33,
      letterStatus: 'CURRENT',
      letterExpiry: '2026-06-30',
    },
    {
      bankName: 'HSBC',
      accountRef: '****1199',
      sortCode: '40-12-34',
      currency: 'GBP',
      balance: 187435.78,
      letterStatus: 'EXPIRED',
      letterExpiry: '2026-02-28',
    },
  ];

  const sectionDBase = {
    hasCustodyAssets: false,
    custodyAssets: [],
  };

  const sectionFBase = {
    totalBreaches: 2,
    breachesByType: { SHORTFALL: 1, MISSING_DATA: 1 },
    fcaNotificationsSent: 1,
    materialBreaches: 0,
    breachSummary: [
      {
        date: '2025-02-14',
        type: 'SHORTFALL',
        severity: 'LOW',
        amount: 4521.33,
        status: 'RESOLVED',
        notified: false,
      },
      {
        date: '2025-03-22',
        type: 'MISSING_DATA',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        notified: true,
      },
    ],
  };

  const quarterlyReturns = [
    {
      reportingMonth: new Date('2025-01-01'),
      submissionDeadline: new Date('2025-04-24'),
      status: 'SUBMITTED' as const,
      sectionA: sectionABase,
      sectionB: { ...sectionBBase, totalRelevantFunds: 2105432.12, totalSafeguardedFunds: 2118900.45, surplus: 13468.33, avgSafeguardedAmount: 2089000.00 },
      sectionC: sectionCBase.map((a) => ({ ...a, balance: a.balance * 0.83 })),
      sectionD: sectionDBase,
      sectionE: null,
      sectionF: { ...sectionFBase, totalBreaches: 1, breachesByType: { SHORTFALL: 1 }, fcaNotificationsSent: 0, breachSummary: [sectionFBase.breachSummary[0]] },
    },
    {
      reportingMonth: new Date('2025-04-01'),
      submissionDeadline: new Date('2025-07-24'),
      status: 'SUBMITTED' as const,
      sectionA: sectionABase,
      sectionB: { ...sectionBBase, totalRelevantFunds: 2312890.67, totalSafeguardedFunds: 2325100.89, surplus: 12210.22, avgSafeguardedAmount: 2298000.00 },
      sectionC: sectionCBase.map((a) => ({ ...a, balance: a.balance * 0.91 })),
      sectionD: sectionDBase,
      sectionE: null,
      sectionF: sectionFBase,
    },
    {
      reportingMonth: new Date('2025-07-01'),
      submissionDeadline: new Date('2025-10-24'),
      status: 'SUBMITTED' as const,
      sectionA: sectionABase,
      sectionB: sectionBBase,
      sectionC: sectionCBase,
      sectionD: sectionDBase,
      sectionE: null,
      sectionF: { ...sectionFBase, totalBreaches: 1, breachesByType: { EXCESS: 1 }, fcaNotificationsSent: 0, breachSummary: [{ date: '2025-08-10', type: 'EXCESS', severity: 'LOW', status: 'RESOLVED', notified: false }] },
    },
    {
      reportingMonth: new Date('2025-10-01'),
      submissionDeadline: new Date('2026-04-24'),
      status: 'DRAFT' as const,
      sectionA: sectionABase,
      sectionB: { ...sectionBBase, totalRelevantFunds: 2789100.55, totalSafeguardedFunds: 2803450.12, surplus: 14349.57, reconDaysInPeriod: 45, reconDaysCompleted: 45, avgSafeguardedAmount: 2756000.00 },
      sectionC: sectionCBase.map((a) => ({ ...a, balance: a.balance * 1.1 })),
      sectionD: sectionDBase,
      sectionE: null,
      sectionF: { totalBreaches: 0, breachesByType: {}, fcaNotificationsSent: 0, materialBreaches: 0, breachSummary: [] },
    },
  ];

  for (const ret of quarterlyReturns) {
    await prisma.fcaMonthlyReturn.upsert({
      where: {
        firmId_reportingMonth: {
          firmId,
          reportingMonth: ret.reportingMonth,
        },
      },
      update: {},
      create: {
        firmId,
        reportingMonth: ret.reportingMonth,
        submissionDeadline: ret.submissionDeadline,
        status: ret.status,
        sectionA: ret.sectionA,
        sectionB: ret.sectionB,
        sectionC: ret.sectionC,
        sectionD: ret.sectionD,
        sectionE: ret.sectionE ?? undefined,
        sectionF: ret.sectionF,
      },
    });
  }
  console.log('    4 quarterly FCA returns created.');

  // ─── Resolution Pack ──────────────────────────────────────────────────────
  console.log('  Seeding Resolution Pack...');

  const resolutionComponents = [
    { name: 'Client Money Calculation', status: 'GREEN', lastUpdated: '2026-03-15', notes: 'Daily reconciliation confirmed.' },
    { name: 'Safeguarding Account Register', status: 'GREEN', lastUpdated: '2026-03-15', notes: '3 accounts on file.' },
    { name: 'Acknowledgement Letters', status: 'AMBER', lastUpdated: '2026-03-10', notes: 'HSBC letter expired — renewal in progress.' },
    { name: 'Client Balances Breakdown', status: 'GREEN', lastUpdated: '2026-03-15', notes: '1,247 client records.' },
    { name: 'Bank Statements', status: 'GREEN', lastUpdated: '2026-03-15', notes: 'Statements current to T-1.' },
    { name: 'Reconciliation Records', status: 'GREEN', lastUpdated: '2026-03-15', notes: '252 business days reconciled in FY2024.' },
    { name: 'Breach Register', status: 'GREEN', lastUpdated: '2026-03-12', notes: '3 breaches in period, all resolved.' },
    { name: 'Due Diligence Register', status: 'GREEN', lastUpdated: '2026-02-20', notes: 'All banks reviewed within 12 months.' },
    { name: 'Insurance / Guarantee Details', status: 'GREEN', lastUpdated: '2026-01-15', notes: 'PI and Cyber policies current.' },
    { name: 'Wind-Down Plan', status: 'GREEN', lastUpdated: '2025-11-01', notes: 'Board-approved v1.' },
    { name: 'Safeguarding Policy', status: 'GREEN', lastUpdated: '2026-01-10', notes: 'Board-approved v3.' },
    { name: 'Contact Details & Escalation', status: 'AMBER', lastUpdated: '2025-09-15', notes: 'Deputy contact details pending update.' },
  ];

  const componentStatuses: Record<string, string> = {};
  for (const c of resolutionComponents) {
    componentStatuses[c.name] = c.status;
  }

  const existingPack = await prisma.resolutionPack.findFirst({ where: { firmId } });
  if (!existingPack) {
    await prisma.resolutionPack.create({
      data: {
        firmId,
        version: 1,
        completenessScore: 92,
        components: resolutionComponents,
        componentStatuses,
      },
    });
    console.log('    Resolution pack created.');
  } else {
    console.log('    Resolution pack already exists, skipping.');
  }

  // ─── Safeguarding Accounts (needed for Acknowledgement Letters) ───────────
  console.log('  Seeding Safeguarding Accounts...');

  const accountDefs = [
    { externalAccountId: 'SG-NORTHGATE-001', bankName: 'Northgate Bank', accountNumberMasked: '****4521', sortCode: '20-45-67' },
    { externalAccountId: 'SG-BARCLAYS-001', bankName: 'Barclays', accountNumberMasked: '****8832', sortCode: '20-00-00' },
    { externalAccountId: 'SG-HSBC-001', bankName: 'HSBC', accountNumberMasked: '****1199', sortCode: '40-12-34' },
  ];

  const safeguardingAccountIds: string[] = [];

  for (const acctDef of accountDefs) {
    const acct = await prisma.safeguardingAccount.upsert({
      where: {
        firmId_externalAccountId: {
          firmId,
          externalAccountId: acctDef.externalAccountId,
        },
      },
      update: {},
      create: {
        firmId,
        externalAccountId: acctDef.externalAccountId,
        bankName: acctDef.bankName,
        accountNumberMasked: acctDef.accountNumberMasked,
        sortCode: acctDef.sortCode,
        currency: 'GBP',
        fundType: 'ALL',
        designation: 'SAFEGUARDING',
        status: 'ACTIVE',
        openedDate: new Date('2023-01-15'),
        letterStatus: 'CONFIRMED',
      },
    });
    safeguardingAccountIds.push(acct.id);
  }
  console.log('    3 safeguarding accounts ensured.');

  // ─── Acknowledgement Letters ──────────────────────────────────────────────
  console.log('  Seeding Acknowledgement Letters...');

  const letterDefs = [
    {
      safeguardingAccountIdx: 0,
      version: 2,
      status: 'CURRENT' as const,
      uploadDate: new Date('2025-01-20'),
      effectiveDate: new Date('2025-01-15'),
      expiryDate: new Date('2027-01-15'),
      annualReviewDue: new Date('2026-01-15'),
    },
    {
      safeguardingAccountIdx: 1,
      version: 1,
      status: 'CURRENT' as const,
      uploadDate: new Date('2024-06-15'),
      effectiveDate: new Date('2024-06-01'),
      expiryDate: new Date('2026-06-30'),
      annualReviewDue: new Date('2025-06-01'),
    },
    {
      safeguardingAccountIdx: 2,
      version: 1,
      status: 'EXPIRED' as const,
      uploadDate: new Date('2024-02-10'),
      effectiveDate: new Date('2024-02-01'),
      expiryDate: new Date('2026-02-28'),
      annualReviewDue: new Date('2025-02-01'),
    },
  ];

  const existingLetters = await prisma.acknowledgementLetter.count({ where: { firmId } });
  if (existingLetters === 0) {
    for (const letterDef of letterDefs) {
      await prisma.acknowledgementLetter.create({
        data: {
          firmId,
          safeguardingAccountId: safeguardingAccountIds[letterDef.safeguardingAccountIdx],
          version: letterDef.version,
          fileStoragePath: `/uploads/${firmId}/ack-letters/${accountDefs[letterDef.safeguardingAccountIdx].bankName.toLowerCase().replace(/\s/g, '-')}-v${letterDef.version}.pdf`,
          fileHash: crypto.createHash('sha256').update(`ack-letter-${letterDef.safeguardingAccountIdx}-${letterDef.version}`).digest('hex').slice(0, 64),
          uploadDate: letterDef.uploadDate,
          effectiveDate: letterDef.effectiveDate,
          expiryDate: letterDef.expiryDate,
          annualReviewDue: letterDef.annualReviewDue,
          status: letterDef.status,
          uploadedBy: userId,
        },
      });
    }
    console.log('    3 acknowledgement letters created.');
  } else {
    console.log('    Acknowledgement letters already exist, skipping.');
  }

  // ─── Audit Evidence Packs ─────────────────────────────────────────────────
  console.log('  Seeding Audit Evidence Packs...');

  const existingAuditPacks = await prisma.auditEvidencePack.count({ where: { firmId } });
  if (existingAuditPacks === 0) {
    await prisma.auditEvidencePack.createMany({
      data: [
        {
          firmId,
          periodStart: new Date('2024-04-01'),
          periodEnd: new Date('2025-03-31'),
          generatedBy: userId,
          reconDaysCount: 252,
          breachCount: 3,
          shortfallCount: 1,
          resPackStatus: 'GREEN',
          contentHash: crypto.createHash('sha256').update('audit-pack-fy2024').digest('hex').slice(0, 64),
        },
        {
          firmId,
          periodStart: new Date('2025-04-01'),
          periodEnd: new Date('2026-03-31'),
          generatedBy: userId,
          reconDaysCount: 180,
          breachCount: 1,
          shortfallCount: 0,
          resPackStatus: 'GREEN',
          contentHash: crypto.createHash('sha256').update('audit-pack-fy2025').digest('hex').slice(0, 64),
        },
      ],
    });
    console.log('    2 audit evidence packs created.');
  } else {
    console.log('    Audit evidence packs already exist, skipping.');
  }

  // ─── Third-Party Register ─────────────────────────────────────────────────
  console.log('  Seeding Third-Party Register...');

  const existingThirdParties = await prisma.thirdPartyRegister.count({ where: { firmId } });
  if (existingThirdParties === 0) {
    await prisma.thirdPartyRegister.createMany({
      data: [
        {
          firmId,
          name: 'Northgate Bank',
          partyType: 'BANK',
          jurisdiction: 'United Kingdom',
          dateAppointed: new Date('2023-01-15'),
          servicesProvided: 'Safeguarding account provider. Holds designated client funds in segregated accounts under trust arrangement.',
          contactName: 'James Whitfield',
          contactEmail: 'institutional.clients@northgatebank.co.uk',
          contactPhone: '+44 20 7123 4567',
          isActive: true,
          linkedSafeguardingAccountId: safeguardingAccountIds[0],
        },
        {
          firmId,
          name: 'Barclays',
          partyType: 'BANK',
          jurisdiction: 'United Kingdom',
          dateAppointed: new Date('2022-06-01'),
          servicesProvided: 'Secondary safeguarding account provider. Holds designated client funds for diversification purposes.',
          contactName: 'Emma Richards',
          contactEmail: 'emi-services@barclays.co.uk',
          contactPhone: '+44 20 7116 1234',
          isActive: true,
          linkedSafeguardingAccountId: safeguardingAccountIds[1],
        },
        {
          firmId,
          name: 'PayTech Processing Ltd',
          partyType: 'OTHER',
          jurisdiction: 'United Kingdom',
          dateAppointed: new Date('2024-03-01'),
          servicesProvided: 'Payment processing and settlement services. Processes inbound and outbound payment instructions.',
          contactName: 'David Chen',
          contactEmail: 'compliance@paytechprocessing.co.uk',
          contactPhone: '+44 113 456 7890',
          isActive: true,
        },
        {
          firmId,
          name: 'CloudVault Storage Ltd',
          partyType: 'OTHER',
          jurisdiction: 'United Kingdom',
          dateAppointed: new Date('2024-09-01'),
          servicesProvided: 'Secure document storage and records management. Hosts safeguarding documentation and audit trail.',
          contactName: 'Lisa Harper',
          contactEmail: 'enterprise@cloudvaultstorage.co.uk',
          contactPhone: '+44 161 789 0123',
          isActive: true,
        },
      ],
    });
    console.log('    4 third-party register entries created.');
  } else {
    console.log('    Third-party register already populated, skipping.');
  }

  // ─── Insurance / Guarantee Policies ───────────────────────────────────────
  console.log('  Seeding Insurance Policies...');

  const existingInsurance = await prisma.insuranceGuarantee.count({ where: { firmId } });
  if (existingInsurance === 0) {
    await prisma.insuranceGuarantee.createMany({
      data: [
        {
          firmId,
          insurerName: 'Hiscox Ltd',
          policyNumber: 'PI-2025-ACM-001',
          coverageType: 'INSURANCE',
          coverageAmount: 5000000,
          coverageCurrency: 'GBP',
          effectiveDate: new Date('2025-09-01'),
          expiryDate: new Date('2026-09-01'),
          contingencyPlanRequiredBy: new Date('2026-06-01'),
          contingencyPlanStatus: 'NOT_DUE',
          premium: 45000,
          hasRestrictiveConditions: false,
          fcaNotifiedBeforeFirstUse: true,
          fcaFirstUseNotificationDate: new Date('2025-08-15'),
          decisionMade: true,
          decisionDate: new Date('2025-07-20'),
          status: 'ACTIVE',
        },
        {
          firmId,
          insurerName: 'CFC Underwriting',
          policyNumber: 'CY-2025-ACM-002',
          coverageType: 'INSURANCE',
          coverageAmount: 2000000,
          coverageCurrency: 'GBP',
          effectiveDate: new Date('2025-11-01'),
          expiryDate: new Date('2026-11-01'),
          contingencyPlanRequiredBy: new Date('2026-08-01'),
          contingencyPlanStatus: 'NOT_DUE',
          premium: 18000,
          hasRestrictiveConditions: true,
          restrictiveConditionDetails: 'Excludes losses arising from nation-state cyber attacks. 72-hour notification requirement for claims.',
          fcaNotifiedBeforeFirstUse: true,
          fcaFirstUseNotificationDate: new Date('2025-10-15'),
          decisionMade: true,
          decisionDate: new Date('2025-09-25'),
          status: 'ACTIVE',
        },
      ],
    });
    console.log('    2 insurance policies created.');
  } else {
    console.log('    Insurance policies already exist, skipping.');
  }

  // ─── Policy Documents ─────────────────────────────────────────────────────
  console.log('  Seeding Policy Documents...');

  const existingPolicies = await prisma.policyDocument.count({ where: { firmId } });
  if (existingPolicies === 0) {
    const policyDefs = [
      {
        documentType: 'SAFEGUARDING_POLICY' as const,
        title: 'Safeguarding Policy',
        version: 3,
        boardApproved: true,
        boardApprovalDate: new Date('2026-01-10'),
        annualReviewDue: new Date('2027-01-10'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2026-01-10'),
        lastReviewedBy: 'Sarah Thompson, Head of Compliance',
        status: 'CURRENT' as const,
      },
      {
        documentType: 'RECONCILIATION_PROCEDURE' as const,
        title: 'Reconciliation Procedures',
        version: 2,
        boardApproved: false,
        annualReviewDue: new Date('2026-09-15'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2025-09-15'),
        lastReviewedBy: 'Mark Johnson, Finance Operations Manager',
        status: 'CURRENT' as const,
      },
      {
        documentType: 'BREACH_PROCEDURE' as const,
        title: 'Breach Response Procedure',
        version: 1,
        boardApproved: true,
        boardApprovalDate: new Date('2025-06-01'),
        annualReviewDue: new Date('2026-06-01'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2025-06-01'),
        lastReviewedBy: 'Sarah Thompson, Head of Compliance',
        status: 'CURRENT' as const,
      },
      {
        documentType: 'WIND_DOWN_PLAN' as const,
        title: 'Wind-Down Plan',
        version: 1,
        boardApproved: true,
        boardApprovalDate: new Date('2025-11-01'),
        annualReviewDue: new Date('2026-11-01'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2025-11-01'),
        lastReviewedBy: 'Robert Davies, CEO',
        status: 'CURRENT' as const,
      },
      {
        documentType: 'CLIENT_CONTRACT_TEMPLATE' as const,
        title: 'Client Contract Template',
        version: 2,
        boardApproved: false,
        annualReviewDue: new Date('2026-08-15'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2025-08-15'),
        lastReviewedBy: 'Hannah Clarke, Legal Counsel',
        status: 'CURRENT' as const,
      },
      {
        documentType: 'OTHER' as const,
        title: 'Third-Party Oversight Policy',
        version: 1,
        boardApproved: false,
        annualReviewDue: new Date('2026-12-01'),
        reviewFrequencyMonths: 12,
        lastReviewedAt: new Date('2025-12-01'),
        lastReviewedBy: 'Sarah Thompson, Head of Compliance',
        status: 'CURRENT' as const,
      },
    ];

    for (const policyDef of policyDefs) {
      await prisma.policyDocument.create({
        data: {
          firmId,
          documentType: policyDef.documentType,
          title: policyDef.title,
          version: policyDef.version,
          fileStoragePath: `/uploads/${firmId}/policies/${policyDef.documentType.toLowerCase()}-v${policyDef.version}.pdf`,
          fileHash: crypto.createHash('sha256').update(`policy-${policyDef.documentType}-v${policyDef.version}`).digest('hex').slice(0, 64),
          boardApproved: policyDef.boardApproved,
          boardApprovalDate: policyDef.boardApprovalDate ?? null,
          annualReviewDue: policyDef.annualReviewDue,
          reviewFrequencyMonths: policyDef.reviewFrequencyMonths,
          lastReviewedAt: policyDef.lastReviewedAt,
          lastReviewedBy: policyDef.lastReviewedBy,
          status: policyDef.status,
          uploadedBy: userId,
        },
      });
    }
    console.log('    6 policy documents created.');
  } else {
    console.log('    Policy documents already exist, skipping.');
  }

  // ─── Safeguarding Obligations ─────────────────────────────────────────────
  console.log('  Seeding Safeguarding Obligations...');

  const existingObligations = await prisma.safeguardingObligation.count({ where: { firmId } });
  if (existingObligations === 0) {
    const now = new Date();
    const fourAndHalfYearsAgo = new Date(now.getFullYear() - 4, now.getMonth() - 6, now.getDate());

    await prisma.safeguardingObligation.createMany({
      data: [
        {
          firmId,
          transactionRef: 'TXN-2026-00451',
          amount: 50000,
          currency: 'GBP',
          fundsReceivedAt: new Date('2026-03-20T09:15:00Z'),
          safeguardingStartedAt: new Date('2026-03-20T09:15:00Z'),
          fxType: 'UNKNOWN',
          isUnclaimed: false,
          status: 'ACTIVE',
        },
        {
          firmId,
          transactionRef: 'TXN-2026-00389',
          amount: 120000,
          currency: 'GBP',
          fundsReceivedAt: new Date('2026-03-18T14:30:00Z'),
          safeguardingStartedAt: new Date('2026-03-18T14:30:00Z'),
          fxType: 'PAYMENT_LINKED',
          isUnclaimed: false,
          status: 'ACTIVE',
        },
        {
          firmId,
          transactionRef: 'TXN-2026-00412',
          amount: 85000,
          currency: 'GBP',
          fundsReceivedAt: new Date('2026-03-19T11:45:00Z'),
          safeguardingStartedAt: new Date('2026-03-19T11:45:00Z'),
          fxType: 'FX_ONLY',
          isUnclaimed: false,
          status: 'ACTIVE',
        },
        {
          firmId,
          transactionRef: 'TXN-2026-00210',
          amount: 33500,
          currency: 'GBP',
          fundsReceivedAt: new Date('2026-02-15T10:00:00Z'),
          safeguardingStartedAt: new Date('2026-02-15T10:00:00Z'),
          safeguardingEndedAt: new Date('2026-03-01T16:30:00Z'),
          endReason: 'Payment executed to beneficiary',
          fxType: 'UNKNOWN',
          isUnclaimed: false,
          status: 'ENDED',
        },
        {
          firmId,
          transactionRef: 'TXN-2021-08834',
          amount: 2750.40,
          currency: 'GBP',
          fundsReceivedAt: fourAndHalfYearsAgo,
          safeguardingStartedAt: fourAndHalfYearsAgo,
          fxType: 'UNKNOWN',
          isUnclaimed: true,
          unclaimedSince: fourAndHalfYearsAgo,
          status: 'ACTIVE',
        },
      ],
    });
    console.log('    5 safeguarding obligations created.');
  } else {
    console.log('    Safeguarding obligations already exist, skipping.');
  }

  // ─── Breach Data ──────────────────────────────────────────────────────────
  console.log('  Seeding Breach Data...');

  const existingBreaches = await prisma.breach.count({ where: { firmId } });
  if (existingBreaches === 0) {
    await prisma.breach.createMany({
      data: [
        {
          firmId,
          breachType: 'SHORTFALL',
          severity: 'LOW',
          isNotifiable: false,
          materialDiscrepancyExceeded: false,
          currency: 'GBP',
          shortfallAmount: 4521.33,
          shortfallPercentage: 0.18,
          description: 'Minor shortfall detected during daily reconciliation. Caused by timing difference on inbound BACS payment credited next business day.',
          status: 'CLOSED',
          dateOccurred: new Date('2025-02-14'),
          dateIdentified: new Date('2025-02-14'),
          breachCategory: 'SHORTFALL',
          rootCauseAnalysis: 'BACS payment received end of day was not credited to safeguarding account until T+1. Timing difference only.',
          remediationAction: 'Shortfall automatically corrected when BACS payment settled. No client funds at risk.',
          remediationCompletionDate: new Date('2025-02-15'),
          resolvedAt: new Date('2025-02-15T09:30:00Z'),
          closedAt: new Date('2025-02-17T14:00:00Z'),
          closureEvidence: 'Confirmed settlement via bank statement. Reconciliation passed on 15/02/2025.',
          isMaterial: false,
          personResponsible: 'Mark Johnson',
        },
        {
          firmId,
          breachType: 'MISSING_DATA',
          severity: 'MEDIUM',
          isNotifiable: true,
          materialDiscrepancyExceeded: false,
          description: 'Bank statement for Northgate Bank safeguarding account not received by 10:00 AM cut-off. Unable to complete external reconciliation for the day.',
          status: 'CLOSED',
          dateOccurred: new Date('2025-03-22'),
          dateIdentified: new Date('2025-03-22'),
          breachCategory: 'RECONCILIATION_FAILURE',
          rootCauseAnalysis: 'Northgate Bank automated feed experienced a temporary outage. Manual statement obtained by 15:00.',
          remediationAction: 'Manual bank statement obtained. Reconciliation completed same day. Northgate Bank notified of feed issue.',
          remediationCompletionDate: new Date('2025-03-22'),
          resolvedAt: new Date('2025-03-22T16:00:00Z'),
          closedAt: new Date('2025-03-25T10:00:00Z'),
          closureEvidence: 'Manual reconciliation completed and verified. Northgate confirmed feed restored.',
          isMaterial: false,
          personResponsible: 'Sarah Thompson',
        },
        {
          firmId,
          breachType: 'SHORTFALL',
          severity: 'HIGH',
          isNotifiable: true,
          materialDiscrepancyExceeded: true,
          currency: 'GBP',
          shortfallAmount: 78500.00,
          shortfallPercentage: 3.12,
          description: 'Material shortfall detected. Client funds payment processed from wrong account, creating temporary £78,500 deficit in safeguarding pool.',
          status: 'RESOLVED',
          dateOccurred: new Date('2025-09-05'),
          dateIdentified: new Date('2025-09-05'),
          dateReportedToSeniorMgmt: new Date('2025-09-05T11:00:00Z'),
          breachCategory: 'SHORTFALL',
          rootCauseAnalysis: 'Operations team processed a bulk payment from the safeguarding account instead of the operational account. Human error in account selection.',
          remediationAction: 'Funds transferred back from operational account within 2 hours. Dual-authorisation control enhanced for account selection.',
          remediationCompletionDate: new Date('2025-09-05'),
          resolvedAt: new Date('2025-09-05T14:30:00Z'),
          isMaterial: true,
          fcaNotificationDate: new Date('2025-09-06T09:00:00Z'),
          fcaNotificationReference: 'FCA-SB-2025-09-001',
          personResponsible: 'Sarah Thompson',
        },
      ],
    });
    console.log('    3 breaches created.');
  } else {
    console.log('    Breaches already exist, skipping.');
  }

  // ─── Reconciliation Runs ──────────────────────────────────────────────────
  console.log('  Seeding Reconciliation Runs...');

  const existingRecons = await prisma.reconciliationRun.count({ where: { firmId } });
  if (existingRecons === 0) {
    // Find the rule pack
    const rulePack = await prisma.rulePack.findFirst({
      where: { regime: firm.regime, status: 'ACTIVE' },
    });

    if (rulePack) {
      const reconDates = [];
      // Generate last 5 business days of recon data
      const today = new Date();
      let d = new Date(today);
      d.setDate(d.getDate() - 1); // Start from yesterday
      let count = 0;
      while (count < 5) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          reconDates.push(new Date(d));
          count++;
        }
        d.setDate(d.getDate() - 1);
      }

      for (let i = 0; i < reconDates.length; i++) {
        const reconDate = reconDates[i];
        const requirement = 2543218.45 + (Math.random() - 0.5) * 50000;
        const resource = requirement + (Math.random() * 20000 - 2000); // Usually surplus
        const variance = resource - requirement;
        const variancePct = (variance / requirement) * 100;

        await prisma.reconciliationRun.create({
          data: {
            firmId,
            reconciliationDate: reconDate,
            reconciliationType: 'INTERNAL',
            fundType: 'ALL',
            currency: 'GBP',
            totalRequirement: requirement,
            totalResource: resource,
            variance,
            variancePercentage: variancePct,
            status: variance >= 0 ? 'MET' : 'SHORTFALL',
            rulePackId: rulePack.id,
            trigger: 'SCHEDULED',
            dataCompleteness: 'COMPLETE',
            startedAt: reconDate,
            completedAt: reconDate,
          },
        });
      }
      console.log(`    ${reconDates.length} reconciliation runs created.`);
    } else {
      console.log('    No active rule pack found, skipping reconciliation runs.');
    }
  } else {
    console.log('    Reconciliation runs already exist, skipping.');
  }

  console.log('\nDemo data seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
