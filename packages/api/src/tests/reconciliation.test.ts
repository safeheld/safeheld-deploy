import { describe, it, expect, vi, beforeEach } from 'vitest';
import { businessDaysBetween, runReconciliation } from '../modules/reconciliation/service';
import { prisma } from '../utils/prisma';

const mockPrisma = prisma as any;

// ─── businessDaysBetween ────────────────────────────────────────────────────

describe('businessDaysBetween', () => {
  it('returns 0 for same day', () => {
    const d = new Date('2024-01-15'); // Monday
    expect(businessDaysBetween(d, d)).toBe(0);
  });

  it('counts Mon–Fri correctly over one week', () => {
    const from = new Date('2024-01-15'); // Monday
    const to   = new Date('2024-01-22'); // next Monday
    expect(businessDaysBetween(from, to)).toBe(5);
  });

  it('skips weekends', () => {
    const from = new Date('2024-01-19'); // Friday
    const to   = new Date('2024-01-22'); // Monday
    expect(businessDaysBetween(from, to)).toBe(1);
  });

  it('returns 1 for consecutive business days', () => {
    const from = new Date('2024-01-15'); // Monday
    const to   = new Date('2024-01-16'); // Tuesday
    expect(businessDaysBetween(from, to)).toBe(1);
  });

  it('handles Mon through Sat (5 business days)', () => {
    const from = new Date('2024-01-15'); // Monday
    const to   = new Date('2024-01-20'); // Saturday
    expect(businessDaysBetween(from, to)).toBe(5);
  });

  it('returns 0 when to is before from', () => {
    const from = new Date('2024-01-22');
    const to   = new Date('2024-01-15');
    expect(businessDaysBetween(from, to)).toBe(0);
  });
});

// ─── runReconciliation ──────────────────────────────────────────────────────

