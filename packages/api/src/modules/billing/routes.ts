import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse, paginatedResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  getBillingDashboard,
  getBillingFirms,
  getInvoices,
  updateBillingSettings,
  extendTrial,
  generateInvoice,
  handleStripeWebhook,
  getFirmBilling,
  getFirmInvoices,
} from '../../services/billing';

const router = Router();

// ─── Admin Billing Dashboard ─────────────────────────────────────────────────

// GET /admin/billing/dashboard
router.get(
  '/dashboard',
  authenticate,
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getBillingDashboard();
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/billing/firms
router.get(
  '/firms',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const result = await getBillingFirms(page, pageSize);
      paginatedResponse(res, result.firms, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /admin/billing/firms/:firmId
const updateBillingSchema = z.object({
  baseMonthlyFee: z.number().min(0).optional(),
  basisPointsRate: z.number().min(0).max(1).optional(),
  billingStatus: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
  trialEndsAt: z.string().optional(),
  notes: z.string().optional(),
});

router.patch(
  '/firms/:firmId',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateBillingSchema.parse(req.body);
      const firm = await updateBillingSettings(req.params.firmId, req.user!.userId, body);
      successResponse(res, firm);
    } catch (err) {
      next(err);
    }
  }
);

// GET /admin/billing/invoices
router.get(
  '/invoices',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getInvoices({
        firmId: req.query.firmId as string,
        status: req.query.status as string,
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 50,
      });
      paginatedResponse(res, result.invoices, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/billing/firms/:firmId/invoice — manual invoice
router.post(
  '/firms/:firmId/invoice',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

      const invoice = await generateInvoice(req.params.firmId, periodStart, periodEnd);

      await logAudit({
        userId: req.user!.userId,
        action: 'BILLING_MANUAL_INVOICE',
        entityType: 'billing_invoices',
        entityId: invoice?.id || '00000000-0000-0000-0000-000000000000',
        details: { firmId: req.params.firmId, trigger: 'MANUAL' },
        ipAddress: req.ip,
      });

      successResponse(res, invoice, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /admin/billing/firms/:firmId/trial/extend
const extendTrialSchema = z.object({
  trialEndsAt: z.string(),
});

router.post(
  '/firms/:firmId/trial/extend',
  authenticate,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = extendTrialSchema.parse(req.body);
      const firm = await extendTrial(req.params.firmId, req.user!.userId, body.trialEndsAt);
      successResponse(res, firm);
    } catch (err) {
      next(err);
    }
  }
);

export { router as billingAdminRouter };

// ─── Firm-facing billing routes ──────────────────────────────────────────────

const firmBillingRouter = Router();

// GET /firms/:firmId/billing
firmBillingRouter.get(
  '/:firmId/billing',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getFirmBilling(req.params.firmId);
      successResponse(res, data);
    } catch (err) {
      next(err);
    }
  }
);

// GET /firms/:firmId/billing/invoices
firmBillingRouter.get(
  '/:firmId/billing/invoices',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const result = await getFirmInvoices(req.params.firmId, page);
      paginatedResponse(res, result.invoices, { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
    } catch (err) {
      next(err);
    }
  }
);

export { firmBillingRouter };

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/stripe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Stripe sends raw body — verify signature if configured
      const sig = req.headers['stripe-signature'];
      let event = req.body;

      if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      }

      await handleStripeWebhook(event);
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

export { stripeWebhookRouter };
