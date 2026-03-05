import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError } from '../../utils/errors';
import {
  getClientAssets, createClientAsset,
  getCmarSubmissions, createCmarSubmission, updateCmarSubmission,
  getRiskControls, createRiskControl, updateRiskControl,
  getRegulatoryUpdates, createRegulatoryUpdate, updateRegulatoryUpdate,
  getImpactAssessments, createImpactAssessment, updateImpactAssessment,
  getCassDashboard,
} from './service';

const router = Router();

// ─── CASS Dashboard ──────────────────────────────────────────────────────────

router.get('/:firmId/cass/dashboard',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getCassDashboard(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── Client Assets ───────────────────────────────────────────────────────────

router.get('/:firmId/cass/assets',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { asset_type, client_id, record_date } = req.query as Record<string, string>;
      const result = await getClientAssets(req.params.firmId, {
        page, pageSize, assetType: asset_type, clientId: client_id, recordDate: record_date,
      });
      paginatedResponse(res, result.assets, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/cass/assets',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        assetName: z.string().min(1).max(255),
        assetType: z.enum(['CASH', 'CUSTODY_ASSET', 'COLLATERAL', 'MANDATE']),
        isin: z.string().max(12).optional(),
        sedol: z.string().max(7).optional(),
        clientId: z.string().min(1).max(100),
        clientName: z.string().max(255).optional(),
        quantity: z.number(),
        marketValue: z.number().optional(),
        currency: z.string().length(3),
        custodian: z.string().max(255).optional(),
        subCustodian: z.string().max(255).optional(),
        accountReference: z.string().max(100).optional(),
        status: z.enum(['HELD', 'IN_TRANSIT', 'RETURNED', 'WRITTEN_OFF']).optional(),
        recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const asset = await createClientAsset(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'CLIENT_ASSET_CREATED',
        entityType: 'client_assets', entityId: asset.id,
        details: { assetName: body.assetName, clientId: body.clientId, assetType: body.assetType },
        ipAddress: req.ip,
      });

      successResponse(res, asset, 201);
    } catch (err) { next(err); }
  }
);

// ─── CMAR Submissions ────────────────────────────────────────────────────────

router.get('/:firmId/cass/cmar',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status } = req.query as Record<string, string>;
      const result = await getCmarSubmissions(req.params.firmId, { page, pageSize, status });
      paginatedResponse(res, result.submissions, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/cass/cmar',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reportingPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reportingPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        submissionDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        clientMoneyHeld: z.number().optional(),
        custodyAssetsHeld: z.number().optional(),
        numberOfClients: z.number().int().optional(),
        reconciliationBreaches: z.number().int().optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const submission = await createCmarSubmission(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'CMAR_CREATED',
        entityType: 'cmar_submissions', entityId: submission.id,
        details: { periodEnd: body.reportingPeriodEnd, deadline: body.submissionDeadline },
        ipAddress: req.ip,
      });

      successResponse(res, submission, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/cass/cmar/:cmarId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, cmarId } = req.params;
      const schema = z.object({
        status: z.enum(['DRAFT', 'IN_REVIEW', 'SUBMITTED', 'ACCEPTED', 'REJECTED']).optional(),
        clientMoneyHeld: z.number().optional(),
        custodyAssetsHeld: z.number().optional(),
        numberOfClients: z.number().int().optional(),
        reconciliationBreaches: z.number().int().optional(),
        notes: z.string().max(5000).optional(),
        fcaReference: z.string().max(100).optional(),
      });
      const body = schema.parse(req.body);
      const submission = await updateCmarSubmission(cmarId, firmId, {
        ...body, submittedBy: req.user!.userId,
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'CMAR_UPDATED',
        entityType: 'cmar_submissions', entityId: cmarId,
        details: body, ipAddress: req.ip,
      });

      successResponse(res, submission);
    } catch (err) { next(err); }
  }
);

// ─── Risk Controls ───────────────────────────────────────────────────────────

