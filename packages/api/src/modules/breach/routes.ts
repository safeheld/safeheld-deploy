import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { prisma } from '../../utils/prisma';
import {
  getBreaches,
  acknowledgeBreachService,
  updateBreachStatusService,
  createFcaNotification,
  submitFcaNotification,
} from './service';
import { BreachStatus, BreachType, BreachSeverity, FcaNotificationType } from '@prisma/client';

const router = Router();

// GET /api/v1/firms/:firmId/breaches
router.get('/:firmId/breaches',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status, breach_type, severity, is_notifiable } = req.query as Record<string, string>;

      const result = await getBreaches(firmId, {
        status: status as BreachStatus | undefined,
        breachType: breach_type as BreachType | undefined,
        severity: severity as BreachSeverity | undefined,
        isNotifiable: is_notifiable === 'true' ? true : is_notifiable === 'false' ? false : undefined,
        page,
        pageSize,
      });

      paginatedResponse(res, result.breaches, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/breaches/:breachId
router.get('/:firmId/breaches/:breachId',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const breach = await prisma.breach.findFirst({
        where: { id: req.params.breachId, firmId: req.params.firmId },
        include: {
          fcaNotifications: {
            include: { submitter: { select: { name: true, email: true } } },
          },
          acknowledger: { select: { name: true, email: true } },
          closer: { select: { name: true, email: true } },
          reconciliationRun: { select: { reconciliationDate: true, reconciliationType: true, currency: true } },
        },
      });
      if (!breach) throw new NotFoundError('Breach');
      successResponse(res, breach);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/breaches/:breachId/acknowledge
router.post('/:firmId/breaches/:breachId/acknowledge',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breachId } = req.params;
      const schema = z.object({
        remediation_action: z.string().min(1).max(2000),
      });
      const body = schema.parse(req.body);

      const breach = await acknowledgeBreachService(breachId, firmId, req.user!.userId, body.remediation_action);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BREACH_ACKNOWLEDGED',
        entityType: 'breaches',
        entityId: breachId,
        details: { remediationAction: body.remediation_action },
        ipAddress: req.ip,
      });

      successResponse(res, breach);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/breaches/:breachId/status
router.post('/:firmId/breaches/:breachId/status',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breachId } = req.params;
      const schema = z.object({
        status: z.enum(['REMEDIATING', 'RESOLVED', 'CLOSED']),
        evidence: z.string().max(2000).optional(),
      });
      const body = schema.parse(req.body);

      const breach = await updateBreachStatusService(
        breachId,
        firmId,
        req.user!.userId,
        body.status,
        body.evidence
      );

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: `BREACH_STATUS_CHANGED_TO_${body.status}`,
        entityType: 'breaches',
        entityId: breachId,
        details: { newStatus: body.status, evidence: body.evidence },
        ipAddress: req.ip,
      });

      successResponse(res, breach);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/breaches/:breachId/fca-notifications
router.post('/:firmId/breaches/:breachId/fca-notifications',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breachId } = req.params;
      const schema = z.object({
        notification_type: z.nativeEnum(FcaNotificationType),
        description: z.string().min(1).max(5000),
      });
      const body = schema.parse(req.body);

      const notification = await createFcaNotification(breachId, firmId, req.user!.userId, {
        notificationType: body.notification_type,
        description: body.description,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_NOTIFICATION_CREATED',
        entityType: 'fca_notifications',
        entityId: notification.id,
        details: { breachId, notificationType: body.notification_type },
        ipAddress: req.ip,
      });

      successResponse(res, notification, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/fca-notifications/:notificationId/submit
router.post('/:firmId/fca-notifications/:notificationId/submit',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, notificationId } = req.params;
      const schema = z.object({ fca_reference: z.string().max(100).optional() });
      const body = schema.parse(req.body);

      const notification = await submitFcaNotification(notificationId, firmId, req.user!.userId, body.fca_reference);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_NOTIFICATION_SUBMITTED',
        entityType: 'fca_notifications',
        entityId: notificationId,
        details: { fcaReference: body.fca_reference },
        ipAddress: req.ip,
      });

      successResponse(res, notification);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/fca-notifications
router.get('/:firmId/fca-notifications',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);

      const [notifications, total] = await Promise.all([
        prisma.fcaNotification.findMany({
          where: { firmId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            breach: { select: { breachType: true, severity: true, status: true } },
            submitter: { select: { name: true } },
          },
        }),
        prisma.fcaNotification.count({ where: { firmId } }),
      ]);

      paginatedResponse(res, notifications, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) {
      next(err);
    }
  }
);

export { router as breachRouter };
