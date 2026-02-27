import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { prisma } from '../../utils/prisma';
import {
  generateAssuranceReport,
  generateBoardReport,
  finaliseReport,
  shareReport,
  getReportDownloadUrl,
  generateSafeguardingReturn,
} from './service';
import { ReportType } from '@prisma/client';

const router = Router();

// POST /api/v1/firms/:firmId/reports/safeguarding-return
router.post('/:firmId/reports/safeguarding-return',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);

      const data = await generateSafeguardingReturn(
        firmId,
        new Date(body.period_start),
        new Date(body.period_end),
        req.user!.userId
      );

      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reports/assurance
router.post('/:firmId/reports/assurance',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        report_type: z.nativeEnum(ReportType),
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);

      const result = await generateAssuranceReport(
        firmId,
        body.report_type,
        new Date(body.period_start),
        new Date(body.period_end),
        req.user!.userId
      );

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'REPORT_GENERATED',
        entityType: 'assurance_reports',
        entityId: result.reportId,
        details: { reportType: body.report_type, periodStart: body.period_start, periodEnd: body.period_end },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reports/board-pack
router.post('/:firmId/reports/board-pack',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        report_month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
      });
      const body = schema.parse(req.body);
      const [year, month] = body.report_month.split('-').map(Number);

      const result = await generateBoardReport(firmId, new Date(year, month - 1, 1), req.user!.userId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BOARD_REPORT_GENERATED',
        entityType: 'board_reports',
        entityId: result.reportId,
        details: { reportMonth: body.report_month },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reports
router.get('/:firmId/reports',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const { report_type, status } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { firmId };
      if (report_type) where.reportType = report_type;
      if (status) where.status = status;

      const [reports, total] = await Promise.all([
        prisma.assuranceReport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: { generator: { select: { name: true } } },
        }),
        prisma.assuranceReport.count({ where }),
      ]);

      paginatedResponse(res, reports, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reports/:reportId
router.get('/:firmId/reports/:reportId',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await prisma.assuranceReport.findFirst({
        where: { id: req.params.reportId, firmId: req.params.firmId },
        include: { generator: { select: { name: true, email: true } } },
      });
      if (!report) throw new NotFoundError('Report');
      successResponse(res, report);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reports/:reportId/finalise
router.post('/:firmId/reports/:reportId/finalise',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, reportId } = req.params;
      const report = await finaliseReport(reportId, firmId, req.user!.userId);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'REPORT_FINALISED',
        entityType: 'assurance_reports',
        entityId: reportId,
        details: {},
        ipAddress: req.ip,
      });

      successResponse(res, report);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reports/:reportId/share
router.post('/:firmId/reports/:reportId/share',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, reportId } = req.params;
      const schema = z.object({ expires_in_hours: z.number().min(1).max(168).default(72) });
      const body = schema.parse(req.body);

      const result = await shareReport(reportId, firmId, body.expires_in_hours);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'REPORT_SHARED',
        entityType: 'assurance_reports',
        entityId: reportId,
        details: { expiresInHours: body.expires_in_hours },
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reports/:reportId/download
router.get('/:firmId/reports/:reportId/download',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = await getReportDownloadUrl(req.params.reportId, req.params.firmId);
      res.redirect(url);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/board-reports
router.get('/:firmId/board-reports',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const [reports, total] = await Promise.all([
        prisma.boardReport.findMany({
          where: { firmId: req.params.firmId },
          orderBy: { reportMonth: 'desc' },
          skip,
          take: pageSize,
          include: { generator: { select: { name: true } } },
        }),
        prisma.boardReport.count({ where: { firmId: req.params.firmId } }),
      ]);
      paginatedResponse(res, reports, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) {
      next(err);
    }
  }
);

export { router as reportingRouter };
