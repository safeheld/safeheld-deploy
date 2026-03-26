import PDFDocument from 'pdfkit';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';

// ─── Types ──────────────────────────────────────────────────────────────────

type ComponentStatus = 'GREEN' | 'AMBER' | 'RED';

interface ComponentResult {
  name: string;
  status: ComponentStatus;
  data: unknown;
  lastUpdated: string | null;
  notes?: string;
}

interface ResolutionPackResult {
  firmId: string;
  firmName: string;
  generatedAt: string;
  version: number;
  completenessPercent: number;
  overallStatus: ComponentStatus;
  components: ComponentResult[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function componentStatus(hasData: boolean, lastUpdated: Date | null, staleThresholdDays = 30): ComponentStatus {
  if (!hasData) return 'RED';
  if (!lastUpdated) return 'AMBER';
  const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate > staleThresholdDays) return 'AMBER';
  return 'GREEN';
}

function overallStatus(components: ComponentResult[]): ComponentStatus {
  if (components.some(c => c.status === 'RED')) return 'RED';
  if (components.some(c => c.status === 'AMBER')) return 'AMBER';
  return 'GREEN';
}

function completenessPercent(components: ComponentResult[]): number {
  const greenCount = components.filter(c => c.status === 'GREEN').length;
  const amberCount = components.filter(c => c.status === 'AMBER').length;
  // GREEN = full credit, AMBER = half credit, RED = none
  const score = (greenCount * 100 + amberCount * 50) / components.length;
  return Math.round(score);
}

// ─── Main Functions ─────────────────────────────────────────────────────────

export async function generateResolutionPack(firmId: string): Promise<ResolutionPackResult> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  // Fetch all data in parallel
  const [
    safeguardingAccounts,
    clientAssets,
    agentsAndDistributors,
    policyDocuments,
    responsibilityAssignments,
    acknowledgementLetters,
    recentReconciliations,
    insurancePolicies,
    clientAccounts,
    latestBankBalances,
  ] = await Promise.all([
    // 1. Safeguarding accounts
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
      include: {
        bankBalances: {
          orderBy: { balanceDate: 'desc' },
          take: 1,
        },
      },
    }),
    // 2. Client / relevant assets
    prisma.clientAsset.findMany({
      where: { firmId, status: 'HELD' },
      orderBy: { recordDate: 'desc' },
      take: 200,
    }),
    // 3. Agents and distributors
    prisma.agentAndDistributor.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
    // 4. Policy library
    prisma.policyDocument.findMany({
      where: { firmId, status: 'CURRENT' },
      select: { id: true, title: true, documentType: true, version: true, boardApproved: true, annualReviewDue: true },
    }),
    // 7. Key contacts (responsibility assignments)
    prisma.responsibilityAssignment.findMany({
      where: { firmId, effectiveTo: null },
      orderBy: { roleType: 'asc' },
    }),
    // 8. Acknowledgement letters
    prisma.acknowledgementLetter.findMany({
      where: { firmId, status: 'CURRENT' },
      include: { safeguardingAccount: { select: { bankName: true, accountNumberMasked: true } } },
    }),
    // 9. Latest reconciliations
    prisma.reconciliationRun.findMany({
      where: { firmId },
      orderBy: { reconciliationDate: 'desc' },
      take: 5,
    }),
    // 10. Insurance / guarantee policies
    prisma.insuranceGuarantee.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
    // 11. Client accounts (for unallocated/unidentified)
    prisma.clientAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
      include: {
        balances: {
          orderBy: { balanceDate: 'desc' },
          take: 1,
        },
      },
    }),
    // For latest bank balance dates
    prisma.bankBalance.findMany({
      where: { firmId },
      orderBy: { balanceDate: 'desc' },
      take: 1,
    }),
  ]);

  const now = new Date();

  // Component 1: Safeguarding accounts
  const safeguardingAccountData = safeguardingAccounts.map(a => ({
    id: a.id,
    bankName: a.bankName,
    accountNumber: a.accountNumberMasked,
    sortCode: a.sortCode,
    currency: a.currency,
    balance: a.bankBalances[0] ? Number(a.bankBalances[0].closingBalance) : null,
    lastVerified: a.bankBalances[0]?.balanceDate?.toISOString().split('T')[0] || null,
  }));
  const lastSafeguardingUpdate = latestBankBalances[0]?.balanceDate || null;

  // Component 2: Relevant asset accounts
  const assetAccountData = clientAssets.reduce((acc: Record<string, { custodian: string; assetTypes: Set<string>; totalValue: number; lastVerified: string | null }>, a) => {
    const key = a.custodian || 'Unknown';
    if (!acc[key]) acc[key] = { custodian: key, assetTypes: new Set(), totalValue: 0, lastVerified: null };
    acc[key].assetTypes.add(a.assetType);
    acc[key].totalValue += Number(a.marketValue || 0);
    const rd = a.recordDate?.toISOString().split('T')[0] || null;
    if (rd && (!acc[key].lastVerified || rd > acc[key].lastVerified)) acc[key].lastVerified = rd;
    return acc;
  }, {} as Record<string, { custodian: string; assetTypes: Set<string>; totalValue: number; lastVerified: string | null }>);
  const assetSummary = Object.values(assetAccountData).map(v => ({
    custodian: v.custodian,
    assetTypes: [...v.assetTypes],
    totalValue: v.totalValue,
    lastVerified: v.lastVerified,
  }));
  const lastAssetUpdate = clientAssets[0]?.recordDate || null;

  // Component 3: Agents and distributors
  const agentData = agentsAndDistributors.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    contactName: a.contactName,
    contactEmail: a.contactEmail,
    handlesRelevantFunds: a.handlesRelevantFunds,
  }));
  const lastAgentUpdate = agentsAndDistributors.length > 0
    ? new Date(Math.max(...agentsAndDistributors.map(a => a.updatedAt.getTime())))
    : null;

  // Component 4: Policy library link
  const policyData = policyDocuments.map(p => ({
    id: p.id,
    title: p.title,
    type: p.documentType,
    version: p.version,
    boardApproved: p.boardApproved,
    annualReviewDue: p.annualReviewDue?.toISOString().split('T')[0] || null,
  }));

  // Component 5: Client money calculation methodology
  const methodologyData = {
    safeguardingMethod: firm.safeguardingMethod,
    regime: firm.regime,
    baseCurrency: firm.baseCurrency,
    isStandard: firm.safeguardingMethod === 'SEGREGATION',
  };

  // Component 6: Pooling event triggers
  const poolingData = {
    safeguardingMethod: firm.safeguardingMethod,
    regime: firm.regime,
    note: 'Pooling events are triggered per the PS25 and CASS framework when a firm enters administration, causing client funds to be distributed pro rata.',
  };

  // Component 7: Key contacts
  const contactData = responsibilityAssignments.map(r => ({
    id: r.id,
    roleType: r.roleType,
    personName: r.personName,
    jobTitle: r.jobTitle,
    smfFunction: r.smfFunction,
    effectiveFrom: r.effectiveFrom.toISOString().split('T')[0],
  }));
  const lastContactUpdate = responsibilityAssignments.length > 0
    ? new Date(Math.max(...responsibilityAssignments.map(r => r.updatedAt.getTime())))
    : null;

  // Component 8: Acknowledgement letter statuses
  const letterData = acknowledgementLetters.map(l => ({
    id: l.id,
    bankName: l.safeguardingAccount.bankName,
    accountNumber: l.safeguardingAccount.accountNumberMasked,
    status: l.status,
    effectiveDate: l.effectiveDate.toISOString().split('T')[0],
    annualReviewDue: l.annualReviewDue.toISOString().split('T')[0],
  }));
  // Check how many active accounts have current letters
  const accountsWithLetters = new Set(acknowledgementLetters.map(l => l.safeguardingAccountId));
  const accountsMissingLetters = safeguardingAccounts.filter(a => !accountsWithLetters.has(a.id));

  // Component 9: Latest reconciliation results
  const reconData = recentReconciliations.map(r => ({
    id: r.id,
    date: r.reconciliationDate.toISOString().split('T')[0],
    type: r.reconciliationType,
    currency: r.currency,
    requirement: Number(r.totalRequirement),
    resource: Number(r.totalResource),
    variance: Number(r.variance),
    status: r.status,
  }));
  const lastReconDate = recentReconciliations[0]?.reconciliationDate || null;

  // Component 10: Insurance/guarantee policies
  const insuranceData = insurancePolicies.map(p => ({
    id: p.id,
    insurerName: p.insurerName,
    policyNumber: p.policyNumber,
    coverageType: p.coverageType,
    coverageAmount: Number(p.coverageAmount),
    coverageCurrency: p.coverageCurrency,
    effectiveDate: p.effectiveDate.toISOString().split('T')[0],
    expiryDate: p.expiryDate.toISOString().split('T')[0],
    status: p.status,
  }));

  // Component 11: Unallocated/unidentified funds
  // Look for client accounts with no clientId or special markers
  const totalClientBalance = clientAccounts.reduce((sum, ca) => {
    const latestBal = ca.balances[0];
    return sum + (latestBal ? Number(latestBal.balance) : 0);
  }, 0);
  const unallocatedData = {
    totalClientAccounts: clientAccounts.length,
    totalBalance: totalClientBalance,
    note: 'Unallocated funds analysis based on client account balances. Manual review recommended for aged items.',
  };

  // Component 12: Client contracts summary
  const contractData = {
    totalActiveClients: clientAccounts.length,
    note: 'Client contract details are maintained in the firm\'s own records. This summary reflects active client accounts on the platform.',
  };

  // Build all 12 components
  const components: ComponentResult[] = [
    {
      name: 'Safeguarding Accounts',
      status: componentStatus(safeguardingAccountData.length > 0, lastSafeguardingUpdate),
      data: safeguardingAccountData,
      lastUpdated: lastSafeguardingUpdate?.toISOString().split('T')[0] || null,
    },
    {
      name: 'Relevant Asset Accounts',
      status: componentStatus(assetSummary.length > 0, lastAssetUpdate),
      data: assetSummary,
      lastUpdated: lastAssetUpdate?.toISOString().split('T')[0] || null,
      notes: assetSummary.length === 0 ? 'No relevant assets held — may be expected for payment firms' : undefined,
    },
    {
      name: 'Agents and Distributors',
      status: componentStatus(true, lastAgentUpdate), // Always considered populated (empty list is valid)
      data: agentData,
      lastUpdated: lastAgentUpdate?.toISOString().split('T')[0] || null,
      notes: agentData.length === 0 ? 'No agents or distributors registered' : undefined,
    },
    {
      name: 'Policy Library',
      status: componentStatus(policyData.length > 0, policyData.length > 0 ? now : null),
      data: policyData,
      lastUpdated: policyData.length > 0 ? now.toISOString().split('T')[0] : null,
    },
    {
      name: 'Client Money Calculation Methodology',
      status: 'GREEN' as ComponentStatus, // Always populated from firm config
      data: methodologyData,
      lastUpdated: firm.updatedAt.toISOString().split('T')[0],
    },
    {
      name: 'Pooling Event Triggers',
      status: 'GREEN' as ComponentStatus,
      data: poolingData,
      lastUpdated: firm.updatedAt.toISOString().split('T')[0],
    },
    {
      name: 'Key Contacts',
      status: componentStatus(contactData.length > 0, lastContactUpdate),
      data: contactData,
      lastUpdated: lastContactUpdate?.toISOString().split('T')[0] || null,
    },
    {
      name: 'Acknowledgement Letter Statuses',
      status: accountsMissingLetters.length > 0 ? 'AMBER' : componentStatus(letterData.length > 0, now),
      data: {
        letters: letterData,
        accountsMissingLetters: accountsMissingLetters.map(a => ({
          id: a.id,
          bankName: a.bankName,
          accountNumber: a.accountNumberMasked,
        })),
      },
      lastUpdated: letterData.length > 0 ? now.toISOString().split('T')[0] : null,
      notes: accountsMissingLetters.length > 0
        ? `${accountsMissingLetters.length} active account(s) missing acknowledgement letters`
        : undefined,
    },
    {
      name: 'Latest Reconciliation Results',
      status: componentStatus(reconData.length > 0, lastReconDate),
      data: reconData,
      lastUpdated: lastReconDate?.toISOString().split('T')[0] || null,
    },
    {
      name: 'Insurance and Guarantee Policies',
      status: firm.safeguardingMethod === 'SEGREGATION'
        ? ('GREEN' as ComponentStatus) // Not required for segregation method
        : componentStatus(insuranceData.length > 0, insuranceData.length > 0 ? now : null),
      data: insuranceData,
      lastUpdated: insuranceData.length > 0 ? now.toISOString().split('T')[0] : null,
      notes: firm.safeguardingMethod === 'SEGREGATION' ? 'Not required — firm uses segregation method' : undefined,
    },
    {
      name: 'Unallocated and Unidentified Funds',
      status: componentStatus(true, now),
      data: unallocatedData,
      lastUpdated: now.toISOString().split('T')[0],
    },
    {
      name: 'Client Contracts Summary',
      status: componentStatus(clientAccounts.length > 0, now),
      data: contractData,
      lastUpdated: now.toISOString().split('T')[0],
    },
  ];

  const result: ResolutionPackResult = {
    firmId,
    firmName: firm.name,
    generatedAt: now.toISOString(),
    version: 1,
    completenessPercent: completenessPercent(components),
    overallStatus: overallStatus(components),
    components,
  };

  // Persist to DB
  const existingPacks = await prisma.resolutionPack.count({ where: { firmId } });
  const pack = await prisma.resolutionPack.create({
    data: {
      firmId,
      version: existingPacks + 1,
      completenessScore: result.completenessPercent,
      components: result.components as any,
      componentStatuses: Object.fromEntries(result.components.map(c => [c.name, c.status])),
      lastChangedAt: now,
    },
  });

  result.version = pack.version;

  logger.info({ firmId, version: pack.version, completeness: result.completenessPercent }, 'Resolution pack generated');

  return result;
}

