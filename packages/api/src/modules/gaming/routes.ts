import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  runPlayerFundReconciliation,
  checkPlayerFundProtection,
  getPlayerFundSummary,
} from './service';

const router = Router();

// ─── Player Fund Reconciliation ─────────────────────────────────────────────

router.post('/:firmId/gaming/reconciliation',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const result = await runPlayerFundReconciliation(
        firmId,
        new Date(body.reconciliationDate),
        req.user!.userId,
      );

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'GAMING_RECONCILIATION_TRIGGERED',
        entityType: 'reconciliation_runs',
        entityId: result.runIds[0] || firmId,
        details: {
          reconciliationDate: body.reconciliationDate,
          coreRunCount: result.runIds.length,
          segregationCompliant: result.segregationCheck.compliant,
          reserveCompliant: result.reserveCheck.compliant,
        },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) { next(err); }
  }
);

// ─── Compliance Status ──────────────────────────────────────────────────────

router.get('/:firmId/gaming/compliance-status',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await checkPlayerFundProtection(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── Player Fund Summary ────────────────────────────────────────────────────

router.get('/:firmId/gaming/player-fund-summary',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getPlayerFundSummary(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

export { router as gamingRouter };
