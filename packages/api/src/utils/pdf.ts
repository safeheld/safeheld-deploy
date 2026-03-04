import PDFDocument from 'pdfkit';

// ─── Brand constants ─────────────────────────────────────────────────────────

const NAVY = '#0C1445';
const ACCENT = '#3D3DFF';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F1F5F9';
const BORDER = '#CBD5E1';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const DANGER = '#DC2626';
const SUCCESS = '#16A34A';
const WARNING = '#D97706';

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width minus margins

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  const num = Number(n ?? 0);
  return num.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function severityColor(severity: string): string {
  if (severity === 'CRITICAL') return DANGER;
  if (severity === 'HIGH') return '#EA580C';
  if (severity === 'MEDIUM') return WARNING;
  return SUCCESS;
}

function statusColor(status: string): string {
  if (status === 'SHORTFALL' || status === 'DETECTED') return DANGER;
  if (status === 'EXCESS' || status === 'ACKNOWLEDGED') return WARNING;
  if (status === 'MET' || status === 'RESOLVED' || status === 'CLOSED') return SUCCESS;
  return TEXT_SECONDARY;
}

// ─── Core PDF helpers ────────────────────────────────────────────────────────

function addHeader(doc: PDFKit.PDFDocument, title: string, firmName: string, subtitle?: string) {
  // Navy header bar
  doc.rect(0, 0, 595.28, 80).fill(NAVY);

  // Logo text
  doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE)
    .text('Safeheld', PAGE_MARGIN, 22, { continued: false });

  // Firm name right-aligned
  doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
    .text(firmName, PAGE_MARGIN, 28, { width: CONTENT_WIDTH, align: 'right' });

  // Accent bar
  doc.rect(0, 80, 595.28, 4).fill(ACCENT);

  // Title
  doc.moveDown(0.5);
  const titleY = 100;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_PRIMARY)
    .text(title, PAGE_MARGIN, titleY);

  // Subtitle / timestamp
  const sub = subtitle || `Generated ${fmtDate(new Date())} at ${new Date().toLocaleTimeString('en-GB')}`;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
    .text(sub, PAGE_MARGIN, titleY + 24);

  doc.y = titleY + 48;
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 28).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
    .text(title, PAGE_MARGIN + 10, doc.y + 8, { width: CONTENT_WIDTH - 20 });
  doc.y += 28;
  doc.moveDown(0.3);
}

function addFieldRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 18);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
    .text(label, PAGE_MARGIN, y, { width: 140 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_PRIMARY)
    .text(value, PAGE_MARGIN + 145, y, { width: CONTENT_WIDTH - 145 });
  doc.y = y + 16;
}

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

function addTable(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  rows: string[][],
  options?: { rowColors?: (string | null)[] }
) {
  const startX = PAGE_MARGIN;
  const rowHeight = 22;
  const headerHeight = 26;

  // Header
  ensureSpace(doc, headerHeight + rowHeight * Math.min(rows.length, 3));
  const headerY = doc.y;
  doc.rect(startX, headerY, CONTENT_WIDTH, headerHeight).fill(LIGHT_GRAY);
  doc.rect(startX, headerY + headerHeight - 0.5, CONTENT_WIDTH, 0.5).fill(BORDER);

  let xPos = startX;
  for (const col of columns) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_SECONDARY)
      .text(col.header.toUpperCase(), xPos + 8, headerY + 9, {
        width: col.width - 16,
        align: col.align || 'left',
      });
    xPos += col.width;
  }

  doc.y = headerY + headerHeight;

  // Rows
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowHeight + 4);
    const rowY = doc.y;
    const row = rows[r];

    // Zebra striping
    if (r % 2 === 1) {
      doc.rect(startX, rowY, CONTENT_WIDTH, rowHeight).fill('#F8FAFC');
    }

    // Bottom border
    doc.rect(startX, rowY + rowHeight - 0.5, CONTENT_WIDTH, 0.5).fill('#E2E8F0');

    xPos = startX;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const cellColor = (c === (options?.rowColors ? columns.length - 1 : -1) && options?.rowColors?.[r])
        ? options.rowColors[r]!
        : TEXT_PRIMARY;

      doc.font('Helvetica').fontSize(8.5).fillColor(cellColor)
        .text(row[c] || '', xPos + 8, rowY + 7, {
          width: col.width - 16,
          align: col.align || 'left',
          lineBreak: false,
        });
      xPos += col.width;
    }

    doc.y = rowY + rowHeight;
  }
}

function addFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor(TEXT_SECONDARY)
      .text(
        `Safeheld  |  Confidential  |  Page ${i + 1} of ${range.count}`,
        PAGE_MARGIN,
        795,
        { width: CONTENT_WIDTH, align: 'center' }
      );
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > 770) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

// ─── Report generators ───────────────────────────────────────────────────────

interface FirmInfo {
  name: string;
  fcaFrn?: string | null;
  regime: string;
  safeguardingMethod: string;
  baseCurrency: string;
}

interface ReconRun {
  reconciliationDate: string | Date;
  reconciliationType: string;
  currency: string;
  totalRequirement: number | string;
  totalResource: number | string;
  variance: number | string;
  variancePercentage: number | string;
  status: string;
  dataCompleteness: string;
}

interface BreachRecord {
  id: string;
  breachType: string;
  severity: string;
  status: string;
  currency?: string | null;
  shortfallAmount?: number | string | null;
  description: string;
  isNotifiable: boolean;
  createdAt: string | Date;
  acknowledgedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
}

export function generateSafeguardingReportPdf(
  firm: FirmInfo,
  reconRuns: ReconRun[],
  breaches: BreachRecord[],
  periodStart: Date,
  periodEnd: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'FCA Safeguarding Report', firm.name,
      `Period: ${fmtDate(periodStart)} — ${fmtDate(periodEnd)}  |  Generated ${fmtDate(new Date())}`);

    // Firm details
    addSectionTitle(doc, 'Firm Details');
    addFieldRow(doc, 'Firm Name', firm.name);
    if (firm.fcaFrn) addFieldRow(doc, 'FCA FRN', firm.fcaFrn);
    addFieldRow(doc, 'Regulatory Regime', firm.regime.replace(/_/g, ' '));
    addFieldRow(doc, 'Safeguarding Method', firm.safeguardingMethod.replace(/_/g, ' '));
    addFieldRow(doc, 'Base Currency', firm.baseCurrency);
    addFieldRow(doc, 'Report Period', `${fmtDate(periodStart)} — ${fmtDate(periodEnd)}`);

    // Reconciliation summary
    addSectionTitle(doc, 'Reconciliation Summary');

    const internalRuns = reconRuns.filter(r => r.reconciliationType === 'INTERNAL');
    const externalRuns = reconRuns.filter(r => r.reconciliationType === 'EXTERNAL');

    if (internalRuns.length > 0) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_PRIMARY)
        .text('Internal Reconciliations', PAGE_MARGIN, doc.y);
      doc.moveDown(0.3);

      addTable(doc, [
        { header: 'Date', width: 85 },
        { header: 'Currency', width: 65 },
        { header: 'Requirement', width: 95, align: 'right' },
        { header: 'Resource', width: 95, align: 'right' },
        { header: 'Variance', width: 80, align: 'right' },
        { header: 'Status', width: 75 },
      ], internalRuns.map(r => [
        fmtDate(r.reconciliationDate),
        String(r.currency),
        fmtNum(r.totalRequirement),
        fmtNum(r.totalResource),
        fmtNum(r.variance),
        String(r.status),
      ]), {
        rowColors: internalRuns.map(r => statusColor(r.status)),
      });
    }

    if (externalRuns.length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_PRIMARY)
        .text('External Reconciliations', PAGE_MARGIN, doc.y);
      doc.moveDown(0.3);

      addTable(doc, [
        { header: 'Date', width: 85 },
        { header: 'Currency', width: 65 },
        { header: 'Ledger Bal.', width: 95, align: 'right' },
        { header: 'Bank Bal.', width: 95, align: 'right' },
        { header: 'Variance', width: 80, align: 'right' },
        { header: 'Status', width: 75 },
      ], externalRuns.map(r => [
        fmtDate(r.reconciliationDate),
        String(r.currency),
        fmtNum(r.totalRequirement),
        fmtNum(r.totalResource),
        fmtNum(r.variance),
        String(r.status),
      ]), {
        rowColors: externalRuns.map(r => statusColor(r.status)),
      });
    }

    if (reconRuns.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No reconciliation runs found for this period.', PAGE_MARGIN, doc.y);
      doc.moveDown(0.5);
    }

    // Breach summary
    addSectionTitle(doc, 'Breach Summary');

    const totalBreaches = breaches.length;
    const openBreaches = breaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status)).length;
    const notifiable = breaches.filter(b => b.isNotifiable).length;
    const critical = breaches.filter(b => b.severity === 'CRITICAL').length;

    addFieldRow(doc, 'Total Breaches', String(totalBreaches));
    addFieldRow(doc, 'Open Breaches', String(openBreaches));
    addFieldRow(doc, 'Notifiable (FCA)', String(notifiable));
    addFieldRow(doc, 'Critical Severity', String(critical));

    if (breaches.length > 0) {
      doc.moveDown(0.3);
      addTable(doc, [
        { header: 'Type', width: 120 },
        { header: 'Severity', width: 65 },
        { header: 'Status', width: 80 },
        { header: 'Currency', width: 55 },
        { header: 'Amount', width: 80, align: 'right' },
        { header: 'Detected', width: 95 },
      ], breaches.map(b => [
        b.breachType.replace(/_/g, ' '),
        b.severity,
        b.status,
        b.currency || '—',
        b.shortfallAmount ? fmtNum(b.shortfallAmount) : '—',
        fmtDate(b.createdAt),
      ]), {
        rowColors: breaches.map(b => severityColor(b.severity)),
      });
    }

    addFooter(doc);
    doc.end();
  });
}

