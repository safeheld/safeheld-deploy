import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  rulesEngine,
  getComplianceScore,
  getRunFindings,
  getRemediationActions,
  updateRemediationAction,
  getFrameworkRules,
  upsertFrameworkRule,
} from '../../services/rules-engine';

const router = Router();

// GET /api/v1/firms/:firmId/reconciliation/:runId/findings
router.get(
  '/:firmId/reconciliation/:runId/findings',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const findings = await getRunFindings(req.params.runId);
      successResponse(res, findings);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/compliance/score
router.get(
  '/:firmId/compliance/score',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const score = await getComplianceScore(req.params.firmId);
      successResponse(res, score);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/remediation
router.get(
  '/:firmId/remediation',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { status } = req.query as Record<string, string>;
      const result = await getRemediationActions(req.params.firmId, { status, page, pageSize });
      paginatedResponse(res, result.actions, {
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

// PATCH /api/v1/firms/:firmId/remediation/:id
router.patch(
  '/:firmId/remediation/:id',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'OVERDUE', 'ESCALATED']),
        assigned_to: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const action = await updateRemediationAction(req.params.id, req.params.firmId, {
        status: body.status,
        assignedTo: body.assigned_to,
      });

      await logAudit({
        firmId: req.params.firmId,
        userId: req.user!.userId,
        action: 'REMEDIATION_UPDATED',
        entityType: 'remediation_actions',
        entityId: req.params.id,
        details: { status: body.status, assignedTo: body.assigned_to },
        ipAddress: req.ip,
      });

      successResponse(res, action);
    } catch (err) {
      next(err);
    }
  }
);

export { router as rulesEngineRouter };

// ─── Framework rules admin routes ────────────────────────────────────────────

const adminRouter = Router();

// GET /api/v1/frameworks/:framework/rules
adminRouter.get(
  '/:framework/rules',
  authenticate,
  requireRole('ADMIN', 'COMPLIANCE_OFFICER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rules = await getFrameworkRules(req.params.framework.toUpperCase());
      successResponse(res, rules);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/admin/frameworks/:framework/rules
adminRouter.post(
  '/:framework/rules',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        rule_code: z.string().min(1).max(20),
        rule_name: z.string().min(1).max(255),
        rule_description: z.string().min(1),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
        source_regulation: z.string().min(1).max(255),
        source_article: z.string().min(1).max(255),
        active: z.boolean().optional(),
        effective_from: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const rule = await upsertFrameworkRule({
        ruleCode: body.rule_code,
        framework: req.params.framework.toUpperCase(),
        ruleName: body.rule_name,
        ruleDescription: body.rule_description,
        severity: body.severity,
        sourceRegulation: body.source_regulation,
        sourceArticle: body.source_article,
        active: body.active,
        effectiveFrom: body.effective_from ? new Date(body.effective_from) : undefined,
      });

      await logAudit({
        firmId: req.user!.firmId,
        userId: req.user!.userId,
        action: 'FRAMEWORK_RULE_UPSERTED',
        entityType: 'framework_rules',
        entityId: rule.id,
        details: { ruleCode: body.rule_code, framework: req.params.framework },
        ipAddress: req.ip,
      });

      successResponse(res, rule, 201);
    } catch (err) {
      next(err);
    }
  }
);

export { adminRouter as frameworkAdminRouter };
