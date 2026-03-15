import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { runMicaComplianceCheck, checkReserveRequirements, getMicaDashboard } from './service';

const router = Router();

// ─── MiCA Dashboard ─────────────────────────────────────────────────────────

router.get('/:firmId/mica/dashboard',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getMicaDashboard(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── MiCA Compliance Check ──────────────────────────────────────────────────

router.post('/:firmId/mica/compliance-check',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await runMicaComplianceCheck(firmId);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'MICA_COMPLIANCE_CHECK',
        entityType: 'mica_compliance', entityId: firmId,
        details: { overallStatus: result.overallStatus, checksCount: result.checks.length },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) { next(err); }
  }
);

// ─── MiCA Reserve Status ────────────────────────────────────────────────────

router.get('/:firmId/mica/reserve-status',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await checkReserveRequirements(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

export { router as micaRouter };