export function generateReconciliationSummaryPdf(
  firm: FirmInfo,
  runs: ReconRun[],
  openBreaks: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Reconciliation Summary', firm.name);

    addSectionTitle(doc, 'Firm Details');
    addFieldRow(doc, 'Firm Name', firm.name);
    if (firm.fcaFrn) addFieldRow(doc, 'FCA FRN', firm.fcaFrn);
    addFieldRow(doc, 'Regulatory Regime', firm.regime.replace(/_/g, ' '));
    addFieldRow(doc, 'Base Currency', firm.baseCurrency);

    // Overview stats
    addSectionTitle(doc, 'Overview');
    const totalRuns = runs.length;
    const shortfalls = runs.filter(r => r.status === 'SHORTFALL').length;
    const met = runs.filter(r => r.status === 'MET').length;
    const excess = runs.filter(r => r.status === 'EXCESS').length;

    addFieldRow(doc, 'Total Runs', String(totalRuns));
    addFieldRow(doc, 'Met', String(met));
    addFieldRow(doc, 'Excess', String(excess));
    addFieldRow(doc, 'Shortfall', String(shortfalls));
    addFieldRow(doc, 'Open Breaks', String(openBreaks));

    // Internal table
    const internal = runs.filter(r => r.reconciliationType === 'INTERNAL');
    if (internal.length > 0) {
      addSectionTitle(doc, 'Internal Reconciliation Runs');
      addTable(doc, [
        { header: 'Date', width: 85 },
        { header: 'Currency', width: 60 },
        { header: 'Requirement', width: 90, align: 'right' },
        { header: 'Resource', width: 90, align: 'right' },
        { header: 'Variance', width: 80, align: 'right' },
        { header: 'Var %', width: 55, align: 'right' },
        { header: 'Status', width: 35 },
      ], internal.map(r => [
        fmtDate(r.reconciliationDate),
        String(r.currency),
        fmtNum(r.totalRequirement),
        fmtNum(r.totalResource),
        fmtNum(r.variance),
        fmtNum(r.variancePercentage) + '%',
        String(r.status),
      ]), {
        rowColors: internal.map(r => statusColor(r.status)),
      });
    }

    // External table
    const external = runs.filter(r => r.reconciliationType === 'EXTERNAL');
    if (external.length > 0) {
      addSectionTitle(doc, 'External Reconciliation Runs');
      addTable(doc, [
        { header: 'Date', width: 85 },
        { header: 'Currency', width: 60 },
        { header: 'Ledger', width: 90, align: 'right' },
        { header: 'Bank', width: 90, align: 'right' },
        { header: 'Variance', width: 80, align: 'right' },
        { header: 'Var %', width: 55, align: 'right' },
        { header: 'Status', width: 35 },
      ], external.map(r => [
        fmtDate(r.reconciliationDate),
        String(r.currency),
        fmtNum(r.totalRequirement),
        fmtNum(r.totalResource),
        fmtNum(r.variance),
        fmtNum(r.variancePercentage) + '%',
        String(r.status),
      ]), {
        rowColors: external.map(r => statusColor(r.status)),
      });
    }

    if (runs.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No reconciliation runs found.', PAGE_MARGIN, doc.y);
    }

    addFooter(doc);
    doc.end();
  });
}

