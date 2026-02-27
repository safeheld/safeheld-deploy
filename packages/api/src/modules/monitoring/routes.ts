import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { redis } from '../../utils/redis';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { AlertType, AlertChannel, HealthCheckType, HealthCheckStatus } from '@prisma/client';
import { logger } from '../../utils/logger';

const router = Router();

// GET /api/v1/health — Public health check
router.get('/health/detailed', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = { status: 'fail', error: (err as Error).message };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch (err) {
      checks.redis = { status: 'fail', error: (err as Error).message };
    }

    const allOk = Object.values(checks).every(c => c.status === 'ok');

    // Log to system health checks
    await prisma.systemHealthCheck.create({
      data: {
        checkType: 'INFRASTRUCTURE',
        status: allOk ? 'PASS' : 'FAIL',
        details: checks,
      },
    }).catch(() => {});

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/firms/:firmId/health-checks — Firm health check history
router.get('/firms/:firmId/health-checks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const [checks, total] = await Promise.all([
      prisma.systemHealthCheck.findMany({
        where: { firmId: req.params.firmId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.systemHealthCheck.count({ where: { firmId: req.params.firmId } }),
    ]);
    paginatedResponse(res, checks, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/firms/:firmId/alert-settings
router.get('/firms/:firmId/alert-settings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await prisma.alertSetting.findMany({
      where: { userId: req.user!.userId, firmId: req.params.firmId },
      include: { user: { select: { name: true, email: true } } },
    });
    successResponse(res, settings);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/firms/:firmId/alert-settings
router.post('/firms/:firmId/alert-settings', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = req.params;
    const schema = z.object({
      alertType: z.nativeEnum(AlertType),
      channel: z.nativeEnum(AlertChannel),
      enabled: z.boolean().default(true),
      webhookUrl: z.string().url().optional(),
    });
    const body = schema.parse(req.body);

    const setting = await prisma.alertSetting.create({
      data: {
        userId: req.user!.userId,
        firmId,
        alertType: body.alertType,
        channel: body.channel,
        enabled: body.enabled,
        webhookUrl: body.webhookUrl,
      },
    });

    successResponse(res, setting, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/firms/:firmId/alert-settings/:settingId
router.put('/firms/:firmId/alert-settings/:settingId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      enabled: z.boolean().optional(),
      webhookUrl: z.string().url().optional().nullable(),
    });
    const body = schema.parse(req.body);
    const setting = await prisma.alertSetting.update({
      where: { id: req.params.settingId },
      data: body,
    });
    successResponse(res, setting);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/firms/:firmId/email-logs
router.get('/firms/:firmId/email-logs', authenticate, requireRole('ADMIN', 'COMPLIANCE_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        where: { firmId: req.params.firmId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.emailLog.count({ where: { firmId: req.params.firmId } }),
    ]);
    paginatedResponse(res, logs, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

export { router as monitoringRouter };
