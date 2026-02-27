import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { fileStorage } from '../../utils/fileStorage';
import {
  SafeguardingDesignation,
  SafeguardingAccountStatus,
  LetterStatus,
  AcknowledgementLetterStatus,
  DueDiligenceOutcome,
  DueDiligenceReviewStatus,
  InsuranceCoverageType,
  InsuranceStatus,
  InsuranceContingencyStatus,
  AgentType,
  AgentStatus,
  PolicyDocumentType,
  PolicyDocumentStatus,
  ResponsibilityRoleType,
  FundType,
} from '@prisma/client';
import { computeResolutionPackHealth } from './service';

const router = Router();

const docUpload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  storage: multer.memoryStorage(),
});

// ─── Safeguarding Accounts Register ──────────────────────────────────────────

router.post('/:firmId/safeguarding-accounts',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        externalAccountId: z.string().min(1).max(100),
        bankName: z.string().min(1).max(255),
        accountNumberMasked: z.string().min(1).max(34),
        sortCode: z.string().max(8).optional(),
        currency: z.string().length(3),
        fundType: z.nativeEnum(FundType).default('ALL'),
        designation: z.nativeEnum(SafeguardingDesignation),
        status: z.nativeEnum(SafeguardingAccountStatus),
        openedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);

      const account = await prisma.safeguardingAccount.create({
        data: {
          firmId,
          externalAccountId: body.externalAccountId,
          bankName: body.bankName,
          accountNumberMasked: body.accountNumberMasked,
          sortCode: body.sortCode,
          currency: body.currency.toUpperCase(),
          fundType: body.fundType,
          designation: body.designation,
          status: body.status,
          openedDate: new Date(body.openedDate),
        },
      });

      await logAudit({
        firmId, userId: req.user!.userId,
        action: 'SAFEGUARDING_ACCOUNT_CREATED', entityType: 'safeguarding_accounts', entityId: account.id,
        details: { bankName: body.bankName, externalAccountId: body.externalAccountId },
        ipAddress: req.ip,
      });

      successResponse(res, account, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/safeguarding-accounts',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const { status } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { firmId: req.params.firmId };
      if (status) where.status = status;

      const [accounts, total] = await Promise.all([
        prisma.safeguardingAccount.findMany({
          where, orderBy: { createdAt: 'desc' }, skip, take: pageSize,
          include: {
            acknowledgementLetters: { where: { status: 'CURRENT' }, take: 1, orderBy: { version: 'desc' } },
            thirdPartyDueDiligence: { orderBy: { lastReviewDate: 'desc' }, take: 1 },
          },
        }),
        prisma.safeguardingAccount.count({ where }),
      ]);

      paginatedResponse(res, accounts, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/safeguarding-accounts/:accountId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, accountId } = req.params;
      const schema = z.object({
        status: z.nativeEnum(SafeguardingAccountStatus).optional(),
        letterStatus: z.nativeEnum(LetterStatus).optional(),
      });
      const body = schema.parse(req.body);
      const account = await prisma.safeguardingAccount.update({
        where: { id: accountId }, data: body,
      });
      await logAudit({
        firmId, userId: req.user!.userId, action: 'SAFEGUARDING_ACCOUNT_UPDATED',
        entityType: 'safeguarding_accounts', entityId: accountId, details: body, ipAddress: req.ip,
      });
      successResponse(res, account);
    } catch (err) { next(err); }
  }
);

// ─── Acknowledgement Letters ──────────────────────────────────────────────────