export function generateBreachReportPdf(
  firm: FirmInfo,
  breaches: BreachRecord[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    addHeader(doc, 'Breach Report', firm.name);

    addSectionTitle(doc, 'Firm Details');
    addFieldRow(doc, 'Firm Name', firm.name);
    if (firm.fcaFrn) addFieldRow(doc, 'FCA FRN', firm.fcaFrn);
    addFieldRow(doc, 'Regulatory Regime', firm.regime.replace(/_/g, ' '));

    // Summary stats
    addSectionTitle(doc, 'Summary');
    const open = breaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status));
    const resolved = breaches.filter(b => ['RESOLVED', 'CLOSED'].includes(b.status));
    const critical = breaches.filter(b => b.severity === 'CRITICAL');
    const high = breaches.filter(b => b.severity === 'HIGH');
    const notifiable = breaches.filter(b => b.isNotifiable);

    addFieldRow(doc, 'Total Breaches', String(breaches.length));
    addFieldRow(doc, 'Open', String(open.length));
    addFieldRow(doc, 'Resolved / Closed', String(resolved.length));
    addFieldRow(doc, 'Critical', String(critical.length));
    addFieldRow(doc, 'High', String(high.length));
    addFieldRow(doc, 'FCA Notifiable', String(notifiable.length));

    // Open breaches table
    if (open.length > 0) {
      addSectionTitle(doc, 'Open Breaches');
      addTable(doc, [
        { header: 'Type', width: 110 },
        { header: 'Severity', width: 60 },
        { header: 'Status', width: 80 },
        { header: 'Currency', width: 50 },
        { header: 'Amount', width: 75, align: 'right' },
        { header: 'FCA?', width: 35 },
        { header: 'Detected', width: 85 },
      ], open.map(b => [
        b.breachType.replace(/_/g, ' '),
        b.severity,
        b.status.replace(/_/g, ' '),
        b.currency || '—',
        b.shortfallAmount ? fmtNum(b.shortfallAmount) : '—',
        b.isNotifiable ? 'Yes' : 'No',
        fmtDate(b.createdAt),
      ]), {
        rowColors: open.map(b => severityColor(b.severity)),
      });
    }

    // Breach detail cards
    if (breaches.length > 0) {
      addSectionTitle(doc, 'Breach Details');
      for (const b of breaches) {
        ensureSpace(doc, 80);

        // Mini header with severity color bar
        const cardY = doc.y;
        doc.rect(PAGE_MARGIN, cardY, 4, 55).fill(severityColor(b.severity));
        doc.rect(PAGE_MARGIN + 4, cardY, CONTENT_WIDTH - 4, 55).fill('#FAFBFC');
        doc.rect(PAGE_MARGIN, cardY + 55, CONTENT_WIDTH, 0.5).fill(BORDER);

        doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_PRIMARY)
          .text(`${b.breachType.replace(/_/g, ' ')}  —  ${b.severity}`, PAGE_MARGIN + 14, cardY + 8, { width: CONTENT_WIDTH - 28 });

        doc.font('Helvetica').fontSize(8).fillColor(TEXT_SECONDARY)
          .text(`Status: ${b.status}  |  Detected: ${fmtDate(b.createdAt)}${b.isNotifiable ? '  |  FCA Notifiable' : ''}`,
            PAGE_MARGIN + 14, cardY + 22, { width: CONTENT_WIDTH - 28 });

        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(b.description, PAGE_MARGIN + 14, cardY + 36, { width: CONTENT_WIDTH - 28, lineBreak: true, height: 16 });

        doc.y = cardY + 60;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No breaches recorded.', PAGE_MARGIN, doc.y);
    }

    addFooter(doc);
    doc.end();
  });
}
