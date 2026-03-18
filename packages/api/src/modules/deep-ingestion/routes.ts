import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  runFullIngestion,
  runFrameworkIngestion,
  getIngestionStatus,
  getValidationResults,
  confirmValidationResult,
  rejectValidationResult,
} from '../../services/deep-ingestion';

const router = Router();

// POST /api/v1/admin/deep-ingestion/run
router.post(
  '/run',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await logAudit({
        userId: req.user!.userId,
        action: 'DEEP_INGESTION_TRIGGERED',
        entityType: 'ingestion_documents',
        entityId: '00000000-0000-0000-0000-000000000000',
        details: { trigger: 'MANUAL', scope: 'ALL' },
        ipAddress: req.ip,
      });

      // Run async — return immediately with status
      const resultPromise = runFullIngestion();

      // If request wants to wait (up to 5 min timeout), let it
      if (req.query.wait === 'true') {
        const result = await resultPromise;
        successResponse(res, result);
      } else {
        // Fire and forget
        resultPromise.catch(() => {});
        successResponse(res, { message: 'Deep ingestion started — check status endpoint for progress', startedAt: new Date().toISOString() }, 202);
      }
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/admin/deep-ingestion/run/:framework
router.post(
  '/run/:framework',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const framework = req.params.framework.toUpperCase();

      await logAudit({
        userId: req.user!.userId,
        action: 'DEEP_INGESTION_TRIGGERED',
        entityType: 'ingestion_documents',
        entityId: '00000000-0000-0000-0000-000000000000',
        details: { trigger: 'MANUAL', scope: framework },
        ipAddress: req.ip,
      });

      if (req.query.wait === 'true') {
        const results = await runFrameworkIngestion(framework);
        successResponse(res, results);
      } else {
        runFrameworkIngestion(framework).catch(() => {});
        successResponse(res, { message: `Ingestion started for ${framework}`, startedAt: new Date().toISOString() }, 202);
      }
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/deep-ingestion/status
router.get(
  '/status',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await getIngestionStatus();
      successResponse(res, status);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/deep-ingestion/results
router.get(
  '/results',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { framework, validation_status } = req.query as Record<string, string>;
      const result = await getValidationResults({
        framework,
        validationStatus: validation_status,
        page,
        pageSize,
      });
      paginatedResponse(res, result.results, {
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

// PATCH /api/v1/admin/deep-ingestion/results/:id/confirm
router.patch(
  '/results/:id/confirm',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await confirmValidationResult(req.params.id, req.user!.userId);
      successResponse(res, { message: 'Result confirmed' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/admin/deep-ingestion/results/:id/reject
router.patch(
  '/results/:id/reject',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rejectValidationResult(req.params.id, req.user!.userId);
      successResponse(res, { message: 'Result rejected' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/deep-ingestion/report — PDF export handled client-side

export { router as deepIngestionRouter };
