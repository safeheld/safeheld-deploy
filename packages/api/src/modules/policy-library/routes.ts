import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, requireFirmAccess, requireRole } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { PolicyDocumentType, PolicyDocumentStatus } from '@prisma/client';
import {
  getPolicies,
  uploadPolicy,
  getPolicyVersionHistory,
  getRequiredDocumentsChecklist,
  getReviewAlerts,
  chatWithPolicies,
  getPolicyChatHistory,
} from './service';

const router = Router();

const policyUpload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  storage: multer.memoryStorage(),
});

// GET /:firmId/policy-library — list policies
router.get(
  '/:firmId/policy-library',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const filters: { type?: PolicyDocumentType; status?: PolicyDocumentStatus; overdue?: boolean } = {};

      if (req.query.type) {
        filters.type = req.query.type as PolicyDocumentType;
      }
      if (req.query.status) {
        filters.status = req.query.status as PolicyDocumentStatus;
      }
      if (req.query.overdue === 'true') {
        filters.overdue = true;
      }

      const policies = await getPolicies(firmId, filters);
      successResponse(res, policies);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/policy-library — upload policy (multipart)
const uploadSchema = z.object({
  documentType: z.nativeEnum(PolicyDocumentType),
  title: z.string().min(1).max(255),
  reviewFrequencyMonths: z.coerce.number().int().min(1).max(60).optional(),
  boardApproved: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  boardApprovalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  textContent: z.string().max(500000).optional(),
  status: z.nativeEnum(PolicyDocumentStatus).optional(),
});

router.post(
  '/:firmId/policy-library',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  policyUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const userId = req.user!.userId;
      const body = uploadSchema.parse(req.body);

      if (!req.file) {
        res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: 'File is required' } });
        return;
      }

      const policy = await uploadPolicy(firmId, userId, {
        documentType: body.documentType,
        title: body.title,
        reviewFrequencyMonths: body.reviewFrequencyMonths,
        boardApproved: body.boardApproved,
        boardApprovalDate: body.boardApprovalDate,
        textContent: body.textContent,
        status: body.status,
      }, req.file.buffer);

      await logAudit({
        firmId,
        userId,
        action: 'POLICY_UPLOADED',
        entityType: 'policy_documents',
        entityId: policy.id,
        details: { documentType: body.documentType, title: body.title, version: policy.version },
        ipAddress: req.ip,
      });

      successResponse(res, policy, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/policy-library/versions/:documentType — version history
router.get(
  '/:firmId/policy-library/versions/:documentType',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, documentType } = req.params;
      const validTypes = Object.values(PolicyDocumentType);
      if (!validTypes.includes(documentType as PolicyDocumentType)) {
        res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: `Invalid document type. Must be one of: ${validTypes.join(', ')}` } });
        return;
      }

      const versions = await getPolicyVersionHistory(firmId, documentType as PolicyDocumentType);
      successResponse(res, versions);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/policy-library/checklist — required docs checklist
router.get(
  '/:firmId/policy-library/checklist',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const checklist = await getRequiredDocumentsChecklist(firmId);
      successResponse(res, checklist);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/policy-library/review-alerts — review alerts
router.get(
  '/:firmId/policy-library/review-alerts',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const alerts = await getReviewAlerts(firmId);
      successResponse(res, alerts);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/policy-library/chat — chat with policies (streaming SSE)
const chatSchema = z.object({
  question: z.string().min(1).max(5000),
  session_id: z.string().min(1).max(100),
});

router.post(
  '/:firmId/policy-library/chat',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response) => {
    try {
      const body = chatSchema.parse(req.body);
      const firmId = req.params.firmId;
      const userId = req.user!.userId;

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      await chatWithPolicies(
        firmId,
        userId,
        body.session_id,
        body.question,
        // onChunk
        (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        },
        // onDone
        (fullResponse, tokensUsed) => {
          res.write(`data: ${JSON.stringify({ type: 'done', tokensUsed })}\n\n`);
          res.end();
        },
        // onError
        (err) => {
          res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
          res.end();
        },
      );
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(400).json({ status: 'error', error: { code: 'VALIDATION_ERROR', message: err.message } });
      }
    }
  },
);

// GET /:firmId/policy-library/chat/history — chat history
router.get(
  '/:firmId/policy-library/chat/history',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const userId = req.user!.userId;
      const history = await getPolicyChatHistory(firmId, userId);
      successResponse(res, history);
    } catch (err) {
      next(err);
    }
  },
);

export { router as policyLibraryRouter };
