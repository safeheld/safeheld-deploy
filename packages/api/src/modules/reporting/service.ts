import crypto from 'crypto';
import puppeteer from 'puppeteer';
import { prisma } from '../../utils/prisma';
import { fileStorage } from '../../utils/fileStorage';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { ReportType, ReportStatus } from '@prisma/client';

export async function generateSafeguardingReturn(
  firmId: string,
  periodStart: Date,
  periodEnd: Date,
  userId: string
): Promise<object> {
  const [firm, reconciliationRuns, breaches, accounts] = await Promise.all([
    prisma.firm.findUnique({ where: { id: firmId } }),
    prisma.reconciliationRun.findMany({
      where: {
        firmId,
        reconciliationDate: { gte: periodStart, lte: periodEnd },
        reconciliationType: 'INTERNAL',
      },
      orderBy: { reconciliationDate: 'asc' },
    }),
    prisma.breach.findMany({
      where: {
        firmId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
    }),
  ]);

  if (!firm) throw new Error('Firm not found');

  // Calculate aggregate stats
  const totalRuns = reconciliationRuns.length;
  const metRuns = reconciliationRuns.filter(r => r.status === 'MET').length;
  const shortfallRuns = reconciliationRuns.filter(r => r.status === 'SHORTFALL').length;
  const excessRuns = reconciliationRuns.filter(r => r.status === 'EXCESS').length;
  const complianceRate = totalRuns > 0 ? ((metRuns / totalRuns) * 100).toFixed(1) : '100.0';

  const openBreaches = breaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status));
  const notifiableBreaches = breaches.filter(b => b.isNotifiable);

  const returnData = {
    reportType: 'SAFEGUARDING_RETURN',
    firm: {
      id: firm.id,
      name: firm.name,
      fcaFrn: firm.fcaFrn,
      regime: firm.regime,
      safeguardingMethod: firm.safeguardingMethod,
    },
    period: {
      start: periodStart.toISOString().split('T')[0],
      end: periodEnd.toISOString().split('T')[0],
    },
    reconciliation: {
      totalRuns,
      metRuns,
      shortfallRuns,
      excessRuns,
      complianceRate: `${complianceRate}%`,
      currencies: [...new Set(reconciliationRuns.map(r => r.currency))],
    },
    safeguardingAccounts: {
      total: accounts.length,
      active: accounts.filter(a => a.status === 'ACTIVE').length,
      withConfirmedLetters: accounts.filter(a => a.letterStatus === 'CONFIRMED').length,
    },
    breaches: {
      total: breaches.length,
      open: openBreaches.length,
      notifiable: notifiableBreaches.length,
      bySeverity: {
        CRITICAL: breaches.filter(b => b.severity === 'CRITICAL').length,
        HIGH: breaches.filter(b => b.severity === 'HIGH').length,
        MEDIUM: breaches.filter(b => b.severity === 'MEDIUM').length,
        LOW: breaches.filter(b => b.severity === 'LOW').length,
      },
    },
    generatedAt: new Date().toISOString(),
    generatedBy: userId,
  };

  return returnData;
}

export async function generateAssuranceReport(
  firmId: string,
  reportType: ReportType,
  periodStart: Date,
  periodEnd: Date,
  userId: string
): Promise<{ reportId: string; pdfUrl?: string }> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new Error('Firm not found');

  const returnData = await generateSafeguardingReturn(firmId, periodStart, periodEnd, userId);

  const htmlContent = buildReportHtml(firm.name, reportType, periodStart, periodEnd, returnData);
  const contentHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

  let pdfStoragePath = `placeholder/report-${Date.now()}.pdf`;

  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } }));
    await browser.close();

    const storageKey = `firms/${firmId}/reports/${reportType.toLowerCase()}_${Date.now()}.pdf`;
    pdfStoragePath = await fileStorage.store(storageKey, pdfBuffer, 'application/pdf');
  } catch (err) {
    logger.error({ err }, 'PDF generation failed — saving report metadata only');
  }

  const report = await prisma.assuranceReport.create({
    data: {
      firmId,
      reportType,
      periodStart,
      periodEnd,
      generatedBy: userId,
      status: 'DRAFT',
      contentHash,
      pdfStoragePath,
    },
  });

  return { reportId: report.id };
}

