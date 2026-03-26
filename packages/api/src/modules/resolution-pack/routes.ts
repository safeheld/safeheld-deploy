import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  generateResolutionPack,
  getResolutionPackHistory,
  downloadResolutionPackPdf,
  checkComponentStaleness,
} from './service';

const router = Router();

// GET /api/v1/firms/:firmId/resolution-pack — generate & return latest pack data
router.get('/:firmId/resolution-pack',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const data = await generateResolutionPack(firmId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'RESOLUTION_PACK_GENERATED',
        entityType: 'resolution_packs',
        entityId: firmId,
        details: { version: data.version, completeness: data.completenessPercent },
        ipAddress: req.ip,
      });

      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/resolution-pack/history — version history
router.get('/:firmId/resolution-pack/history',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const data = await getResolutionPackHistory(firmId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/resolution-pack/download — download PDF
router.get('/:firmId/resolution-pack/download',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { packId } = req.query as Record<string, string>;

      const pdf = await downloadResolutionPackPdf(firmId, packId || undefined);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'RESOLUTION_PACK_DOWNLOADED',
        entityType: 'resolution_packs',
        entityId: packId || firmId,
        details: {},
        ipAddress: req.ip,
      });

      const filename = `resolution-pack-${new Date().toISOString().split('T')[0]}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
      });
      res.end(pdf);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/resolution-pack/staleness — stale component alerts
router.get('/:firmId/resolution-pack/staleness',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const data = await checkComponentStaleness(firmId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

export { router as resolutionPackRouter };
