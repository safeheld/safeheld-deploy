import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  getUnreadCount,
  getNotifications,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
} from './service';

const router = Router();

// GET /api/v1/notifications/unread-count
router.get('/notifications/unread-count', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getUnreadCount(req.user!.userId, req.user!.firmId);
    successResponse(res, { count });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notifications
router.get('/notifications', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
    const { notifications, total } = await getNotifications(req.user!.userId, req.user!.firmId, page, pageSize);

    paginatedResponse(res, notifications, {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/:id/read
router.post('/notifications/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError('Notification ID is required');

    await markRead(id, req.user!.userId);
    successResponse(res, { message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/read-all
router.post('/notifications/read-all', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await markAllRead(req.user!.userId);
    successResponse(res, { message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

const preferencesSchema = z.object({
  email: z.object({
    breachAlerts: z.boolean().optional(),
    reconSummary: z.union([z.boolean(), z.enum(['daily', 'weekly'])]).optional(),
    remediationReminders: z.boolean().optional(),
    certExpiry: z.boolean().optional(),
    fcaDeadlines: z.boolean().optional(),
    letterExpiry: z.boolean().optional(),
  }).optional(),
  inApp: z.object({
    breachAlerts: z.boolean().optional(),
    reconSummary: z.boolean().optional(),
    remediationReminders: z.boolean().optional(),
    certExpiry: z.boolean().optional(),
    fcaDeadlines: z.boolean().optional(),
    letterExpiry: z.boolean().optional(),
  }).optional(),
  frequency: z.enum(['realtime', 'daily', 'weekly']).optional(),
});

// GET /api/v1/users/me/notification-preferences
router.get('/users/me/notification-preferences', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prefs = await getPreferences(req.user!.userId);
    successResponse(res, prefs);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/users/me/notification-preferences
router.put('/users/me/notification-preferences', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = preferencesSchema.parse(req.body);
    if (!body.email && !body.inApp && !body.frequency) {
      throw new ValidationError('At least one preference field must be provided');
    }

    const updated = await updatePreferences(req.user!.userId, body as Partial<import('./service').NotificationPreferences>);
    logger.info({ userId: req.user!.userId }, 'Notification preferences updated via API');
    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
});

export { router as notificationsRouter };
