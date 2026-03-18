import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse } from '../../utils/response';
import {
  streamChat,
  checkRateLimit,
  getProactiveAlert,
  getConversationHistory,
  clearHistory,
  getAdminUsageStats,
  getAdminConversations,
} from '../../services/ai-assistant';

// ─── Firm-facing routes ──────────────────────────────────────────────────────

const router = Router();

// POST /firms/:firmId/ai-assistant/chat — SSE streaming
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(5000),
  })).min(1).max(50),
  context_type: z.enum(['compliance', 'reconciliation', 'breach', 'remediation', 'general']).default('general'),
  session_id: z.string().min(1).max(100),
});

router.post(
  '/:firmId/ai-assistant/chat',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const body = chatSchema.parse(req.body);
      const firmId = req.params.firmId;
      const userId = req.user!.userId;

      // Rate limit check
      const limit = await checkRateLimit(firmId, userId);
      if (!limit.allowed) {
        res.status(429).json({ status: 'error', error: { code: 'RATE_LIMITED', message: limit.message } });
        return;
      }

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // nginx
      res.flushHeaders();

      await streamChat(
        firmId,
        userId,
        body.session_id,
        body.messages,
        body.context_type,
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
  }
);

// GET /firms/:firmId/ai-assistant/proactive — get proactive alert
router.get(
  '/:firmId/ai-assistant/proactive',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await getProactiveAlert(req.params.firmId);
      successResponse(res, { alert });
    } catch (err) {
      next(err);
    }
  }
);

// GET /firms/:firmId/ai-assistant/history
router.get(
  '/:firmId/ai-assistant/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const result = await getConversationHistory(req.params.firmId, page);
      paginatedResponse(res, result.messages, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /firms/:firmId/ai-assistant/history
router.delete(
  '/:firmId/ai-assistant/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await clearHistory(req.params.firmId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

export { router as aiAssistantRouter };

// ─── Admin routes ────────────────────────────────────────────────────────────

const adminRouter = Router();

// GET /admin/ai-assistant/usage
adminRouter.get(
  '/usage',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getAdminUsageStats();
      successResponse(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/ai-assistant/conversations
adminRouter.get(
  '/conversations',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getAdminConversations({
        firmId: req.query.firmId as string,
        page: parseInt(req.query.page as string) || 1,
      });
      paginatedResponse(res, result.conversations, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
    } catch (err) {
      next(err);
    }
  }
);

export { adminRouter as aiAssistantAdminRouter };
