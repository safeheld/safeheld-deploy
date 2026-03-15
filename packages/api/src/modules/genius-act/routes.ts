import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { runGeniusActComplianceCheck, checkReserveComposition, getGeniusActDashboard } from './service';

const router = Router();

// ─── GENIUS Act Dashboard ───────────────────────────────────────────────────

router.get('/:firmId/genius-act/dashboard',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getGeniusActDashboard(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── GENIUS Act Compliance Check ────────────────────────────────────────────

router.post('/:firmId/genius-act/compliance-check',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await runGeniusActComplianceCheck(firmId);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'GENIUS_ACT_COMPLIANCE_CHECK',
        entityType: 'genius_act_compliance', entityId: firmId,
        details: { overallStatus: result.overallStatus, checksCount: result.checks.length },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) { next(err); }
  }
);

// ─── GENIUS Act Reserve Composition ─────────────────────────────────────────

router.get('/:firmId/genius-act/reserve-composition',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await checkReserveComposition(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

export { router as geniusActRouter };
