import PDFDocument from 'pdfkit';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';

// ─── Brand constants (match utils/pdf.ts) ───────────────────────────────────

const NAVY = '#0C1445';
const ACCENT = '#3D3DFF';
const WHITE = '#FFFFFF';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Letter Template Generation (CASS 15 Annex 1) ───────────────────────────

export async function generateLetterTemplate(
  firmId: string,
  safeguardingAccountId: string,
): Promise<Buffer> {
  const [firm, account] = await Promise.all([
    prisma.firm.findUnique({ where: { id: firmId }, select: { name: true, fcaFrn: true } }),
    prisma.safeguardingAccount.findFirst({
      where: { id: safeguardingAccountId, firmId },
      select: { bankName: true, accountNumberMasked: true, sortCode: true, currency: true },
    }),
  ]);

  if (!firm) throw new NotFoundError('Firm');
  if (!account) throw new NotFoundError('Safeguarding account');

  const today = new Date();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header bar
    doc.rect(0, 0, 595.28, 70).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(18).fillColor(WHITE)
      .text('Safeheld', PAGE_MARGIN, 22);
    doc.font('Helvetica').fontSize(9).fillColor('#94A3B8')
      .text('Acknowledgement Letter Template', PAGE_MARGIN, 45);
    doc.rect(0, 70, 595.28, 3).fill(ACCENT);

    doc.y = 90;

    // Title
    doc.font('Helvetica-Bold').fontSize(16).fillColor(TEXT_PRIMARY)
      .text('CASS 15 Annex 1 — Acknowledgement Letter', PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
      .text(`Generated ${fmtDate(today)}`, PAGE_MARGIN, doc.y);
    doc.moveDown(1.5);

    // Addressee
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT_PRIMARY)
      .text(`To: ${account.bankName}`, PAGE_MARGIN, doc.y);
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(10).fillColor(TEXT_PRIMARY)
      .text(`Date: ${fmtDate(today)}`, PAGE_MARGIN, doc.y);
    doc.moveDown(1);

    // Firm details
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_PRIMARY)
      .text('Firm Details', PAGE_MARGIN, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_PRIMARY);
    doc.text(`Firm Name: ${firm.name}`, PAGE_MARGIN, doc.y);
    if (firm.fcaFrn) {
      doc.text(`FCA Firm Reference Number (FRN): ${firm.fcaFrn}`, PAGE_MARGIN, doc.y);
    }
    doc.moveDown(0.5);

    // Account details
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_PRIMARY)
      .text('Account Details', PAGE_MARGIN, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor(TEXT_PRIMARY);
    doc.text(`Bank: ${account.bankName}`, PAGE_MARGIN, doc.y);
    doc.text(`Account Number: ${account.accountNumberMasked}`, PAGE_MARGIN, doc.y);
    if (account.sortCode) {
      doc.text(`Sort Code: ${account.sortCode}`, PAGE_MARGIN, doc.y);
    }
    doc.text(`Currency: ${account.currency}`, PAGE_MARGIN, doc.y);
    doc.moveDown(1);

    // Template text
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
      .text('Acknowledgement', PAGE_MARGIN, doc.y);
    doc.moveDown(0.5);

    const templateText = [
      `We, ${account.bankName}, hereby acknowledge that:`,
      '',
      `1. The funds held in account ${account.accountNumberMasked} (the "Account") are held by ${firm.name}${firm.fcaFrn ? ` (FRN: ${firm.fcaFrn})` : ''} for the purposes of safeguarding relevant funds in accordance with the FCA's Client Assets sourcebook (CASS), specifically CASS 15.`,
      '',
      `2. We acknowledge that the funds held in the Account are client funds and are held for the purpose of safeguarding those funds.`,
      '',
      `3. We will not exercise any right of set-off, combination, lien or counterclaim against monies held in the Account in respect of any sum owed to us by ${firm.name} or any other person, except in respect of charges and fees properly due to us relating to the administration of the Account.`,
      '',
      `4. We will not combine the Account with any other account and will not exercise any right to consolidate the Account with any other account held by ${firm.name} or any other person with us.`,
      '',
      `5. We will hold the funds in the Account in such a way that the funds are clearly distinguishable from any funds held by ${firm.name} for its own account with us.`,
      '',
      `6. The title of the Account sufficiently distinguishes the Account from any account containing money belonging to ${firm.name}, and is in the form requested by ${firm.name}.`,
      '',
      `7. We have no interest in or claim over the Account or any monies standing to the credit of the Account other than charges and fees properly due to us for the administration of the Account.`,
    ];

    doc.font('Helvetica').fontSize(10).fillColor(TEXT_PRIMARY);
    for (const line of templateText) {
      if (line === '') {
        doc.moveDown(0.3);
      } else {
        doc.text(line, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
        doc.moveDown(0.2);
      }
    }

    doc.moveDown(1.5);

    // Signature block
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_PRIMARY)
      .text('Signed on behalf of the Bank:', PAGE_MARGIN, doc.y);
    doc.moveDown(1.5);

    doc.font('Helvetica').fontSize(10).fillColor(TEXT_SECONDARY);
    doc.text('Name: ___________________________________', PAGE_MARGIN, doc.y);
    doc.moveDown(0.5);
    doc.text('Title: ___________________________________', PAGE_MARGIN, doc.y);
    doc.moveDown(0.5);
    doc.text('Date: ___________________________________', PAGE_MARGIN, doc.y);
    doc.moveDown(0.5);
    doc.text('Signature: _______________________________', PAGE_MARGIN, doc.y);

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor(TEXT_SECONDARY)
        .text(
          `Safeheld  |  Confidential  |  Page ${i + 1} of ${range.count}`,
          PAGE_MARGIN, 795,
          { width: CONTENT_WIDTH, align: 'center' },
        );
    }

    doc.end();
  });
}