router.post('/:firmId/safeguarding-accounts/:accountId/letters',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  docUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, accountId } = req.params;
      if (!req.file) throw new ValidationError('No file uploaded');

      const account = await prisma.safeguardingAccount.findFirst({ where: { id: accountId, firmId } });
      if (!account) throw new NotFoundError('Safeguarding account');

      const schema = z.object({
        effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const body = schema.parse(req.body);

      // Supersede previous letters
      await prisma.acknowledgementLetter.updateMany({
        where: { firmId, safeguardingAccountId: accountId, status: 'CURRENT' },
        data: { status: 'SUPERSEDED' },
      });

      const lastLetter = await prisma.acknowledgementLetter.findFirst({
        where: { firmId, safeguardingAccountId: accountId },
        orderBy: { version: 'desc' },
      });
      const version = (lastLetter?.version || 0) + 1;

      const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const storagePath = await fileStorage.store(
        `firms/${firmId}/letters/${accountId}_v${version}_${Date.now()}.pdf`,
        req.file.buffer,
        req.file.mimetype
      );

      const effectiveDate = new Date(body.effectiveDate);
      const annualReviewDue = new Date(effectiveDate);
      annualReviewDue.setFullYear(annualReviewDue.getFullYear() + 1);

      const letter = await prisma.acknowledgementLetter.create({
        data: {
          firmId,
          safeguardingAccountId: accountId,
          version,
          fileStoragePath: storagePath,
          fileHash,
          uploadDate: new Date(),
          effectiveDate,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          annualReviewDue,
          status: 'CURRENT',
          uploadedBy: req.user!.userId,
        },
      });

      // Update account letter status
      await prisma.safeguardingAccount.update({
        where: { id: accountId },
        data: { letterStatus: 'CONFIRMED' },
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'LETTER_UPLOADED',
        entityType: 'acknowledgement_letters', entityId: letter.id,
        details: { accountId, version, effectiveDate: body.effectiveDate },
        ipAddress: req.ip,
      });

      successResponse(res, letter, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/safeguarding-accounts/:accountId/letters',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, accountId } = req.params;
      const letters = await prisma.acknowledgementLetter.findMany({
        where: { firmId, safeguardingAccountId: accountId },
        orderBy: { version: 'desc' },
        include: { uploader: { select: { name: true } } },
      });
      successResponse(res, letters);
    } catch (err) { next(err); }
  }
);

// ─── Third-Party Due Diligence ────────────────────────────────────────────────

