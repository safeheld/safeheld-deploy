import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
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
  createManualBreach,
  uploadBreachSupportingDoc,
  getBreachRegister,
  generateFcaNotificationTemplate,
} from './service';
import { BreachStatus, BreachType, BreachSeverity, BreachCategory, FcaNotificationType } from '@prisma/client';

const router = Router();

const docUpload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  storage: multer.memoryStorage(),
});

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

// GET /api/v1/firms/:firmId/breaches/register - Full breach register view
router.get('/:firmId/breaches/register',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const {
        breach_category, is_material, date_from, date_to, status, severity,
      } = req.query as Record<string, string>;

      const result = await getBreachRegister(firmId, {
        breachCategory: breach_category as BreachCategory | undefined,
        isMaterial: is_material === 'true' ? true : is_material === 'false' ? false : undefined,
        dateFrom: date_from,
        dateTo: date_to,
        status: status as BreachStatus | undefined,
        severity: severity as BreachSeverity | undefined,
        page,
        pageSize,
      });

      res.json({
        status: 'success',
        data: result.breaches,
        summary: result.summary,
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
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

// POST /api/v1/firms/:firmId/breaches/manual - Create manual breach
router.post('/:firmId/breaches/manual',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        description: z.string().min(1).max(5000),
        breachType: z.nativeEnum(BreachType),
        severity: z.nativeEnum(BreachSeverity),
        dateOccurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateIdentified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateReportedToSeniorMgmt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        breachCategory: z.nativeEnum(BreachCategory),
        rootCauseAnalysis: z.string().max(5000).optional(),
        personResponsible: z.string().max(255).optional(),
        isMaterial: z.boolean(),
        currency: z.string().length(3).optional(),
        shortfallAmount: z.number().min(0).optional(),
        remediationAction: z.string().max(2000).optional(),
      });
      const body = schema.parse(req.body);

      const breach = await createManualBreach(firmId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BREACH_MANUALLY_CREATED',
        entityType: 'breaches',
        entityId: breach.id,
        details: {
          breachType: body.breachType,
          breachCategory: body.breachCategory,
          severity: body.severity,
          isMaterial: body.isMaterial,
        },
        ipAddress: req.ip,
      });

      successResponse(res, breach, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/breaches/:breachId/documents - Upload supporting doc
router.post('/:firmId/breaches/:breachId/documents',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN', 'FINANCE_OPS'),
  docUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breachId } = req.params;
      if (!req.file) throw new ValidationError('File is required');

      const result = await uploadBreachSupportingDoc(firmId, breachId, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BREACH_DOCUMENT_UPLOADED',
        entityType: 'breaches',
        entityId: breachId,
        details: { fileName: req.file.originalname, storagePath: result.storagePath },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/breaches/:breachId/fca-notification-template - Generate FCA notification template
router.post('/:firmId/breaches/:breachId/fca-notification-template',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breachId } = req.params;
      const schema = z.object({
        scenario: z.enum(['records_invalid', 'unable_to_reconcile', 'unable_to_remedy', 'material_difference']),
      });
      const body = schema.parse(req.body);

      const template = await generateFcaNotificationTemplate(firmId, breachId, body.scenario);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'FCA_NOTIFICATION_TEMPLATE_GENERATED',
        entityType: 'breaches',
        entityId: breachId,
        details: { scenario: body.scenario },
        ipAddress: req.ip,
      });

      successResponse(res, template);
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
