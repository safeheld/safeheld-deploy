import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';
import { prisma } from './prisma';

function isSmtpConfigured(): boolean {
  return !!(config.SMTP_HOST && config.SMTP_HOST.length > 0);
}

const transporter = isSmtpConfigured()
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
      secure: config.SMTP_PORT === 465,
    })
  : null;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  firmId?: string;
  userId?: string;
  emailType: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!transporter) {
    logger.debug({ emailType: opts.emailType, to: opts.to }, 'SMTP not configured — skipping email');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    await prisma.emailLog.create({
      data: {
        firmId: opts.firmId,
        userId: opts.userId,
        emailType: opts.emailType,
        recipientEmail: opts.to,
        subject: opts.subject,
        status: 'SENT',
      },
    }).catch(() => {});

    logger.info({ to: opts.to, subject: opts.subject, emailType: opts.emailType }, 'Email sent');
  } catch (err) {
    logger.error({ err, to: opts.to, subject: opts.subject }, 'Failed to send email');

    await prisma.emailLog.create({
      data: {
        firmId: opts.firmId,
        userId: opts.userId,
        emailType: opts.emailType,
        recipientEmail: opts.to,
        subject: opts.subject,
        status: 'FAILED',
        errorMessage: (err as Error).message,
      },
    }).catch(() => {});

    throw err;
  }
}

// ─── Brand wrapper ───────────────────────────────────────────────────────────

function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#0C1445;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Safeheld</span>
          </td>
        </tr>
        <!-- Title bar -->
        <tr>
          <td style="background:#3D3DFF;padding:16px 32px;">
            <span style="color:#ffffff;font-size:16px;font-weight:600;">${title}</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
              This is an automated alert from Safeheld. Do not reply to this email.<br>
              &copy; ${new Date().getFullYear()} Safeheld Ltd. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function field(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${value}</td>
  </tr>`;
}

function fieldTable(fields: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;">
    ${fields.map(([l, v]) => field(l, v)).join('')}
  </table>`;
}

function severityBadge(severity: string): string {
  const colors: Record<string, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#d97706',
    LOW: '#16a34a',
  };
  const color = colors[severity] || '#64748b';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${severity}</span>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    DETECTED: '#dc2626',
    ACKNOWLEDGED: '#ea580c',
    REMEDIATING: '#d97706',
    RESOLVED: '#16a34a',
    CLOSED: '#64748b',
    SHORTFALL: '#dc2626',
    EXCESS: '#d97706',
    MET: '#16a34a',
  };
  const color = colors[status] || '#64748b';
  return `<span style="display:inline-block;background:${color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">${status.replace(/_/g, ' ')}</span>`;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#3D3DFF;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;margin-top:8px;">${text}</a>`;
}

// ─── Templates ───────────────────────────────────────────────────────────────

export function breachDetectedEmail(params: {
  firmName: string;
  breachType: string;
  severity: string;
  description: string;
  breachId: string;
}): string {
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A safeguarding breach has been detected and requires your attention.
    </p>
    ${fieldTable([
      ['Firm', params.firmName],
      ['Breach Type', params.breachType.replace(/_/g, ' ')],
      ['Severity', severityBadge(params.severity)],
    ])}
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
      <p style="margin:0;color:#450a0a;font-size:14px;line-height:1.5;">${params.description}</p>
    </div>
    <p style="margin:16px 0 0;color:#475569;font-size:13px;">Breach ID: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">${params.breachId}</code></p>
    <div style="margin-top:24px;">
      ${ctaButton('View Breach', `${config.FRONTEND_URL}/breach/${params.breachId}`)}
    </div>`;

  return emailLayout('Breach Detected', body);
}

export function breachStatusChangeEmail(params: {
  firmName: string;
  breachType: string;
  severity: string;
  breachId: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}): string {
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A breach status has been updated.
    </p>
    ${fieldTable([
      ['Firm', params.firmName],
      ['Breach Type', params.breachType.replace(/_/g, ' ')],
      ['Severity', severityBadge(params.severity)],
      ['Previous Status', statusBadge(params.previousStatus)],
      ['New Status', statusBadge(params.newStatus)],
      ['Changed By', params.changedBy],
    ])}
    <div style="margin-top:24px;">
      ${ctaButton('View Breach', `${config.FRONTEND_URL}/breach/${params.breachId}`)}
    </div>`;

  return emailLayout('Breach Status Updated', body);
}

export function reconciliationFailedEmail(params: {
  firmName: string;
  reconciliationType: string;
  currency: string;
  requirement: string;
  resource: string;
  variance: string;
  variancePct: string;
  status: string;
  reconciliationDate: string;
  accountName?: string;
}): string {
  const acctField: [string, string][] = params.accountName
    ? [['Account', params.accountName]]
    : [];

  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A reconciliation has completed with a <strong>${params.status.toLowerCase()}</strong> result.
    </p>
    ${fieldTable([
      ['Firm', params.firmName],
      ['Type', params.reconciliationType.replace(/_/g, ' ')],
      ...acctField,
      ['Currency', params.currency],
      ['Date', params.reconciliationDate],
      ['Status', statusBadge(params.status)],
    ])}
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Requirement</td>
        <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Resource</td>
        <td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">Variance</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#0f172a;">${params.requirement}</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#0f172a;">${params.resource}</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#dc2626;">${params.variance} (${params.variancePct}%)</td>
      </tr>
    </table>
    <div style="margin-top:24px;">
      ${ctaButton('View Reconciliation', `${config.FRONTEND_URL}/reconciliation`)}
    </div>`;

  return emailLayout('Reconciliation Failed', body);
}

export function letterExpiryEmail(params: {
  firmName: string;
  bankName: string;
  accountId: string;
  expiryDate: string;
  daysUntilExpiry: number;
}): string {
  const urgent = params.daysUntilExpiry <= 7;
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      An acknowledgement letter is ${urgent ? '<strong>expiring very soon</strong>' : 'approaching expiry'} and needs renewal.
    </p>
    ${fieldTable([
      ['Firm', params.firmName],
      ['Bank', params.bankName],
      ['Account', params.accountId],
      ['Expiry Date', params.expiryDate],
      ['Days Remaining', `<span style="color:${urgent ? '#dc2626' : '#d97706'};font-weight:700;">${params.daysUntilExpiry} days</span>`],
    ])}
    <div style="margin-top:24px;">
      ${ctaButton('View Letters', `${config.FRONTEND_URL}/governance/letters`)}
    </div>`;

  return emailLayout('Acknowledgement Letter Expiring', body);
}

export function ddOverdueEmail(params: {
  firmName: string;
  bankName: string;
  nextReviewDue: string;
}): string {
  const body = `
    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">
      A third-party due diligence review is overdue and requires immediate attention.
    </p>
    ${fieldTable([
      ['Firm', params.firmName],
      ['Bank', params.bankName],
      ['Review Due', `<span style="color:#dc2626;font-weight:700;">${params.nextReviewDue}</span>`],
    ])}
    <div style="margin-top:24px;">
      ${ctaButton('View Due Diligence', `${config.FRONTEND_URL}/governance/due-diligence`)}
    </div>`;

  return emailLayout('Due Diligence Review Overdue', body);
}
