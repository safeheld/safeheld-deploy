import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../utils/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { logAudit } from '../audit/service';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors';
import { FirmRegime, FirmStatus, SafeguardingMethod, UserRole } from '@prisma/client';
import { config } from '../../config';

const router = Router();

const createFirmSchema = z.object({
  name: z.string().min(1).max(255),
  fcaFrn: z.string().max(20).optional(),
  regime: z.nativeEnum(FirmRegime),
  baseCurrency: z.string().length(3).default('GBP'),
  safeguardingMethod: z.nativeEnum(SafeguardingMethod),
  materialDiscrepancyPct: z.number().optional(),
  materialDiscrepancyAbs: z.number().optional(),
});

const updateFirmSchema = createFirmSchema.partial().extend({
  status: z.nativeEnum(FirmStatus).optional(),
});

// POST /api/v1/admin/firms
router.post('/firms', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createFirmSchema.parse(req.body);
    
    // Find default rule pack for regime
    const defaultRulePack = await prisma.rulePack.findFirst({
      where: { regime: body.regime, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    const firm = await prisma.firm.create({
      data: {
        name: body.name,
        fcaFrn: body.fcaFrn,
        regime: body.regime,
        baseCurrency: body.baseCurrency,
        safeguardingMethod: body.safeguardingMethod,
        materialDiscrepancyPct: body.materialDiscrepancyPct,
        materialDiscrepancyAbs: body.materialDiscrepancyAbs,
      },
    });

    await logAudit({
      userId: req.user!.userId,
      action: 'FIRM_CREATED',
      entityType: 'firms',
      entityId: firm.id,
      details: { name: firm.name, regime: firm.regime, defaultRulePackId: defaultRulePack?.id },
      ipAddress: req.ip,
    });

    successResponse(res, { firm, defaultRulePack }, 201);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/firms
router.get('/firms', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const { status, regime } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (regime) where.regime = regime;

    const [firms, total] = await Promise.all([
      prisma.firm.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { _count: { select: { users: true, safeguardingAccounts: true } } },
      }),
      prisma.firm.count({ where }),
    ]);

    paginatedResponse(res, firms, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/firms/:id
router.get('/firms/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firm = await prisma.firm.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, status: true } },
        safeguardingAccounts: true,
        _count: { select: { clientAccounts: true, reconciliationRuns: true, breaches: true } },
      },
    });
    if (!firm) throw new NotFoundError('Firm');
    successResponse(res, firm);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/admin/firms/:id
router.put('/firms/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateFirmSchema.parse(req.body);
    const before = await prisma.firm.findUnique({ where: { id: req.params.id } });
    if (!before) throw new NotFoundError('Firm');

    const firm = await prisma.firm.update({
      where: { id: req.params.id },
      data: body,
    });

    await logAudit({
      firmId: firm.id,
      userId: req.user!.userId,
      action: 'FIRM_UPDATED',
      entityType: 'firms',
      entityId: firm.id,
      details: { before, after: firm },
      ipAddress: req.ip,
    });

    successResponse(res, firm);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/firms/:firmId/users
router.post('/firms/:firmId/users', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const firm = await prisma.firm.findUnique({ where: { id: req.params.firmId } });
    if (!firm) throw new NotFoundError('Firm');

    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(12),
      role: z.nativeEnum(UserRole),
      name: z.string().min(1).max(255),
      accessExpiresAt: z.string().datetime().optional(),
    });
    const body = schema.parse(req.body);

    const { createUser } = await import('../auth/service');
    const user = await createUser(
      {
        firmId: req.params.firmId,
        ...body,
        accessExpiresAt: body.accessExpiresAt ? new Date(body.accessExpiresAt) : undefined,
      },
      req.user!.userId
    );

    successResponse(res, user, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/users/:userId/reset-mfa
router.post('/users/:userId/reset-mfa', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) throw new NotFoundError('User');

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaEnabled: false },
    });

    await logAudit({
      firmId: user.firmId,
      userId: req.user!.userId,
      action: 'MFA_RESET',
      entityType: 'users',
      entityId: user.id,
      details: { email: user.email, resetBy: req.user!.email },
      ipAddress: req.ip,
    });

    successResponse(res, { message: `MFA reset for ${user.email}` });
  } catch (err) {
    next(err);
  }
});

export { router as adminRouter };
