import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError } from '../../utils/errors';
import {
  generateAuditEvidencePack,
  listAuditEvidencePacks,
  getAuditEvidencePackDownload,
  getAuditPeriodInfo,
  checkAuditThreshold,
  signOffAuditExemption,
  getAuditorView,
} from './service';

const router = Router();

// POST /api/v1/firms/:firmId/audit-support/evidence-pack - Generate evidence pack
router.post('/:firmId/audit-support/evidence-pack',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);

      const pack = await generateAuditEvidencePack(firmId, body.periodStart, body.periodEnd, req.user!.userId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'AUDIT_EVIDENCE_PACK_GENERATED',
        entityType: 'audit_evidence_packs',
        entityId: pack.id,
        details: { periodStart: body.periodStart, periodEnd: body.periodEnd },
        ipAddress: req.ip,
      });

      successResponse(res, pack, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/audit-support/evidence-pack - List packs
router.get('/:firmId/audit-support/evidence-pack',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const packs = await listAuditEvidencePacks(firmId);
      successResponse(res, packs);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/audit-support/evidence-pack/:packId/download - Download PDF
router.get('/:firmId/audit-support/evidence-pack/:packId/download',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, packId } = req.params;
      const { buffer, pack } = await getAuditEvidencePackDownload(firmId, packId);

      const filename = `audit-evidence-pack_${pack.periodStart.toISOString().split('T')[0]}_${pack.periodEnd.toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/audit-support/period-info - Audit period info
router.get('/:firmId/audit-support/period-info',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const info = await getAuditPeriodInfo(firmId);
      successResponse(res, info);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/audit-support/threshold-check - Threshold check
router.get('/:firmId/audit-support/threshold-check',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await checkAuditThreshold(firmId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/audit-support/exemption-signoff - Sign off exemption
router.post('/:firmId/audit-support/exemption-signoff',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        signedOffBy: z.string().min(1).max(255),
      });
      const body = schema.parse(req.body);

      const result = await signOffAuditExemption(firmId, body.signedOffBy);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'AUDIT_EXEMPTION_SIGNED_OFF',
        entityType: 'firms',
        entityId: firmId,
        details: { signedOffBy: body.signedOffBy },
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/audit-support/auditor-view - Scoped auditor data
router.get('/:firmId/audit-support/auditor-view',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await getAuditorView(firmId, req.user!.userId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

export { router as auditSupportRouter };
