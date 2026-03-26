import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireFirmAccess, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  recordFundsReceived,
  recordFundsExited,
  getActiveObligations,
  tagFxTransaction,
  getUnclaimedFunds,
  markAsUnclaimed,
  getTimingDashboard,
} from './service';

const router = Router();

// POST /:firmId/safeguarding-timing/received — record funds received
const fundsReceivedSchema = z.object({
  clientAccountId: z.string().uuid().optional(),
  transactionRef: z.string().max(255).optional(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  fundsReceivedAt: z.string().datetime(),
  fxType: z.enum(['FX_ONLY', 'PAYMENT_LINKED']).optional(),
});

router.post(
  '/:firmId/safeguarding-timing/received',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const body = fundsReceivedSchema.parse(req.body);

      const obligation = await recordFundsReceived(firmId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FUNDS_RECEIVED_RECORDED',
        entityType: 'safeguarding_obligations',
        entityId: obligation.id,
        details: { amount: body.amount, currency: body.currency, fxType: body.fxType ?? 'UNKNOWN' },
        ipAddress: req.ip,
      });

      successResponse(res, obligation, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/safeguarding-timing/:obligationId/exited — record exit
const fundsExitedSchema = z.object({
  safeguardingEndedAt: z.string().datetime(),
  endReason: z.enum(['PAYMENT_EXECUTED', 'E_MONEY_REDEEMED', 'FX_SETTLEMENT', 'OTHER']),
});

router.post(
  '/:firmId/safeguarding-timing/:obligationId/exited',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, obligationId } = req.params;
      const body = fundsExitedSchema.parse(req.body);

      const obligation = await recordFundsExited(firmId, obligationId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FUNDS_EXIT_RECORDED',
        entityType: 'safeguarding_obligations',
        entityId: obligationId,
        details: { endReason: body.endReason },
        ipAddress: req.ip,
      });

      successResponse(res, obligation);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/safeguarding-timing/active — list active obligations
router.get(
  '/:firmId/safeguarding-timing/active',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await getActiveObligations(firmId, {
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 50,
        currency: req.query.currency as string | undefined,
        isUnclaimed: req.query.isUnclaimed === 'true' ? true : req.query.isUnclaimed === 'false' ? false : undefined,
      });

      paginatedResponse(res, result.obligations, result.pagination);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/safeguarding-timing/:obligationId/fx-tag — tag FX
const fxTagSchema = z.object({
  fxType: z.enum(['FX_ONLY', 'PAYMENT_LINKED']),
});

router.post(
  '/:firmId/safeguarding-timing/:obligationId/fx-tag',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, obligationId } = req.params;
      const body = fxTagSchema.parse(req.body);

      const obligation = await tagFxTransaction(firmId, obligationId, body.fxType);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FX_TRANSACTION_TAGGED',
        entityType: 'safeguarding_obligations',
        entityId: obligationId,
        details: { fxType: body.fxType },
        ipAddress: req.ip,
      });

      successResponse(res, obligation);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/safeguarding-timing/unclaimed — unclaimed funds
router.get(
  '/:firmId/safeguarding-timing/unclaimed',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await getUnclaimedFunds(firmId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/safeguarding-timing/:obligationId/mark-unclaimed — mark unclaimed
router.post(
  '/:firmId/safeguarding-timing/:obligationId/mark-unclaimed',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, obligationId } = req.params;

      const obligation = await markAsUnclaimed(firmId, obligationId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'OBLIGATION_MARKED_UNCLAIMED',
        entityType: 'safeguarding_obligations',
        entityId: obligationId,
        details: {},
        ipAddress: req.ip,
      });

      successResponse(res, obligation);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/safeguarding-timing/dashboard — timing dashboard
router.get(
  '/:firmId/safeguarding-timing/dashboard',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const dashboard = await getTimingDashboard(firmId);
      successResponse(res, dashboard);
    } catch (err) {
      next(err);
    }
  },
);

export { router as safeguardingTimingRouter };