describe('runReconciliation', () => {
  const firmId = 'firm-001';
  const reconciliationDate = new Date('2024-01-15'); // a Monday

  const mockFirm = {
    id: firmId,
    name: 'Test Firm',
    regime: 'PS25',
    materialDiscrepancyPct: 5,
    materialDiscrepancyAbs: 1000,
    safeguardingAccounts: [
      { id: 'acct-001', currency: 'GBP', status: 'ACTIVE', fundType: 'CLIENT_MONEY' },
    ],
  };

  const mockRulePack = { id: 'rp-001', regime: 'PS25', status: 'ACTIVE', version: 1 };

  // Helper: default balanced external mocks — no breaks, no breaches
  function setupBalancedMocks() {
    mockPrisma.firm.findUnique.mockResolvedValue(mockFirm);
    mockPrisma.rulePack.findFirst.mockResolvedValue(mockRulePack);

    // Internal: client GBP 100k = ledger GBP 100k → MET
    mockPrisma.clientBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { balance: 100000 } },
    ]);
    // safeguardingLedgerBalance called twice:
    //   1st: internal (by currency across firm)
    //   2nd: external (by currency per account)
    mockPrisma.safeguardingLedgerBalance.groupBy
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 100000 } }]) // internal
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 100000 } }]); // external

    // bankBalance: per currency, uses closingBalance
    mockPrisma.bankBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { closingBalance: 100000 } },
    ]);

    // ReconciliationRun.create returns an id
    mockPrisma.reconciliationRun.create.mockResolvedValue({ id: 'run-001' });

    // No existing breaks
    mockPrisma.reconciliationBreak.findFirst.mockResolvedValue(null);

    // No existing breaches, no users to notify
    mockPrisma.breach.findFirst.mockResolvedValue(null);
    mockPrisma.breach.create.mockResolvedValue({ id: 'breach-001', description: 'test' });
    mockPrisma.user.findMany.mockResolvedValue([]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if firm not found', async () => {
    mockPrisma.firm.findUnique.mockResolvedValue(null);

    await expect(
      runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' }),
    ).rejects.toThrow(`Firm ${firmId} not found`);
  });

  it('throws if no active rule pack', async () => {
    mockPrisma.firm.findUnique.mockResolvedValue(mockFirm);
    mockPrisma.rulePack.findFirst.mockResolvedValue(null);

    await expect(
      runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' }),
    ).rejects.toThrow('No active rule pack found');
  });

  it('returns run IDs when recon completes (2 runs: internal + external)', async () => {
    setupBalancedMocks();
    mockPrisma.reconciliationRun.create
      .mockResolvedValueOnce({ id: 'run-internal-001' })
      .mockResolvedValueOnce({ id: 'run-external-001' });

    const ids = await runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' });

    expect(ids).toHaveLength(2);
    expect(ids).toContain('run-internal-001');
    expect(ids).toContain('run-external-001');
  });

  it('does not create a break when internal balances are equal', async () => {
    setupBalancedMocks();

    await runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' });

    // Internal recon: 100k = 100k → MET, no break
    // External recon: 100k ledger = 100k bank → MET, no break
    expect(mockPrisma.reconciliationBreak.create).not.toHaveBeenCalled();
  });

  it('creates a reconciliationRun with SHORTFALL status when ledger < client', async () => {
    mockPrisma.firm.findUnique.mockResolvedValue(mockFirm);
    mockPrisma.rulePack.findFirst.mockResolvedValue(mockRulePack);

    // Client requires 100k but ledger has only 90k → SHORTFALL
    mockPrisma.clientBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { balance: 100000 } },
    ]);
    mockPrisma.safeguardingLedgerBalance.groupBy
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 90000 } }]) // internal
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 90000 } }]); // external
    mockPrisma.bankBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { closingBalance: 90000 } },
    ]);

    mockPrisma.reconciliationRun.create.mockResolvedValue({ id: 'run-001' });
    mockPrisma.reconciliationBreak.findFirst.mockResolvedValue(null);
    mockPrisma.breach.findFirst.mockResolvedValue(null);
    mockPrisma.breach.create.mockResolvedValue({ id: 'breach-001', description: 'test' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await runReconciliation({ firmId, reconciliationDate, trigger: 'SCHEDULED' });

    // Internal run should be created with SHORTFALL status
    expect(mockPrisma.reconciliationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reconciliationType: 'INTERNAL',
          status: 'SHORTFALL',
          currency: 'GBP',
        }),
      }),
    );
  });

  it('creates an external break when bank balance differs from ledger', async () => {
    mockPrisma.firm.findUnique.mockResolvedValue(mockFirm);
    mockPrisma.rulePack.findFirst.mockResolvedValue(mockRulePack);

    // Internal: balanced
    mockPrisma.clientBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { balance: 100000 } },
    ]);
    mockPrisma.safeguardingLedgerBalance.groupBy
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 100000 } }]) // internal
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 100000 } }]); // external ledger

    // Bank shows less → variance = 95000 - 100000 = -5000
    mockPrisma.bankBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { closingBalance: 95000 } },
    ]);

    mockPrisma.reconciliationRun.create.mockResolvedValue({ id: 'run-ext-001' });
    mockPrisma.reconciliationBreak.findFirst.mockResolvedValue(null);
    mockPrisma.breach.findFirst.mockResolvedValue(null);
    mockPrisma.breach.create.mockResolvedValue({ id: 'breach-ext', description: 'test' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' });

    // External break should be created with the variance
    expect(mockPrisma.reconciliationBreak.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmId,
          safeguardingAccountId: 'acct-001',
          variance: -5000,
        }),
      }),
    );
  });

  it('creates a material internal breach above the threshold', async () => {
    mockPrisma.firm.findUnique.mockResolvedValue(mockFirm);
    mockPrisma.rulePack.findFirst.mockResolvedValue(mockRulePack);

    // 10% shortfall → material (threshold is 5%)
    mockPrisma.clientBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { balance: 100000 } },
    ]);
    mockPrisma.safeguardingLedgerBalance.groupBy
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 90000 } }])
      .mockResolvedValueOnce([{ currency: 'GBP', _sum: { balance: 90000 } }]);
    mockPrisma.bankBalance.groupBy.mockResolvedValue([
      { currency: 'GBP', _sum: { closingBalance: 90000 } },
    ]);

    mockPrisma.reconciliationRun.create.mockResolvedValue({ id: 'run-001' });
    mockPrisma.reconciliationBreak.findFirst.mockResolvedValue(null);
    mockPrisma.breach.findFirst.mockResolvedValue(null);
    mockPrisma.breach.create.mockResolvedValue({ id: 'new-breach', description: 'test' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await runReconciliation({ firmId, reconciliationDate, trigger: 'MANUAL' });

    // A SHORTFALL breach should be created
    expect(mockPrisma.breach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          breachType: 'SHORTFALL',
          currency: 'GBP',
          status: 'DETECTED',
        }),
      }),
    );
  });
});
