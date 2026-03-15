import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  runInsuranceReconciliation,
  checkPremiumSegregation,
  getRemittanceStatus,
} from './service';

const router = Router();

// POST /api/v1/firms/:firmId/insurance/reconciliation
router.post('/:firmId/insurance/reconciliation',
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

      const result = await runInsuranceReconciliation(firmId, reconciliationDate, req.user!.userId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'INSURANCE_RECONCILIATION_RUN',
        entityType: 'reconciliation_runs',
        entityId: result.runIds[0] || firmId,
        details: { reconciliationDate: body.reconciliation_date, runIds: result.runIds, trigger: 'MANUAL' },
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/insurance/compliance-status
router.get('/:firmId/insurance/compliance-status',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const segregation = await checkPremiumSegregation(req.params.firmId);
      const remittance = await getRemittanceStatus(req.params.firmId);

      successResponse(res, {
        regime: 'FCA_INSURANCE',
        premiumSegregation: segregation,
        remittanceStatus: remittance,
        asOf: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/insurance/remittance-status
router.get('/:firmId/insurance/remittance-status',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getRemittanceStatus(req.params.firmId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

export { router as insuranceRouter };
