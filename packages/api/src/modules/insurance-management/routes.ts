import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { InsuranceCoverageType } from '@prisma/client';
import {
  getInsurancePolicies,
  createInsurancePolicy,
  getExpiryManagement,
  recordExpiryDecision,
  getFcaNotificationTracking,
} from './service';

const router = Router();

// GET /:firmId/insurance-management — list policies
router.get(
  '/:firmId/insurance-management',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const policies = await getInsurancePolicies(firmId);
      successResponse(res, policies);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/insurance-management — create policy
router.post(
  '/:firmId/insurance-management',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        insurerName: z.string().min(1).max(255),
        policyNumber: z.string().min(1).max(100),
        coverageType: z.nativeEnum(InsuranceCoverageType),
        coverageAmount: z.number().positive(),
        coverageCurrency: z.string().length(3),
        effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        contingencyPlanRequiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        premium: z.number().positive().optional(),
        hasRestrictiveConditions: z.boolean().optional(),
        restrictiveConditionDetails: z.string().max(5000).optional(),
        switchToSegregationPlan: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);

      const policy = await createInsurancePolicy(firmId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'INSURANCE_POLICY_CREATED',
        entityType: 'insurance_guarantees',
        entityId: policy.id,
        details: {
          insurerName: body.insurerName,
          policyNumber: body.policyNumber,
          hasRestrictiveConditions: body.hasRestrictiveConditions ?? false,
        },
        ipAddress: req.ip,
      });

      successResponse(res, policy, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/insurance-management/expiry — expiry management
router.get(
  '/:firmId/insurance-management/expiry',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const result = await getExpiryManagement(firmId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/insurance-management/:policyId/expiry-decision — record decision
router.post(
  '/:firmId/insurance-management/:policyId/expiry-decision',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, policyId } = req.params;
      const schema = z.object({
        decision: z.enum(['CONTINUE', 'SWITCH_PROVIDER', 'SWITCH_TO_SEGREGATION']),
        fcaNotified: z.boolean(),
        fcaNotificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        contingencyPlan: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);

      const result = await recordExpiryDecision(firmId, policyId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'INSURANCE_EXPIRY_DECISION_RECORDED',
        entityType: 'insurance_guarantees',
        entityId: policyId,
        details: { decision: body.decision, fcaNotified: body.fcaNotified },
        ipAddress: req.ip,
      });

      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/insurance-management/fca-notifications — notification tracking
router.get(
  '/:firmId/insurance-management/fca-notifications',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const notifications = await getFcaNotificationTracking(firmId);
      successResponse(res, notifications);
    } catch (err) {
      next(err);
    }
  },
);

export { router as insuranceManagementRouter };