router.get('/:firmId/cass/risk-controls',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { category, status } = req.query as Record<string, string>;
      const result = await getRiskControls(req.params.firmId, { page, pageSize, category, status });
      paginatedResponse(res, result.controls, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/cass/risk-controls',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        category: z.enum(['CLIENT_MONEY', 'CUSTODY_ASSETS', 'RECONCILIATION', 'REPORTING', 'GOVERNANCE', 'OPERATIONAL']),
        title: z.string().min(1).max(255),
        description: z.string().min(1).max(5000),
        likelihood: z.enum(['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN']),
        impact: z.enum(['NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE']),
        controlDescription: z.string().min(1).max(5000),
        controlOwner: z.string().max(255).optional(),
        status: z.enum(['EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'NOT_TESTED']).optional(),
        nextReviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        mitigatingActions: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const control = await createRiskControl(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'RISK_CONTROL_CREATED',
        entityType: 'risk_controls', entityId: control.id,
        details: { title: body.title, category: body.category },
        ipAddress: req.ip,
      });

      successResponse(res, control, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/cass/risk-controls/:controlId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, controlId } = req.params;
      const schema = z.object({
        status: z.enum(['EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'NOT_TESTED']).optional(),
        likelihood: z.enum(['RARE', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'ALMOST_CERTAIN']).optional(),
        impact: z.enum(['NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE']).optional(),
        controlDescription: z.string().max(5000).optional(),
        controlOwner: z.string().max(255).optional(),
        nextReviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        mitigatingActions: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const control = await updateRiskControl(controlId, firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'RISK_CONTROL_UPDATED',
        entityType: 'risk_controls', entityId: controlId,
        details: body, ipAddress: req.ip,
      });

      successResponse(res, control);
    } catch (err) { next(err); }
  }
);

// ─── Regulatory Updates ──────────────────────────────────────────────────────

router.get('/:firmId/cass/regulatory-updates',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status } = req.query as Record<string, string>;
      const result = await getRegulatoryUpdates(req.params.firmId, { page, pageSize, status });
      paginatedResponse(res, result.updates, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/cass/regulatory-updates',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        title: z.string().min(1).max(500),
        source: z.string().min(1).max(255),
        publishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        summary: z.string().min(1).max(10000),
        affectedRegimes: z.array(z.string()),
        assignedTo: z.string().max(255).optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const update = await createRegulatoryUpdate(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'REGULATORY_UPDATE_CREATED',
        entityType: 'regulatory_updates', entityId: update.id,
        details: { title: body.title, source: body.source },
        ipAddress: req.ip,
      });

      successResponse(res, update, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/cass/regulatory-updates/:updateId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, updateId } = req.params;
      const schema = z.object({
        status: z.enum(['NEW', 'UNDER_REVIEW', 'IMPACT_ASSESSED', 'IMPLEMENTED', 'NOT_APPLICABLE']).optional(),
        assignedTo: z.string().max(255).optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const update = await updateRegulatoryUpdate(updateId, firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'REGULATORY_UPDATE_UPDATED',
        entityType: 'regulatory_updates', entityId: updateId,
        details: body, ipAddress: req.ip,
      });

      successResponse(res, update);
    } catch (err) { next(err); }
  }
);

// ─── Impact Assessments ──────────────────────────────────────────────────────

router.get('/:firmId/cass/impact-assessments',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status, regulatory_update_id } = req.query as Record<string, string>;
      const result = await getImpactAssessments(req.params.firmId, {
        page, pageSize, status, regulatoryUpdateId: regulatory_update_id,
      });
      paginatedResponse(res, result.assessments, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/cass/impact-assessments',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        regulatoryUpdateId: z.string().uuid(),
        assessedBy: z.string().min(1).max(255),
        impactLevel: z.enum(['NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE']),
        affectedProcesses: z.array(z.string()),
        requiredChanges: z.string().min(1).max(10000),
        implementationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const body = schema.parse(req.body);
      const assessment = await createImpactAssessment(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'IMPACT_ASSESSMENT_CREATED',
        entityType: 'impact_assessments', entityId: assessment.id,
        details: { regulatoryUpdateId: body.regulatoryUpdateId, impactLevel: body.impactLevel },
        ipAddress: req.ip,
      });

      successResponse(res, assessment, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/cass/impact-assessments/:assessmentId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, assessmentId } = req.params;
      const schema = z.object({
        status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED']).optional(),
        approvedBy: z.string().max(255).optional(),
      });
      const body = schema.parse(req.body);
      const assessment = await updateImpactAssessment(assessmentId, firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'IMPACT_ASSESSMENT_UPDATED',
        entityType: 'impact_assessments', entityId: assessmentId,
        details: body, ipAddress: req.ip,
      });

      successResponse(res, assessment);
    } catch (err) { next(err); }
  }
);

export { router as cassRouter };
