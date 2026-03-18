import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  getSources,
  getChangeEvents,
  getProposals,
  approveProposal,
  rejectProposal,
  checkSource,
  runFullMonitor,
  getFirmImpactForProposal,
} from '../../services/reg-monitor';

const router = Router();

// GET /api/v1/admin/reg-monitor/sources
router.get(
  '/sources',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sources = await getSources();
      successResponse(res, sources);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/reg-monitor/events
router.get(
  '/events',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status, source_id } = req.query as Record<string, string>;
      const result = await getChangeEvents({ status, sourceId: source_id, page, pageSize });
      paginatedResponse(res, result.events, {
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

// GET /api/v1/admin/reg-monitor/proposals
router.get(
  '/proposals',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status, framework } = req.query as Record<string, string>;
      const result = await getProposals({ status, framework, page, pageSize });
      paginatedResponse(res, result.proposals, {
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

// PATCH /api/v1/admin/reg-monitor/proposals/:id/approve
router.patch(
  '/proposals/:id/approve',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await approveProposal(req.params.id, req.user!.userId);
      successResponse(res, { message: 'Proposal approved and applied' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/admin/reg-monitor/proposals/:id/reject
router.patch(
  '/proposals/:id/reject',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ reason: z.string().min(1).max(2000) });
      const body = schema.parse(req.body);
      await rejectProposal(req.params.id, req.user!.userId, body.reason);
      successResponse(res, { message: 'Proposal rejected' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/admin/reg-monitor/sources/:id/check
router.post(
  '/sources/:id/check',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await checkSource(req.params.id);

      await logAudit({
        userId: req.user!.userId,
        action: 'REG_SOURCE_MANUAL_CHECK',
        entityType: 'regulatory_sources',
        entityId: req.params.id,
        details: result,
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/admin/reg-monitor/run
router.post(
  '/run',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runFullMonitor();

      await logAudit({
        userId: req.user!.userId,
        action: 'REG_MONITOR_MANUAL_RUN',
        entityType: 'regulatory_sources',
        entityId: '00000000-0000-0000-0000-000000000000',
        details: result,
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/admin/reg-monitor/firm-impact/:proposalId
router.get(
  '/firm-impact/:proposalId',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const impact = await getFirmImpactForProposal(req.params.proposalId);
      successResponse(res, impact);
    } catch (err) {
      next(err);
    }
  }
);

export { router as regMonitorRouter };
