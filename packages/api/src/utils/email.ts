import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';
import { prisma } from './prisma';

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  auth: config.SMTP_USER
    ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
    : undefined,
  secure: config.SMTP_PORT === 465,
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  firmId?: string;
  userId?: string;
  emailType: string;
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
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

export function breachDetectedEmail(params: {
  firmName: string;
  breachType: string;
  severity: string;
  description: string;
  breachId: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Safeguarding Breach Detected</h2>
      <p><strong>Firm:</strong> ${params.firmName}</p>
      <p><strong>Breach Type:</strong> ${params.breachType.replace(/_/g, ' ')}</p>
      <p><strong>Severity:</strong> <span style="color: ${params.severity === 'CRITICAL' ? '#dc2626' : params.severity === 'HIGH' ? '#ea580c' : '#d97706'};">${params.severity}</span></p>
      <p><strong>Description:</strong> ${params.description}</p>
      <p><strong>Breach ID:</strong> <code>${params.breachId}</code></p>
      <p>Please log in to Safeheld to acknowledge and remediate this breach.</p>
      <a href="${config.FRONTEND_URL}/breach/${params.breachId}"
         style="background: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">
        View Breach
      </a>
      <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">This is an automated alert from Safeheld.</p>
    </div>
  `;
}

export function letterExpiryEmail(params: {
  firmName: string;
  bankName: string;
  accountId: string;
  expiryDate: string;
  daysUntilExpiry: number;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #d97706;">Acknowledgement Letter Expiring Soon</h2>
      <p><strong>Firm:</strong> ${params.firmName}</p>
      <p><strong>Bank:</strong> ${params.bankName}</p>
      <p><strong>Account:</strong> ${params.accountId}</p>
      <p><strong>Expiry Date:</strong> ${params.expiryDate}</p>
      <p><strong>Days Until Expiry:</strong> ${params.daysUntilExpiry} days</p>
      <p>Please arrange renewal of this acknowledgement letter before it expires.</p>
      <a href="${config.FRONTEND_URL}/governance/letters"
         style="background: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">
        View Letters
      </a>
    </div>
  `;
}

export function ddOverdueEmail(params: {
  firmName: string;
  bankName: string;
  nextReviewDue: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Due Diligence Review Overdue</h2>
      <p><strong>Firm:</strong> ${params.firmName}</p>
      <p><strong>Bank:</strong> ${params.bankName}</p>
      <p><strong>Review Due:</strong> ${params.nextReviewDue}</p>
      <p>The due diligence review for this bank is overdue. Please complete it as soon as possible.</p>
      <a href="${config.FRONTEND_URL}/governance/due-diligence"
         style="background: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">
        View Due Diligence
      </a>
    </div>
  `;
}