export async function getResolutionPackHistory(firmId: string): Promise<{
  packs: Array<{ id: string; version: number; generatedAt: string; completenessScore: number; overallStatus: string }>;
}> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  const packs = await prisma.resolutionPack.findMany({
    where: { firmId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      generatedAt: true,
      completenessScore: true,
      componentStatuses: true,
    },
  });

  return {
    packs: packs.map(p => {
      const statuses = p.componentStatuses as Record<string, string>;
      const statusValues = Object.values(statuses);
      let overall: string = 'GREEN';
      if (statusValues.includes('RED')) overall = 'RED';
      else if (statusValues.includes('AMBER')) overall = 'AMBER';

      return {
        id: p.id,
        version: p.version,
        generatedAt: p.generatedAt.toISOString(),
        completenessScore: p.completenessScore,
        overallStatus: overall,
      };
    }),
  };
}

export async function downloadResolutionPackPdf(firmId: string, packId?: string): Promise<Buffer> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  // Get the pack — latest or specific
  let pack;
  if (packId) {
    pack = await prisma.resolutionPack.findFirst({ where: { id: packId, firmId } });
  } else {
    pack = await prisma.resolutionPack.findFirst({
      where: { firmId },
      orderBy: { version: 'desc' },
    });
  }

  if (!pack) throw new NotFoundError('Resolution Pack');

  const components = pack.components as unknown as ComponentResult[];
  const componentStatuses = pack.componentStatuses as Record<string, string>;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_MARGIN = 50;
    const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;
    const NAVY = '#0C1445';
    const ACCENT = '#3D3DFF';
    const WHITE = '#FFFFFF';
    const TEXT_PRIMARY = '#0F172A';
    const TEXT_SECONDARY = '#64748B';

    // ─── Header ───
    doc.rect(0, 0, 595.28, 80).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE)
      .text('Safeheld', PAGE_MARGIN, 22);
    doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
      .text(firm.name, PAGE_MARGIN, 28, { width: CONTENT_WIDTH, align: 'right' });
    doc.rect(0, 80, 595.28, 4).fill(ACCENT);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_PRIMARY)
      .text('Resolution Pack — CASS 10A.2', PAGE_MARGIN, 100);
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
      .text(`Version ${pack.version} | Generated ${pack.generatedAt.toISOString().split('T')[0]} | Completeness: ${pack.completenessScore}%`, PAGE_MARGIN, 124);

    doc.y = 150;

    // ─── Overall Status ───
    const statusColour = pack.completenessScore >= 80 ? '#16A34A' : pack.completenessScore >= 50 ? '#D97706' : '#DC2626';
    doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 30).fill(statusColour);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(WHITE)
      .text(`Overall Status: ${pack.completenessScore}% Complete`, PAGE_MARGIN + 10, doc.y - 22);
    doc.y += 15;

    // ─── Components ───
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const status = componentStatuses[comp.name] || comp.status || 'RED';

      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }

      doc.moveDown(0.5);

      // Section header
      const sColor = status === 'GREEN' ? '#16A34A' : status === 'AMBER' ? '#D97706' : '#DC2626';
      doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 24).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE)
        .text(`${i + 1}. ${comp.name}`, PAGE_MARGIN + 8, doc.y + 6, { continued: false });
      // Status badge
      doc.font('Helvetica-Bold').fontSize(9).fillColor(sColor)
        .text(status, PAGE_MARGIN + CONTENT_WIDTH - 60, doc.y - 12, { width: 50, align: 'right' });
      doc.y += 4;

      // Data summary
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY);
      if (comp.lastUpdated) {
        doc.text(`Last updated: ${comp.lastUpdated}`, PAGE_MARGIN + 8, doc.y + 2);
        doc.y += 2;
      }
      if (comp.notes) {
        doc.font('Helvetica-Oblique').fontSize(8).fillColor(TEXT_SECONDARY)
          .text(comp.notes, PAGE_MARGIN + 8, doc.y + 2, { width: CONTENT_WIDTH - 16 });
        doc.y += 2;
      }

      // Render component data as formatted text
      const dataStr = JSON.stringify(comp.data, null, 2);
      const truncated = dataStr.length > 600 ? dataStr.slice(0, 600) + '\n  ...' : dataStr;
      doc.font('Courier').fontSize(7).fillColor(TEXT_SECONDARY)
        .text(truncated, PAGE_MARGIN + 8, doc.y + 4, { width: CONTENT_WIDTH - 16 });
      doc.y += 4;
    }

    // Footer
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_SECONDARY)
      .text('This document is auto-generated by Safeheld and constitutes the firm\'s resolution pack per CASS 10A.2. It should be reviewed by the CASS Oversight Officer and updated regularly.', PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });

    doc.end();
  });
}