router.post('/:firmId/safeguarding-accounts/:accountId/due-diligence',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, accountId } = req.params;
      const account = await prisma.safeguardingAccount.findFirst({ where: { id: accountId, firmId } });
      if (!account) throw new NotFoundError('Safeguarding account');

      const schema = z.object({
        bankName: z.string().min(1).max(255),
        initialDdDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lastReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nextReviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        creditworthinessAssessment: z.string().max(5000).optional(),
        diversificationConsidered: z.boolean().default(false),
        ddOutcome: z.nativeEnum(DueDiligenceOutcome),
      });
      const body = schema.parse(req.body);
      const nextReviewDue = new Date(body.nextReviewDue);
      const today = new Date();
      const reviewStatus: DueDiligenceReviewStatus = nextReviewDue < today ? 'OVERDUE'
        : nextReviewDue < new Date(today.getTime() + 30 * 86400000) ? 'DUE' : 'CURRENT';

      const dd = await prisma.thirdPartyDueDiligence.create({
        data: {
          firmId,
          safeguardingAccountId: accountId,
          bankName: body.bankName,
          initialDdDate: new Date(body.initialDdDate),
          lastReviewDate: new Date(body.lastReviewDate),
          nextReviewDue,
          reviewStatus,
          creditworthinessAssessment: body.creditworthinessAssessment,
          diversificationConsidered: body.diversificationConsidered,
          ddOutcome: body.ddOutcome,
        },
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'DUE_DILIGENCE_RECORDED',
        entityType: 'third_party_due_diligence', entityId: dd.id,
        details: { bankName: body.bankName, ddOutcome: body.ddOutcome, nextReviewDue: body.nextReviewDue },
        ipAddress: req.ip,
      });

      successResponse(res, dd, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/due-diligence',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const { review_status } = req.query as Record<string, string>;
      const where: Record<string, unknown> = { firmId: req.params.firmId };
      if (review_status) where.reviewStatus = review_status;

      const [records, total] = await Promise.all([
        prisma.thirdPartyDueDiligence.findMany({
          where, orderBy: { nextReviewDue: 'asc' }, skip, take: pageSize,
          include: { safeguardingAccount: { select: { bankName: true, accountNumberMasked: true } } },
        }),
        prisma.thirdPartyDueDiligence.count({ where }),
      ]);

      paginatedResponse(res, records, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

// ─── Insurance & Guarantees ───────────────────────────────────────────────────

router.post('/:firmId/insurance',
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
        status: z.nativeEnum(InsuranceStatus),
      });
      const body = schema.parse(req.body);
      const expiryDate = new Date(body.expiryDate);
      const today = new Date();
      const in30Days = new Date(today.getTime() + 30 * 86400000);

      const insurance = await prisma.insuranceGuarantee.create({
        data: {
          firmId,
          insurerName: body.insurerName,
          policyNumber: body.policyNumber,
          coverageType: body.coverageType,
          coverageAmount: body.coverageAmount,
          coverageCurrency: body.coverageCurrency.toUpperCase(),
          effectiveDate: new Date(body.effectiveDate),
          expiryDate,
          contingencyPlanRequiredBy: new Date(body.contingencyPlanRequiredBy),
          contingencyPlanStatus: 'NOT_DUE',
          status: expiryDate < today ? 'EXPIRED' : expiryDate < in30Days ? 'EXPIRING' : body.status,
        },
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'INSURANCE_CREATED',
        entityType: 'insurance_guarantees', entityId: insurance.id,
        details: { insurerName: body.insurerName, policyNumber: body.policyNumber },
        ipAddress: req.ip,
      });

      successResponse(res, insurance, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/insurance',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const [records, total] = await Promise.all([
        prisma.insuranceGuarantee.findMany({
          where: { firmId: req.params.firmId }, orderBy: { expiryDate: 'asc' }, skip, take: pageSize,
        }),
        prisma.insuranceGuarantee.count({ where: { firmId: req.params.firmId } }),
      ]);
      paginatedResponse(res, records, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

// ─── Policy Documents ─────────────────────────────────────────────────────────

router.post('/:firmId/policy-documents',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  docUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      if (!req.file) throw new ValidationError('No file uploaded');
      const schema = z.object({
        documentType: z.nativeEnum(PolicyDocumentType),
        title: z.string().min(1).max(255),
        boardApproved: z.coerce.boolean().default(false),
        boardApprovalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        annualReviewDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const body = schema.parse(req.body);

      const lastDoc = await prisma.policyDocument.findFirst({
        where: { firmId, documentType: body.documentType, status: 'CURRENT' },
        orderBy: { version: 'desc' },
      });
      const version = (lastDoc?.version || 0) + 1;

      // Supersede existing current version
      if (lastDoc) {
        await prisma.policyDocument.update({ where: { id: lastDoc.id }, data: { status: 'SUPERSEDED' } });
      }

      const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const storagePath = await fileStorage.store(
        `firms/${firmId}/policies/${body.documentType.toLowerCase()}_v${version}_${Date.now()}.pdf`,
        req.file.buffer, req.file.mimetype
      );

      const doc = await prisma.policyDocument.create({
        data: {
          firmId,
          documentType: body.documentType,
          title: body.title,
          version,
          fileStoragePath: storagePath,
          fileHash,
          boardApproved: body.boardApproved,
          boardApprovalDate: body.boardApprovalDate ? new Date(body.boardApprovalDate) : null,
          annualReviewDue: body.annualReviewDue ? new Date(body.annualReviewDue) : null,
          status: 'CURRENT',
          uploadedBy: req.user!.userId,
        },
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'POLICY_DOCUMENT_UPLOADED',
        entityType: 'policy_documents', entityId: doc.id,
        details: { documentType: body.documentType, title: body.title, version },
        ipAddress: req.ip,
      });

      successResponse(res, doc, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/policy-documents',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const { document_type, status } = req.query as Record<string, string>;
      const where: Record<string, unknown> = { firmId: req.params.firmId };
      if (document_type) where.documentType = document_type;
      if (status) where.status = status;

      const [docs, total] = await Promise.all([
        prisma.policyDocument.findMany({
          where, orderBy: [{ documentType: 'asc' }, { version: 'desc' }], skip, take: pageSize,
          include: { uploader: { select: { name: true } } },
        }),
        prisma.policyDocument.count({ where }),
      ]);

      paginatedResponse(res, docs, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

// ─── Agents & Distributors ────────────────────────────────────────────────────

router.post('/:firmId/agents',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        name: z.string().min(1).max(255),
        type: z.nativeEnum(AgentType),
        contactName: z.string().max(255).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        handlesRelevantFunds: z.boolean(),
        status: z.nativeEnum(AgentStatus).default('ACTIVE'),
      });
      const body = schema.parse(req.body);
      const agent = await prisma.agentAndDistributor.create({ data: { firmId, ...body } });
      await logAudit({
        firmId, userId: req.user!.userId, action: 'AGENT_CREATED',
        entityType: 'agents_and_distributors', entityId: agent.id,
        details: { name: body.name, type: body.type }, ipAddress: req.ip,
      });
      successResponse(res, agent, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/agents',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const [agents, total] = await Promise.all([
        prisma.agentAndDistributor.findMany({
          where: { firmId: req.params.firmId }, orderBy: { createdAt: 'desc' }, skip, take: pageSize,
        }),
        prisma.agentAndDistributor.count({ where: { firmId: req.params.firmId } }),
      ]);
      paginatedResponse(res, agents, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

// ─── Responsibility Assignments ───────────────────────────────────────────────

router.post('/:firmId/responsibilities',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        roleType: z.nativeEnum(ResponsibilityRoleType),
        personName: z.string().min(1).max(255),
        jobTitle: z.string().min(1).max(255),
        smfFunction: z.string().max(50).optional(),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        approvedBy: z.string().max(255).optional(),
        approvalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      });
      const body = schema.parse(req.body);
      const assignment = await prisma.responsibilityAssignment.create({
        data: {
          firmId,
          roleType: body.roleType,
          personName: body.personName,
          jobTitle: body.jobTitle,
          smfFunction: body.smfFunction,
          effectiveFrom: new Date(body.effectiveFrom),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
          approvedBy: body.approvedBy,
          approvalDate: body.approvalDate ? new Date(body.approvalDate) : null,
        },
      });
      await logAudit({
        firmId, userId: req.user!.userId, action: 'RESPONSIBILITY_ASSIGNED',
        entityType: 'responsibility_assignments', entityId: assignment.id,
        details: { roleType: body.roleType, personName: body.personName }, ipAddress: req.ip,
      });
      successResponse(res, assignment, 201);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/responsibilities',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignments = await prisma.responsibilityAssignment.findMany({
        where: { firmId: req.params.firmId, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });
      successResponse(res, assignments);
    } catch (err) { next(err); }
  }
);

