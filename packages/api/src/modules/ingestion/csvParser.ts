import { parse } from 'csv-parse';
import { Readable } from 'stream';
import iconv from 'iconv-lite';
// @ts-ignore
import jschardet from 'jschardet';

export interface ParsedRow {
  [key: string]: string;
}

export interface CsvParseOptions {
  delimiter?: string;
  hasHeaderRow?: boolean;
  encoding?: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedRow[];
  rowCount: number;
  delimiter: string;
  encoding: string;
}

function detectEncoding(buffer: Buffer): string {
  const detected = jschardet.detect(buffer);
  const charset = (detected.charset || 'UTF-8').toLowerCase();
  if (charset.includes('utf-8') || charset.includes('ascii')) return 'utf-8';
  if (charset.includes('windows-1252') || charset.includes('cp1252')) return 'windows-1252';
  if (charset.includes('iso-8859') || charset.includes('latin')) return 'latin1';
  return 'utf-8';
}

function detectDelimiter(sample: string): string {
  const delimiters = [',', '\t', ';', '|'];
  let maxCount = 0;
  let detected = ',';
  for (const d of delimiters) {
    const count = (sample.split('\n')[0] || '').split(d).length - 1;
    if (count > maxCount) { maxCount = count; detected = d; }
  }
  return detected;
}

function stripBom(str: string): string {
  return str.startsWith('\uFEFF') ? str.substring(1) : str;
}

export async function parseCsv(
  buffer: Buffer,
  options: CsvParseOptions = {}
): Promise<CsvParseResult> {
  const encoding = options.encoding || detectEncoding(buffer);
  let text = iconv.decode(buffer, encoding);
  text = stripBom(text);
  
  const delimiter = options.delimiter || detectDelimiter(text);
  const hasHeaderRow = options.hasHeaderRow !== false;

  return new Promise((resolve, reject) => {
    const rows: ParsedRow[] = [];
    const parser = parse({
      delimiter,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      columns: hasHeaderRow ? (headers: string[]) => headers.map(h => h.trim().toLowerCase().replace(/\s+/g, '_')) : undefined,
      bom: true,
    });

    let headers: string[] = [];
    let isFirstRow = true;

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        if (isFirstRow && hasHeaderRow) {
          headers = Object.keys(record);
          isFirstRow = false;
        } else if (isFirstRow && !hasHeaderRow) {
          headers = Object.keys(record).map((_, i) => `column_${i}`);
          isFirstRow = false;
        }
        rows.push(record as ParsedRow);
      }
    });

    parser.on('error', (err) => reject(err));
    parser.on('end', () => {
      resolve({ headers, rows, rowCount: rows.length, delimiter, encoding });
    });

    const readable = Readable.from([text]);
    readable.pipe(parser);
  });
}

export function normaliseHeaderName(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-_.]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// Fuzzy mapping of CSV headers to system field names
const FIELD_ALIASES: Record<string, string[]> = {
  client_id: ['client_id', 'clientid', 'client id', 'customer_id', 'customer id', 'customer_ref', 'customerref', 'cust_id'],
  balance: ['balance', 'amount', 'bal', 'closing_balance', 'closing balance', 'closing_bal', 'end_balance', 'end balance'],
  balance_date: ['balance_date', 'balance date', 'date', 'as_at_date', 'as at date', 'as_of_date', 'report_date', 'reporting_date'],
  currency: ['currency', 'ccy', 'ccycode', 'ccy_code', 'currency_code', 'curr'],
  external_account_id: ['external_account_id', 'account_id', 'account id', 'acct', 'account', 'account_number', 'acct_no'],
  closing_balance: ['closing_balance', 'closing balance', 'close_balance', 'balance'],
  external_transaction_id: ['external_transaction_id', 'transaction_id', 'txn_id', 'trans_id', 'transaction id', 'ref', 'reference'],
  amount: ['amount', 'value', 'sum', 'debit', 'credit', 'net_amount'],
  direction: ['direction', 'dr_cr', 'debit_credit', 'type', 'transaction_type'],
  transaction_date: ['transaction_date', 'transaction date', 'txn_date', 'date', 'posting_date', 'value_date'],
  bank_name: ['bank_name', 'bank name', 'bank', 'institution', 'institution_name'],
  designation: ['designation', 'account_type', 'account type', 'type'],
  status: ['status', 'account_status'],
  opened_date: ['opened_date', 'opening_date', 'open_date', 'date_opened'],
};

export function autoMapColumns(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of csvHeaders) {
    const normalised = normaliseHeaderName(header);
    for (const [systemField, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(normalised) || aliases.includes(header.toLowerCase().trim())) {
        if (!Object.values(mapping).includes(systemField)) {
          mapping[header] = systemField;
          break;
        }
      }
    }
  }
  return mapping;
}

export function parseAmount(value: string): number | null {
  if (!value || value.trim() === '') return null;
  // Remove currency symbols, whitespace
  let clean = value.replace(/[£$€\s]/g, '').trim();
  // Handle EU format: 1.234,56
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // Remove thousands separator commas: 1,234.56
    clean = clean.replace(/,/g, '');
  }
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

export function parseDate(value: string): Date | null {
  if (!value || value.trim() === '') return null;
  const v = value.trim();
  
  // ISO 8601: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(v)) {
    const parts = v.split(/[\/\-\.]/);
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    const parts = v.split('/');
    // Ambiguous - try DD/MM first, validate
    const dayFirst = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (!isNaN(dayFirst.getTime()) && parseInt(parts[0]) <= 12) {
      // Could be either — default to DD/MM
      return dayFirst;
    }
    const monthFirst = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    return isNaN(monthFirst.getTime()) ? null : monthFirst;
  }
  // Try native parsing as fallback
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
