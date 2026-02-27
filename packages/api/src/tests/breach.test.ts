import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectBreaches,
  acknowledgeBreachService,
  updateBreachStatusService,
} from '../modules/breach/service';
import { prisma } from '../utils/prisma';

const mockPrisma = prisma as any;

// ─── detectBreaches ─────────────────────────────────────────────────────────

describe('detectBreaches', () => {
  const firmId = 'firm-001';
  const reconciliationRunId = 'run-001';

  const mockFirm = {
    name: 'Test Firm Ltd',
    materialDiscrepancyPct: 5,   // 5%
    materialDiscrepancyAbs: 1000, // £1,000
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.breach.findFirst.mockResolvedValue(null);
    mockPrisma.breach.create.mockResolvedValue({ id: 'new-breach-001', description: 'test breach' });
    mockPrisma.user.findMany.mockResolvedValue([]);  // no users to email
  });

  it('creates a SHORTFALL breach when internal shortfall is material', async () => {
    // 10% shortfall — above 5% threshold
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -10000,
      variancePct: -10,
      requirement: 100000,
      firm: mockFirm,
    });

    expect(mockPrisma.breach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmId,
          reconciliationRunId,
          breachType: 'SHORTFALL',
          status: 'DETECTED',
          currency: 'GBP',
        }),
      }),
    );
  });

  it('records breach as non-material when shortfall is below thresholds', async () => {
    // 0.5% / £400 — below 5%/£1000 thresholds → breach created but NOT marked material
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -400,
      variancePct: -0.5,
      requirement: 80000,
      firm: mockFirm,
    });

    // Service always creates a breach for any shortfall; isMaterial=false → not notifiable
    const createCall = mockPrisma.breach.create.mock.calls[0][0];
    expect(createCall.data.materialDiscrepancyExceeded).toBe(false);
    expect(createCall.data.isNotifiable).toBe(false);
    expect(createCall.data.severity).toBe('LOW');
  });

  it('does not create a breach when status is MET', async () => {
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'MET',
      variance: 0,
      variancePct: 0,
      requirement: 100000,
      firm: mockFirm,
    });

    expect(mockPrisma.breach.create).not.toHaveBeenCalled();
  });

  it('assigns CRITICAL severity for very large shortfall', async () => {
    // 50% shortfall — well above 5% threshold × 5 = 25%
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -50000,
      variancePct: -50,
      requirement: 100000,
      firm: mockFirm,
    });

    const createCall = mockPrisma.breach.create.mock.calls[0][0];
    expect(createCall.data.severity).toBe('CRITICAL');
  });

  it('assigns MEDIUM severity for a breach just above the pct threshold but below abs×3', async () => {
    // 5.5% of 50k = £2,750 variance
    // pctThreshold=5 → 5.5 >= 5 → would be MEDIUM
    // absThreshold=1000 × 3 = £3,000 → 2750 < 3000 → does NOT trigger HIGH
    // absThreshold × 5 = £10,000 and pctThreshold × 5 = 25% → CRITICAL not triggered
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -2750,
      variancePct: -5.5,
      requirement: 50000,
      firm: mockFirm,
    });

    const createCall = mockPrisma.breach.create.mock.calls[0][0];
    expect(createCall.data.severity).toBe('MEDIUM');
  });

  it('skips creating a breach if one already exists for this run+currency', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue({ id: 'existing-breach' });

    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'INTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -20000,
      variancePct: -20,
      requirement: 100000,
      firm: mockFirm,
    });

    expect(mockPrisma.breach.create).not.toHaveBeenCalled();
  });

  it('creates an EXTERNAL_BREAK breach when break is aged ≥2 business days', async () => {
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'EXTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -5000,
      variancePct: -5,
      requirement: 100000,
      firm: mockFirm,
      breakAgeDays: 3, // ≥ 2 → creates breach
    });

    expect(mockPrisma.breach.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          breachType: 'EXTERNAL_BREAK',
          status: 'DETECTED',
        }),
      }),
    );
  });

  it('does not create EXTERNAL_BREAK when break is too fresh (<2 days)', async () => {
    await detectBreaches({
      firmId,
      reconciliationRunId,
      reconciliationType: 'EXTERNAL',
      currency: 'GBP',
      status: 'SHORTFALL',
      variance: -5000,
      variancePct: -5,
      requirement: 100000,
      firm: mockFirm,
      breakAgeDays: 1, // < 2 → no breach yet
    });

    expect(mockPrisma.breach.create).not.toHaveBeenCalled();
  });
});

