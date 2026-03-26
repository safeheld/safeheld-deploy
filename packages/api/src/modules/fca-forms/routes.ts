import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  generateFSA056,
  generateFSA057,
  generateFIN060a,
  getForms,
  getForm,
  exportFormPdf,
  exportFormData,
} from './service';

const router = Router();

// POST /api/v1/firms/:firmId/fca-forms/:formType/generate - Generate form
router.post('/:firmId/fca-forms/:formType/generate',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, formType } = req.params;
      const schema = z.object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);

      let result;
      switch (formType.toUpperCase()) {
        case 'FSA056':
          result = await generateFSA056(firmId, body.periodStart, body.periodEnd);
          break;
        case 'FSA057':
          result = await generateFSA057(firmId, body.periodStart, body.periodEnd);
          break;
        case 'FIN060A':
          result = await generateFIN060a(firmId, body.periodStart, body.periodEnd);
          break;
        default:
          throw new ValidationError(`Unsupported form type: ${formType}. Supported: FSA056, FSA057, FIN060A`);
      }

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: `FCA_FORM_${formType.toUpperCase()}_GENERATED`,
        entityType: 'fca_form_submissions',
        entityId: result.submission.id,
        details: { formType: formType.toUpperCase(), periodStart: body.periodStart, periodEnd: body.periodEnd },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-forms - List all forms
router.get('/:firmId/fca-forms',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const forms = await getForms(firmId);
      successResponse(res, forms);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-forms/:formId - Get single form
router.get('/:firmId/fca-forms/:formId',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, formId } = req.params;
      const form = await getForm(firmId, formId);
      successResponse(res, form);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-forms/:formId/export-pdf - PDF export
router.get('/:firmId/fca-forms/:formId/export-pdf',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, formId } = req.params;
      const buffer = await exportFormPdf(firmId, formId);

      const form = await getForm(firmId, formId);
      const filename = `${form.formType}_${form.reportingPeriodStart.toISOString().split('T')[0]}_${form.reportingPeriodEnd.toISOString().split('T')[0]}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-forms/:formId/export-data - Structured JSON export
router.get('/:firmId/fca-forms/:formId/export-data',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, formId } = req.params;
      const data = await exportFormData(firmId, formId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

export { router as fcaFormsRouter };