// ─── Letter Tracking ────────────────────────────────────────────────────────

export interface LetterTrackingItem {
  accountId: string;
  bankName: string;
  accountNumberMasked: string;
  currency: string;
  letterStatus: string;
  currentLetter: {
    id: string;
    version: number;
    effectiveDate: Date;
    expiryDate: Date | null;
    annualReviewDue: Date;
    status: string;
    uploadDate: Date;
  } | null;
  needsRenewal: boolean;
}

export interface LetterTrackingSummary {
  totalAccounts: number;
  lettersReceived: number;
  lettersPending: number;
  lettersMissing: number;
  lettersExpired: number;
  accounts: LetterTrackingItem[];
}

export async function getLetterTracking(firmId: string): Promise<LetterTrackingSummary> {
  const accounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    include: {
      acknowledgementLetters: {
        where: { status: 'CURRENT' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
    orderBy: { bankName: 'asc' },
  });

  const today = new Date();
  const in60Days = new Date(today.getTime() + 60 * 86400000);

  let lettersReceived = 0;
  let lettersPending = 0;
  let lettersMissing = 0;
  let lettersExpired = 0;

  const items: LetterTrackingItem[] = accounts.map((acct) => {
    const currentLetter = acct.acknowledgementLetters[0] ?? null;
    const needsRenewal = currentLetter
      ? (currentLetter.expiryDate !== null && currentLetter.expiryDate < in60Days) ||
        currentLetter.annualReviewDue < in60Days
      : false;

    // Tally statuses
    if (acct.letterStatus === 'CONFIRMED') lettersReceived++;
    else if (acct.letterStatus === 'PENDING') lettersPending++;
    else if (acct.letterStatus === 'MISSING') lettersMissing++;
    else if (acct.letterStatus === 'EXPIRED') lettersExpired++;

    return {
      accountId: acct.id,
      bankName: acct.bankName,
      accountNumberMasked: acct.accountNumberMasked,
      currency: acct.currency,
      letterStatus: acct.letterStatus,
      currentLetter: currentLetter
        ? {
            id: currentLetter.id,
            version: currentLetter.version,
            effectiveDate: currentLetter.effectiveDate,
            expiryDate: currentLetter.expiryDate,
            annualReviewDue: currentLetter.annualReviewDue,
            status: currentLetter.status,
            uploadDate: currentLetter.uploadDate,
          }
        : null,
      needsRenewal,
    };
  });

  return {
    totalAccounts: accounts.length,
    lettersReceived,
    lettersPending,
    lettersMissing,
    lettersExpired,
    accounts: items,
  };
}

// ─── Upload Signed Letter ───────────────────────────────────────────────────

export interface UploadSignedLetterParams {
  firmId: string;
  accountId: string;
  fileBuffer: Buffer;
  fileMimetype: string;
  effectiveDate: string;
  expiryDate?: string;
  uploadedBy: string;
}

export async function uploadSignedLetter(params: UploadSignedLetterParams) {
  const { default: crypto } = await import('crypto');
  const { fileStorage } = await import('../../utils/fileStorage');

  const account = await prisma.safeguardingAccount.findFirst({
    where: { id: params.accountId, firmId: params.firmId },
  });
  if (!account) throw new NotFoundError('Safeguarding account');

  // Supersede previous current letters
  await prisma.acknowledgementLetter.updateMany({
    where: { firmId: params.firmId, safeguardingAccountId: params.accountId, status: 'CURRENT' },
    data: { status: 'SUPERSEDED' },
  });

  const lastLetter = await prisma.acknowledgementLetter.findFirst({
    where: { firmId: params.firmId, safeguardingAccountId: params.accountId },
    orderBy: { version: 'desc' },
  });
  const version = (lastLetter?.version || 0) + 1;

  const fileHash = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');
  const storagePath = await fileStorage.store(
    `firms/${params.firmId}/letters/${params.accountId}_v${version}_${Date.now()}.pdf`,
    params.fileBuffer,
    params.fileMimetype,
  );

  const effectiveDate = new Date(params.effectiveDate);
  const annualReviewDue = new Date(effectiveDate);
  annualReviewDue.setFullYear(annualReviewDue.getFullYear() + 1);

  const letter = await prisma.acknowledgementLetter.create({
    data: {
      firmId: params.firmId,
      safeguardingAccountId: params.accountId,
      version,
      fileStoragePath: storagePath,
      fileHash,
      uploadDate: new Date(),
      effectiveDate,
      expiryDate: params.expiryDate ? new Date(params.expiryDate) : null,
      annualReviewDue,
      status: 'CURRENT',
      uploadedBy: params.uploadedBy,
    },
  });

  // Update account letter status
  await prisma.safeguardingAccount.update({
    where: { id: params.accountId },
    data: { letterStatus: 'CONFIRMED' },
  });

  logger.info({ firmId: params.firmId, accountId: params.accountId, version }, 'Signed letter uploaded');

  return letter;
}

// ─── Letter Alerts ──────────────────────────────────────────────────────────

export interface LetterAlert {
  type: 'NOT_RECEIVED' | 'NEEDS_REVIEW' | 'APPROACHING_EXPIRY' | 'EXPIRED';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  accountId: string;
  bankName: string;
  accountNumberMasked: string;
  message: string;
  dueDate?: Date;
}

export async function checkLetterAlerts(firmId: string): Promise<LetterAlert[]> {
  const accounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    include: {
      acknowledgementLetters: {
        where: { status: 'CURRENT' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  const alerts: LetterAlert[] = [];
  const today = new Date();
  const in60Days = new Date(today.getTime() + 60 * 86400000);
  // Pre-May 2026 cutoff for old format review
  const oldFormatCutoff = new Date('2026-05-01');

  for (const acct of accounts) {
    const letter = acct.acknowledgementLetters[0];

    // No letter received
    if (!letter) {
      alerts.push({
        type: 'NOT_RECEIVED',
        severity: 'HIGH',
        accountId: acct.id,
        bankName: acct.bankName,
        accountNumberMasked: acct.accountNumberMasked,
        message: `No acknowledgement letter on file for account ${acct.accountNumberMasked} at ${acct.bankName}.`,
      });
      continue;
    }

    // Letters in old format (effective before May 2026) needing review
    if (letter.effectiveDate < oldFormatCutoff) {
      alerts.push({
        type: 'NEEDS_REVIEW',
        severity: 'MEDIUM',
        accountId: acct.id,
        bankName: acct.bankName,
        accountNumberMasked: acct.accountNumberMasked,
        message: `Letter for account ${acct.accountNumberMasked} at ${acct.bankName} was issued before May 2026 and may need updating to the current format.`,
        dueDate: letter.annualReviewDue,
      });
    }

    // Approaching expiry
    if (letter.expiryDate && letter.expiryDate > today && letter.expiryDate <= in60Days) {
      alerts.push({
        type: 'APPROACHING_EXPIRY',
        severity: 'MEDIUM',
        accountId: acct.id,
        bankName: acct.bankName,
        accountNumberMasked: acct.accountNumberMasked,
        message: `Letter for account ${acct.accountNumberMasked} at ${acct.bankName} expires on ${letter.expiryDate.toISOString().split('T')[0]}.`,
        dueDate: letter.expiryDate,
      });
    }

    // Already expired
    if (letter.expiryDate && letter.expiryDate < today) {
      alerts.push({
        type: 'EXPIRED',
        severity: 'HIGH',
        accountId: acct.id,
        bankName: acct.bankName,
        accountNumberMasked: acct.accountNumberMasked,
        message: `Letter for account ${acct.accountNumberMasked} at ${acct.bankName} has expired.`,
        dueDate: letter.expiryDate,
      });
    }
  }

  // Sort: HIGH first, then MEDIUM, then LOW
  const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99));

  return alerts;
}