// ─── acknowledgeBreachService ────────────────────────────────────────────────

describe('acknowledgeBreachService', () => {
  const breachId = 'breach-001';
  const firmId   = 'firm-001';
  const userId   = 'user-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transitions DETECTED → ACKNOWLEDGED', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue({
      id: breachId,
      status: 'DETECTED',
      firmId,
    });
    mockPrisma.breach.update.mockResolvedValue({
      id: breachId,
      status: 'ACKNOWLEDGED',
    });

    const result = await acknowledgeBreachService(
      breachId,
      firmId,
      userId,
      'Topping up client money account',
    );

    expect(mockPrisma.breach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: breachId },
        data: expect.objectContaining({
          status: 'ACKNOWLEDGED',
          acknowledgedBy: userId,
        }),
      }),
    );
    expect(result.status).toBe('ACKNOWLEDGED');
  });

  it('throws if breach not found', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue(null);

    await expect(
      acknowledgeBreachService('nonexistent', firmId, userId, 'test'),
    ).rejects.toThrow('Breach not found');
  });

  it('throws if breach is not in DETECTED state', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue({
      id: breachId,
      status: 'ACKNOWLEDGED',
      firmId,
    });

    await expect(
      acknowledgeBreachService(breachId, firmId, userId, 'test'),
    ).rejects.toThrow('DETECTED state');
  });
});

// ─── updateBreachStatusService ───────────────────────────────────────────────

describe('updateBreachStatusService', () => {
  const breachId = 'breach-001';
  const firmId   = 'firm-001';
  const userId   = 'user-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validTransitions: Array<[string, string]> = [
    ['ACKNOWLEDGED', 'REMEDIATING'],
    ['REMEDIATING',  'RESOLVED'],
    ['RESOLVED',     'CLOSED'],
  ];

  validTransitions.forEach(([from, to]) => {
    it(`allows transition from ${from} → ${to}`, async () => {
      mockPrisma.breach.findFirst.mockResolvedValue({
        id: breachId,
        status: from,
        firmId,
      });
      mockPrisma.breach.update.mockResolvedValue({ id: breachId, status: to });

      const result = await updateBreachStatusService(
        breachId,
        firmId,
        userId,
        to as any,
        'Evidence doc',
      );

      expect(result.status).toBe(to);
    });
  });

  it('rejects invalid transition DETECTED → CLOSED', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue({
      id: breachId,
      status: 'DETECTED',
      firmId,
    });

    await expect(
      updateBreachStatusService(breachId, firmId, userId, 'CLOSED' as any, 'test'),
    ).rejects.toThrow(/Cannot transition/);
  });

  it('rejects backwards transition RESOLVED → REMEDIATING', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue({
      id: breachId,
      status: 'RESOLVED',
      firmId,
    });

    await expect(
      updateBreachStatusService(breachId, firmId, userId, 'REMEDIATING' as any, 'test'),
    ).rejects.toThrow(/Cannot transition/);
  });

  it('throws if breach not found (wrong firmId)', async () => {
    mockPrisma.breach.findFirst.mockResolvedValue(null);

    await expect(
      updateBreachStatusService(breachId, 'wrong-firm', userId, 'REMEDIATING' as any),
    ).rejects.toThrow('Breach not found');
  });
});
