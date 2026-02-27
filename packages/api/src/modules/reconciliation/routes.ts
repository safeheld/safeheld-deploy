import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  runReconciliation,
  getReconciliationHistory,
  getReconciliationBreaks,
  resolveBreak,
  getDashboardSummary,
} from './service';
import { BreakClassification } from '@prisma/client';

const router = Router();

// POST /api/v1/firms/:firmId/reconciliation/run
router.post('/:firmId/reconciliation/run',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reconciliation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
      });
      const body = schema.parse(req.body);
      const reconciliationDate = new Date(body.reconciliation_date);

      const runIds = await runReconciliation({
        firmId,
        reconciliationDate,
        trigger: 'MANUAL',
        triggeredByUserId: req.user!.userId,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'RECONCILIATION_RUN',
        entityType: 'reconciliation_runs',
        entityId: runIds[0] || firmId,
        details: { reconciliationDate: body.reconciliation_date, runIds, trigger: 'MANUAL' },
        ipAddress: req.ip,
      });

      successResponse(res, { runIds, reconciliationDate: body.reconciliation_date });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/history
router.get('/:firmId/reconciliation/history',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { reconciliation_type, currency, from, to } = req.query as Record<string, string>;

      const result = await getReconciliationHistory(firmId, {
        reconciliationType: reconciliation_type as 'INTERNAL' | 'EXTERNAL' | undefined,
        currency,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        page,
        pageSize,
      });

      paginatedResponse(res, result.runs, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/breaks
router.get('/:firmId/reconciliation/breaks',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { resolved } = req.query as Record<string, string>;

      const result = await getReconciliationBreaks(firmId, {
        resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
        page,
        pageSize,
      });

      paginatedResponse(res, result.breaks, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/v1/firms/:firmId/reconciliation/breaks/:breakId/resolve
router.put('/:firmId/reconciliation/breaks/:breakId/resolve',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breakId } = req.params;
      const schema = z.object({
        classification: z.nativeEnum(BreakClassification),
        explanation: z.string().min(1).max(2000),
      });
      const body = schema.parse(req.body);

      const brk = await resolveBreak(breakId, firmId, req.user!.userId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BREAK_RESOLVED',
        entityType: 'reconciliation_breaks',
        entityId: breakId,
        details: { classification: body.classification, explanation: body.explanation },
        ipAddress: req.ip,
      });

      successResponse(res, brk);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/dashboard
router.get('/:firmId/reconciliation/dashboard',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await getDashboardSummary(req.params.firmId);
      successResponse(res, summary);
    } catch (err) {
      next(err);
    }
  }
);

export { router as reconciliationRouter };