// ─── Resolution Pack Health ───────────────────────────────────────────────────

router.post('/:firmId/resolution-pack/check',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const health = await computeResolutionPackHealth(firmId);

      const check = await prisma.resolutionPackHealthCheck.create({
        data: {
          firmId,
          checkDate: new Date(),
          overallStatus: health.overallStatus,
          components: health.components as unknown as Prisma.InputJsonValue,
          missingComponents: health.missingComponents.length > 0 ? health.missingComponents : undefined,
        },
      });

      await logAudit({
        firmId, userId: req.user!.userId, action: 'RESOLUTION_PACK_HEALTH_CHECKED',
        entityType: 'resolution_pack_health', entityId: check.id,
        details: { overallStatus: health.overallStatus }, ipAddress: req.ip,
      });

      successResponse(res, { ...check, details: health });
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/resolution-pack/health',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const latest = await prisma.resolutionPackHealthCheck.findFirst({
        where: { firmId: req.params.firmId },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) {
        return successResponse(res, { overallStatus: 'RED', message: 'No health check has been run yet.' });
      }
      successResponse(res, latest);
    } catch (err) { next(err); }
  }
);

// ─── Auditor Findings ─────────────────────────────────────────────────────────

router.post('/:firmId/auditor-findings',
  authenticate, requireFirmAccess, requireRole('AUDITOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        auditPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().min(1).max(5000),
        severity: z.enum(['HIGH', 'MEDIUM', 'LOW', 'OBSERVATION']),
        linkedEntityType: z.string().max(100).optional(),
        linkedEntityId: z.string().uuid().optional(),
      });
      const body = schema.parse(req.body);
      const finding = await prisma.auditorFinding.create({
        data: {
          firmId,
          createdBy: req.user!.userId,
          auditPeriodEnd: new Date(body.auditPeriodEnd),
          description: body.description,
          severity: body.severity as never,
          linkedEntityType: body.linkedEntityType,
          linkedEntityId: body.linkedEntityId,
        },
      });
      successResponse(res, finding, 201);
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/auditor-findings/:findingId/respond',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, findingId } = req.params;
      const schema = z.object({ management_response: z.string().min(1).max(5000) });
      const body = schema.parse(req.body);
      const finding = await prisma.auditorFinding.update({
        where: { id: findingId },
        data: {
          managementResponse: body.management_response,
          respondedBy: req.user!.userId,
          respondedAt: new Date(),
          status: 'MANAGEMENT_RESPONSE',
        },
      });
      successResponse(res, finding);
    } catch (err) { next(err); }
  }
);

router.get('/:firmId/auditor-findings',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const [findings, total] = await Promise.all([
        prisma.auditorFinding.findMany({
          where: { firmId: req.params.firmId }, orderBy: { createdAt: 'desc' }, skip, take: pageSize,
          include: { creator: { select: { name: true } }, responder: { select: { name: true } } },
        }),
        prisma.auditorFinding.count({ where: { firmId: req.params.firmId } }),
      ]);
      paginatedResponse(res, findings, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) { next(err); }
  }
);

export { router as governanceRouter };
