import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { AuthenticationError } from '../../utils/errors';
import {
  authenticateBankApiKey,
  createBankApiKey,
  getBankPortfolioView,
  getBankFirmView,
  getBankAlerts,
  getApiDocs,
  type BankApiAuth,
} from './service';

const router = Router();

// ─── API Key Auth Middleware ─────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      bankAuth?: BankApiAuth;
    }
  }
}

async function authenticateBankApi(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return next(new AuthenticationError('X-API-Key header is required'));
    }
    const auth = await authenticateBankApiKey(apiKey);
    req.bankAuth = auth;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── API Key Authenticated Routes ───────────────────────────────────────────

// GET /api/v1/bank-api/portfolio — portfolio view
router.get('/portfolio', authenticateBankApi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bankInstitutionId } = req.bankAuth!;
    const portfolio = await getBankPortfolioView(bankInstitutionId);

    await logAudit({
      action: 'BANK_API_PORTFOLIO_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { apiKeyId: req.bankAuth!.apiKeyId, firmCount: portfolio.firmCount },
      ipAddress: req.ip,
    });

    successResponse(res, portfolio);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-api/firms/:firmId — firm view
router.get('/firms/:firmId', authenticateBankApi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bankInstitutionId } = req.bankAuth!;
    const { firmId } = req.params;
    const firmView = await getBankFirmView(bankInstitutionId, firmId);

    await logAudit({
      action: 'BANK_API_FIRM_VIEW_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { apiKeyId: req.bankAuth!.apiKeyId, firmId },
      ipAddress: req.ip,
    });

    successResponse(res, firmView);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-api/alerts — alerts
router.get('/alerts', authenticateBankApi, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bankInstitutionId } = req.bankAuth!;
    const alerts = await getBankAlerts(bankInstitutionId);

    await logAudit({
      action: 'BANK_API_ALERTS_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { apiKeyId: req.bankAuth!.apiKeyId, alertCount: alerts.length },
      ipAddress: req.ip,
    });

    successResponse(res, alerts);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/bank-api/keys — create API key (requires standard ADMIN auth)
router.post('/keys', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      bankInstitutionId: z.string().uuid(),
      label: z.string().min(1).max(255),
    });
    const body = schema.parse(req.body);

    const result = await createBankApiKey(body.bankInstitutionId, body.label);

    await logAudit({
      userId: req.user!.userId,
      action: 'BANK_API_KEY_CREATED',
      entityType: 'bank_api_keys',
      entityId: result.id,
      details: { bankInstitutionId: body.bankInstitutionId, label: body.label },
      ipAddress: req.ip,
    });

    successResponse(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-api/docs — API documentation
router.get('/docs', (_req: Request, res: Response) => {
  successResponse(res, getApiDocs());
});

export { router as bankApiRouter };
