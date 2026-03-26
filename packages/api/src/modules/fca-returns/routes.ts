import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  generateMonthlyReturn,
  getMonthlyReturns,
  finaliseReturn,
  validateReturn,
  exportReturnPdf,
  exportReturnData,
} from './service';

const router = Router();

// POST /api/v1/firms/:firmId/fca-returns/monthly — generate return
router.post('/:firmId/fca-returns/monthly',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reporting_month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
      });
      const body = schema.parse(req.body);

      const data = await generateMonthlyReturn(firmId, body.reporting_month);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_MONTHLY_RETURN_GENERATED',
        entityType: 'fca_monthly_returns',
        entityId: data.id,
        details: { reportingMonth: body.reporting_month },
        ipAddress: req.ip,
      });

      successResponse(res, data, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-returns/monthly — list returns
router.get('/:firmId/fca-returns/monthly',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const data = await getMonthlyReturns(firmId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-returns/monthly/:returnId — get single return
router.get('/:firmId/fca-returns/monthly/:returnId',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, returnId } = req.params;
      const data = await exportReturnData(firmId, returnId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/fca-returns/monthly/:returnId/finalise — finalise
router.post('/:firmId/fca-returns/monthly/:returnId/finalise',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, returnId } = req.params;
      const data = await finaliseReturn(firmId, returnId, req.user!.userId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_MONTHLY_RETURN_FINALISED',
        entityType: 'fca_monthly_returns',
        entityId: returnId,
        details: { finalisedAt: data.finalisedAt },
        ipAddress: req.ip,
      });

      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-returns/monthly/:returnId/validate — validate
router.get('/:firmId/fca-returns/monthly/:returnId/validate',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, returnId } = req.params;
      const data = await validateReturn(firmId, returnId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-returns/monthly/:returnId/export-pdf — PDF export
router.get('/:firmId/fca-returns/monthly/:returnId/export-pdf',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, returnId } = req.params;
      const pdf = await exportReturnPdf(firmId, returnId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_RETURN_PDF_EXPORTED',
        entityType: 'fca_monthly_returns',
        entityId: returnId,
        details: {},
        ipAddress: req.ip,
      });

      const filename = `fca-monthly-return-${returnId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`;
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

// GET /api/v1/firms/:firmId/fca-returns/monthly/:returnId/export-data — JSON export
router.get('/:firmId/fca-returns/monthly/:returnId/export-data',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, returnId } = req.params;
      const data = await exportReturnData(firmId, returnId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_RETURN_DATA_EXPORTED',
        entityType: 'fca_monthly_returns',
        entityId: returnId,
        details: {},
        ipAddress: req.ip,
      });

      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

export { router as fcaReturnsRouter };
