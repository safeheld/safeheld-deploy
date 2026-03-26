import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { ThirdPartyType, DueDiligenceOutcome } from '@prisma/client';
import {
  getThirdPartyRegister,
  createThirdParty,
  updateThirdParty,
  createDueDiligenceAssessment,
  getDiversificationAssessment,
  createDiversificationAssessment,
  getDueDiligenceAlerts,
} from './service';

const router = Router();

// GET /:firmId/third-party-dd/register — list all third parties
router.get(
  '/:firmId/third-party-dd/register',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const parties = await getThirdPartyRegister(firmId);
      successResponse(res, parties);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/third-party-dd/register — create third party
router.post(
  '/:firmId/third-party-dd/register',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        name: z.string().min(1).max(255),
        partyType: z.nativeEnum(ThirdPartyType),
        jurisdiction: z.string().max(100).optional(),
        dateAppointed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        servicesProvided: z.string().max(5000).optional(),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        linkedSafeguardingAccountId: z.string().uuid().optional(),
      });
      const body = schema.parse(req.body);

      const party = await createThirdParty(firmId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'THIRD_PARTY_CREATED',
        entityType: 'third_party_registers',
        entityId: party.id,
        details: { name: body.name, partyType: body.partyType },
        ipAddress: req.ip,
      });

      successResponse(res, party, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /:firmId/third-party-dd/register/:partyId — update
router.put(
  '/:firmId/third-party-dd/register/:partyId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, partyId } = req.params;
      const schema = z.object({
        name: z.string().min(1).max(255).optional(),
        partyType: z.nativeEnum(ThirdPartyType).optional(),
        jurisdiction: z.string().max(100).optional(),
        dateAppointed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        servicesProvided: z.string().max(5000).optional(),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        linkedSafeguardingAccountId: z.string().uuid().optional(),
        isActive: z.boolean().optional(),
      });
      const body = schema.parse(req.body);

      const updated = await updateThirdParty(firmId, partyId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'THIRD_PARTY_UPDATED',
        entityType: 'third_party_registers',
        entityId: partyId,
        details: body,
        ipAddress: req.ip,
      });

      successResponse(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/third-party-dd/:partyId/assessment — create DD assessment
router.post(
  '/:firmId/third-party-dd/:partyId/assessment',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, partyId } = req.params;
      const schema = z.object({
        safeguardingAccountId: z.string().uuid(),
        bankName: z.string().min(1).max(255),
        initialDdDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lastReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nextReviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        creditworthinessAssessment: z.string().max(5000).optional(),
        financialStabilityAssessment: z.string().max(5000).optional(),
        regulatoryStatusAssessment: z.string().max(5000).optional(),
        serviceQualityAssessment: z.string().max(5000).optional(),
        jurisdictionRiskAssessment: z.string().max(5000).optional(),
        diversificationConsidered: z.boolean().optional(),
        ddOutcome: z.nativeEnum(DueDiligenceOutcome),
        approvedByName: z.string().max(255).optional(),
        approvedByRole: z.string().max(255).optional(),
      });
      const body = schema.parse(req.body);

      const dd = await createDueDiligenceAssessment(firmId, partyId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'DD_ASSESSMENT_CREATED',
        entityType: 'third_party_due_diligence',
        entityId: dd.id,
        details: { partyId, bankName: body.bankName, ddOutcome: body.ddOutcome },
        ipAddress: req.ip,
      });

      successResponse(res, dd, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/third-party-dd/diversification — get latest
router.get(
  '/:firmId/third-party-dd/diversification',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const assessment = await getDiversificationAssessment(firmId);
      successResponse(res, assessment);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:firmId/third-party-dd/diversification — create
router.post(
  '/:firmId/third-party-dd/diversification',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        isDiversified: z.boolean(),
        rationale: z.string().min(1).max(5000),
        assessedBy: z.string().min(1).max(255),
      });
      const body = schema.parse(req.body);

      const assessment = await createDiversificationAssessment(firmId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'DIVERSIFICATION_ASSESSMENT_CREATED',
        entityType: 'diversification_assessments',
        entityId: assessment.id,
        details: { isDiversified: body.isDiversified, singleBankFlag: assessment.singleBankFlag },
        ipAddress: req.ip,
      });

      successResponse(res, assessment, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:firmId/third-party-dd/alerts — alerts
router.get(
  '/:firmId/third-party-dd/alerts',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const alerts = await getDueDiligenceAlerts(firmId);
      successResponse(res, alerts);
    } catch (err) {
      next(err);
    }
  },
);

export { router as thirdPartyDdRouter };
