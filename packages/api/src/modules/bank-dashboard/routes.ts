import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { logAudit } from '../audit/service';
import { AuthorizationError } from '../../utils/errors';
import {
  getBankInstitutionId,
  getBankOverview,
  getFirmSummary,
  getBankAlerts,
  getPortfolioSummary,
  buildOverviewCsv,
} from './service';

const router = Router();

// All bank-dashboard routes require authentication and BANK_VIEWER role
router.use(authenticate, requireRole('BANK_VIEWER', 'ADMIN'));

// Helper: resolve bankInstitutionId or throw
async function resolveBankId(req: Request): Promise<string> {
  if (req.user!.role === 'ADMIN') {
    // Admin can use query param to specify a bank institution
    const id = req.query.bank_institution_id as string;
    if (!id) throw new AuthorizationError('Admin must supply bank_institution_id query param');
    return id;
  }
  const bankId = await getBankInstitutionId(req.user!.userId);
  if (!bankId) throw new AuthorizationError('User is not linked to a bank institution');
  return bankId;
}

// GET /api/v1/bank-dashboard/overview
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankInstitutionId = await resolveBankId(req);
    const overview = await getBankOverview(bankInstitutionId);
    const portfolio = await getPortfolioSummary(bankInstitutionId, overview);

    await logAudit({
      userId: req.user!.userId,
      action: 'BANK_DASHBOARD_OVERVIEW_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { firmCount: overview.length },
      ipAddress: req.ip,
    });

    successResponse(res, { portfolio, firms: overview });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-dashboard/firms/:firmId/summary
router.get('/firms/:firmId/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankInstitutionId = await resolveBankId(req);
    const { firmId } = req.params;

    const summary = await getFirmSummary(bankInstitutionId, firmId);
    if (!summary) throw new AuthorizationError('Firm is not linked to your bank institution');

    await logAudit({
      userId: req.user!.userId,
      action: 'BANK_DASHBOARD_FIRM_SUMMARY_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { firmId },
      ipAddress: req.ip,
    });

    successResponse(res, summary);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-dashboard/alerts
router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankInstitutionId = await resolveBankId(req);
    const alerts = await getBankAlerts(bankInstitutionId);

    await logAudit({
      userId: req.user!.userId,
      action: 'BANK_DASHBOARD_ALERTS_ACCESSED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { alertCount: alerts.length },
      ipAddress: req.ip,
    });

    successResponse(res, alerts);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/bank-dashboard/export
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bankInstitutionId = await resolveBankId(req);
    const overview = await getBankOverview(bankInstitutionId);
    const csv = buildOverviewCsv(overview);

    await logAudit({
      userId: req.user!.userId,
      action: 'BANK_DASHBOARD_EXPORT_DOWNLOADED',
      entityType: 'bank_institutions',
      entityId: bankInstitutionId,
      details: { rowCount: overview.length },
      ipAddress: req.ip,
    });

    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bank-dashboard-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export { router as bankDashboardRouter };