export async function checkComponentStaleness(firmId: string): Promise<{
  alerts: Array<{ component: string; lastUpdated: string | null; daysSinceUpdate: number | null; status: 'STALE' | 'OK' | 'MISSING' }>;
}> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new NotFoundError('Firm');

  // Get the latest pack
  const latestPack = await prisma.resolutionPack.findFirst({
    where: { firmId },
    orderBy: { version: 'desc' },
  });

  if (!latestPack) {
    return {
      alerts: [{
        component: 'Resolution Pack',
        lastUpdated: null,
        daysSinceUpdate: null,
        status: 'MISSING',
      }],
    };
  }

  const components = latestPack.components as unknown as ComponentResult[];
  const now = Date.now();
  const STALE_THRESHOLD_DAYS = 30;

  const alerts = components.map(comp => {
    if (!comp.lastUpdated) {
      return {
        component: comp.name,
        lastUpdated: null,
        daysSinceUpdate: null,
        status: 'MISSING' as const,
      };
    }
    const daysSince = Math.floor((now - new Date(comp.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
    return {
      component: comp.name,
      lastUpdated: comp.lastUpdated,
      daysSinceUpdate: daysSince,
      status: daysSince > STALE_THRESHOLD_DAYS ? 'STALE' as const : 'OK' as const,
    };
  });

  return { alerts };
}
