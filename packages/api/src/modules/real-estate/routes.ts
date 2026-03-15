import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  runDepositReconciliation,
  checkDepositSchemeCompliance,
  getDepositSummary,
} from './service';

const router = Router();

// ─── Deposit Reconciliation ─────────────────────────────────────────────────

router.post('/:firmId/real-estate/reconciliation',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reconciliationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const result = await runDepositReconciliation(
        firmId,
        new Date(body.reconciliationDate),
        req.user!.userId,
      );

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'REAL_ESTATE_RECONCILIATION_TRIGGERED',
        entityType: 'reconciliation_runs',
        entityId: result.runIds[0] || firmId,
        details: {
          reconciliationDate: body.reconciliationDate,
          coreRunCount: result.runIds.length,
          schemeCompliant: result.schemeComplianceCheck.compliant,
          capCompliant: result.depositCapCheck.compliant,
        },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) { next(err); }
  }
);

// ─── Compliance Status ──────────────────────────────────────────────────────

router.get('/:firmId/real-estate/compliance-status',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await checkDepositSchemeCompliance(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── Deposit Summary ────────────────────────────────────────────────────────

router.get('/:firmId/real-estate/deposit-summary',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getDepositSummary(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

export { router as realEstateRouter };