export async function generateBoardReport(
  firmId: string,
  reportMonth: Date,
  userId: string
): Promise<{ reportId: string }> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new Error('Firm not found');

  const periodStart = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1);
  const periodEnd = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 0);

  const htmlContent = buildBoardPackHtml(firm.name, reportMonth, periodStart, periodEnd);
  const contentHash = crypto.createHash('sha256').update(htmlContent).digest('hex');

  let pdfStoragePath = `placeholder/board-${Date.now()}.pdf`;

  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } }));
    await browser.close();

    const storageKey = `firms/${firmId}/board-reports/board_${reportMonth.toISOString().split('T')[0]}_${Date.now()}.pdf`;
    pdfStoragePath = await fileStorage.store(storageKey, pdfBuffer, 'application/pdf');
  } catch (err) {
    logger.error({ err }, 'Board pack PDF generation failed');
  }

  const report = await prisma.boardReport.create({
    data: {
      firmId,
      reportMonth,
      generatedBy: userId,
      contentHash,
      pdfStoragePath,
    },
  });

  return { reportId: report.id };
}

export async function finaliseReport(
  reportId: string,
  firmId: string,
  userId: string
): Promise<object> {
  const report = await prisma.assuranceReport.findFirst({ where: { id: reportId, firmId } });
  if (!report) throw new Error('Report not found');
  if (report.status !== 'DRAFT') throw new Error('Only DRAFT reports can be finalised');

  return prisma.assuranceReport.update({
    where: { id: reportId },
    data: { status: 'FINAL' },
  });
}

export async function shareReport(
  reportId: string,
  firmId: string,
  expiresInHours: number
): Promise<{ shareToken: string; shareUrl: string; expiresAt: Date }> {
  const report = await prisma.assuranceReport.findFirst({ where: { id: reportId, firmId } });
  if (!report) throw new Error('Report not found');
  if (report.status === 'DRAFT') throw new Error('Cannot share a DRAFT report');

  const shareToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);

  await prisma.assuranceReport.update({
    where: { id: reportId },
    data: { shareToken, shareExpiresAt: expiresAt, status: 'SHARED' },
  });

  return {
    shareToken,
    shareUrl: `${config.FRONTEND_URL}/reports/shared/${shareToken}`,
    expiresAt,
  };
}

export async function getReportDownloadUrl(reportId: string, firmId: string): Promise<string> {
  const report = await prisma.assuranceReport.findFirst({ where: { id: reportId, firmId } });
  if (!report) throw new Error('Report not found');
  return fileStorage.getSignedDownloadUrl(report.pdfStoragePath, 3600);
}

function buildReportHtml(
  firmName: string,
  reportType: ReportType,
  periodStart: Date,
  periodEnd: Date,
  data: object
): string {
  const dataStr = JSON.stringify(data, null, 2);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; font-size: 11pt; margin: 0; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 8px; }
    h2 { color: #1e40af; margin-top: 24px; }
    .header { background: #1e40af; color: white; padding: 20px; margin-bottom: 24px; }
    .header h1 { color: white; border: none; }
    .section { margin-bottom: 20px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f3f4f6; padding: 8px; text-align: left; border: 1px solid #d1d5db; }
    td { padding: 8px; border: 1px solid #d1d5db; }
    .badge-green { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; }
    .badge-red { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 12px; }
    .badge-yellow { background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; }
    pre { background: #f9fafb; padding: 12px; font-size: 8pt; overflow: auto; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 9pt; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Safeheld — ${reportType.replace(/_/g, ' ')}</h1>
    <p>${firmName}</p>
    <p>Period: ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}</p>
  </div>

  <div class="section">
    <h2>Report Data</h2>
    <pre>${dataStr}</pre>
  </div>

  <div class="footer">
    <p>Generated by Safeheld at ${new Date().toISOString()}. This report is confidential.</p>
  </div>
</body>
</html>`;
}

function buildBoardPackHtml(
  firmName: string,
  reportMonth: Date,
  periodStart: Date,
  periodEnd: Date
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #1f2937; font-size: 11pt; }
    h1 { color: #1e40af; border-bottom: 2px solid #1e40af; }
    .header { background: #1e40af; color: white; padding: 20px; }
    .section { margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="color:white;border:none;">Board Safeguarding Report</h1>
    <p>${firmName} — ${reportMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</p>
  </div>
  <div class="section">
    <h2>Executive Summary</h2>
    <p>This board pack covers safeguarding compliance for the period
    ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}.</p>
  </div>
  <div style="margin-top: 40px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 9pt;">
    <p>Generated by Safeheld at ${new Date().toISOString()}. Confidential — for board use only.</p>
  </div>
</body>
</html>`;
}
