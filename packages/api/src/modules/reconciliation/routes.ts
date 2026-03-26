import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  runReconciliation,
  getReconciliationHistory,
  getReconciliationBreaks,
  resolveBreak,
  getDashboardSummary,
  getReconciliationCalendar,
  getNextReconDue,
  importBankStatement,
  getAssetPools,
  createAssetPool,
} from './service';
import { BreakClassification, BankStatementFormat } from '@prisma/client';

const router = Router();

// Multer config for file uploads (memory storage, 10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/v1/firms/:firmId/reconciliation/run
router.post('/:firmId/reconciliation/run',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        reconciliation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
        asset_pool_id: z.string().uuid().optional(),
      });
      const body = schema.parse(req.body);
      const reconciliationDate = new Date(body.reconciliation_date);

      const runIds = await runReconciliation({
        firmId,
        reconciliationDate,
        trigger: 'MANUAL',
        triggeredByUserId: req.user!.userId,
        assetPoolId: body.asset_pool_id,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'RECONCILIATION_RUN',
        entityType: 'reconciliation_runs',
        entityId: runIds[0] || firmId,
        details: { reconciliationDate: body.reconciliation_date, runIds, trigger: 'MANUAL', assetPoolId: body.asset_pool_id },
        ipAddress: req.ip,
      });

      successResponse(res, { runIds, reconciliationDate: body.reconciliation_date });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/history
router.get('/:firmId/reconciliation/history',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { reconciliation_type, currency, from, to } = req.query as Record<string, string>;

      const result = await getReconciliationHistory(firmId, {
        reconciliationType: reconciliation_type as 'INTERNAL' | 'EXTERNAL' | undefined,
        currency,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        page,
        pageSize,
      });

      paginatedResponse(res, result.runs, {
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

// GET /api/v1/firms/:firmId/reconciliation/breaks
router.get('/:firmId/reconciliation/breaks',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { resolved } = req.query as Record<string, string>;

      const result = await getReconciliationBreaks(firmId, {
        resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
        page,
        pageSize,
      });

      paginatedResponse(res, result.breaks, {
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

// PUT /api/v1/firms/:firmId/reconciliation/breaks/:breakId/resolve
router.put('/:firmId/reconciliation/breaks/:breakId/resolve',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, breakId } = req.params;
      const schema = z.object({
        classification: z.nativeEnum(BreakClassification),
        explanation: z.string().min(1).max(2000),
      });
      const body = schema.parse(req.body);

      const brk = await resolveBreak(breakId, firmId, req.user!.userId, body);

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BREAK_RESOLVED',
        entityType: 'reconciliation_breaks',
        entityId: breakId,
        details: { classification: body.classification, explanation: body.explanation },
        ipAddress: req.ip,
      });

      successResponse(res, brk);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/dashboard
router.get('/:firmId/reconciliation/dashboard',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await getDashboardSummary(req.params.firmId);
      successResponse(res, summary);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/calendar
router.get('/:firmId/reconciliation/calendar',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        year: z.coerce.number().int().min(2020).max(2050),
        month: z.coerce.number().int().min(1).max(12),
      });
      const { year, month } = schema.parse(req.query);

      const calendar = await getReconciliationCalendar(firmId, year, month);
      successResponse(res, calendar);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/next-due
router.get('/:firmId/reconciliation/next-due',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getNextReconDue(req.params.firmId);
      successResponse(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reconciliation/import-statement
// Supports multipart file upload (field name: "file") or JSON body for manual entry
router.post('/:firmId/reconciliation/import-statement',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN', 'FINANCE_OPS'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;

      // For multipart uploads, form fields come in req.body; for JSON they also come in req.body
      const schema = z.object({
        safeguarding_account_id: z.string().uuid(),
        format: z.nativeEnum(BankStatementFormat),
        // Manual entry fields
        closing_balance: z.coerce.number().optional(),
        opening_balance: z.coerce.number().optional(),
        statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        currency: z.string().length(3).optional(),
      });
      const body = schema.parse(req.body);

      const file = req.file;

      // Validate: file formats require a file, manual requires closing_balance
      if (body.format !== 'MANUAL' && !file) {
        throw new ValidationError('File upload is required for non-manual imports');
      }
      if (body.format === 'MANUAL' && (body.closing_balance === undefined || body.closing_balance === null)) {
        throw new ValidationError('closing_balance is required for manual imports');
      }
      if (body.format === 'MANUAL' && !body.statement_date) {
        throw new ValidationError('statement_date is required for manual imports');
      }

      const result = await importBankStatement({
        firmId,
        safeguardingAccountId: body.safeguarding_account_id,
        format: body.format,
        userId: req.user!.userId,
        fileBuffer: file?.buffer,
        filename: file?.originalname,
        closingBalance: body.closing_balance,
        openingBalance: body.opening_balance,
        statementDate: body.statement_date ? new Date(body.statement_date) : undefined,
        currency: body.currency,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'BANK_STATEMENT_IMPORTED',
        entityType: 'bank_statement_imports',
        entityId: result.id,
        details: {
          format: body.format,
          safeguardingAccountId: body.safeguarding_account_id,
          filename: file?.originalname || 'manual',
          transactionsCreated: result.transactionsCreated,
        },
        ipAddress: req.ip,
      });

      successResponse(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/reconciliation/asset-pools
router.get('/:firmId/reconciliation/asset-pools',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pools = await getAssetPools(req.params.firmId);
      successResponse(res, pools);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/reconciliation/asset-pools
router.post('/:firmId/reconciliation/asset-pools',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        name: z.string().min(1).max(255),
        pool_type: z.enum(['E_MONEY', 'PAYMENT_SERVICES', 'COMBINED']),
        description: z.string().max(2000).optional(),
      });
      const body = schema.parse(req.body);

      const pool = await createAssetPool(firmId, {
        name: body.name,
        poolType: body.pool_type,
        description: body.description,
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'ASSET_POOL_CREATED',
        entityType: 'asset_pools',
        entityId: pool.id,
        details: { name: body.name, poolType: body.pool_type },
        ipAddress: req.ip,
      });

      successResponse(res, pool, 201);
    } catch (err) {
      next(err);
    }
  }
);

export { router as reconciliationRouter };
