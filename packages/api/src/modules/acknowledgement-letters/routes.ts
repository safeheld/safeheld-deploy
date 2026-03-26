import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { ValidationError } from '../../utils/errors';
import {
  generateLetterTemplate,
  getLetterTracking,
  uploadSignedLetter,
  checkLetterAlerts,
} from './service';

const router = Router();

const letterUpload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  storage: multer.memoryStorage(),
});

// POST /:firmId/acknowledgement-letters/template — generate CASS 15 Annex 1 template PDF
router.post(
  '/:firmId/acknowledgement-letters/template',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        safeguardingAccountId: z.string().uuid(),
      });
      const { safeguardingAccountId } = schema.parse(req.body);

      const pdfBuffer = await generateLetterTemplate(firmId, safeguardingAccountId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'LETTER_TEMPLATE_GENERATED',
        entityType: 'acknowledgement_letters',
        entityId: safeguardingAccountId,
        details: { safeguardingAccountId },
        ipAddress: req.ip,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="acknowledgement-letter-template-${safeguardingAccountId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/acknowledgement-letters/tracking — tracking dashboard
router.get(
  '/:firmId/acknowledgement-letters/tracking',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const tracking = await getLetterTracking(firmId);
      successResponse(res, tracking);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/acknowledgement-letters/upload — upload signed letter (multipart)
router.post(
  '/:firmId/acknowledgement-letters/upload',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  letterUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      if (!req.file) throw new ValidationError('No file uploaded');

      const schema = z.object({
        safeguardingAccountId: z.string().uuid(),
        effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const body = schema.parse(req.body);

      const letter = await uploadSignedLetter({
        firmId,
        accountId: body.safeguardingAccountId,
        fileBuffer: req.file.buffer,
        fileMimetype: req.file.mimetype,
        effectiveDate: body.effectiveDate,
        expiryDate: body.expiryDate,
        uploadedBy: req.user!.userId,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'SIGNED_LETTER_UPLOADED',
        entityType: 'acknowledgement_letters',
        entityId: letter.id,
        details: {
          accountId: body.safeguardingAccountId,
          version: letter.version,
          effectiveDate: body.effectiveDate,
        },
        ipAddress: req.ip,
      });

      successResponse(res, letter, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/acknowledgement-letters/alerts — alerts
router.get(
  '/:firmId/acknowledgement-letters/alerts',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const alerts = await checkLetterAlerts(firmId);
      successResponse(res, alerts);
    } catch (err) {
      next(err);
    }
  },
);

export { router as acknowledgementLettersRouter };
