import { ParsedRow } from './csvParser';
import { parseAmount, parseDate } from './csvParser';

export type ErrorLevel = 'CRITICAL' | 'ERROR' | 'WARNING';

export interface ValidationError {
  level: ErrorLevel;
  row?: number;
  field?: string;
  value?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  CLIENT_BALANCES: ['client_id', 'currency', 'balance', 'balance_date'],
  CLIENT_TRANSACTIONS: ['client_id', 'external_transaction_id', 'amount', 'currency', 'direction', 'transaction_date'],
  SAFEGUARDING_LEDGER_BALANCES: ['external_account_id', 'currency', 'balance', 'balance_date'],
  BANK_BALANCES: ['external_account_id', 'currency', 'closing_balance', 'balance_date'],
  BANK_TRANSACTIONS: ['external_account_id', 'external_transaction_id', 'amount', 'currency', 'direction', 'transaction_date'],
  ACCOUNT_REGISTER: ['external_account_id', 'bank_name', 'currency', 'designation', 'status', 'opened_date'],
};

export function validateSchema(
  headers: string[],
  inputType: string,
  columnMappings: Record<string, string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const required = REQUIRED_FIELDS[inputType] || [];
  const mappedSystemFields = new Set(Object.values(columnMappings));

  for (const field of required) {
    if (!mappedSystemFields.has(field)) {
      errors.push({
        level: 'CRITICAL',
        field,
        message: `Required field '${field}' is not mapped to any CSV column`,
      });
    }
  }
  return errors;
}

export function validateRow(
  row: ParsedRow,
  rowIndex: number,
  inputType: string,
  columnMappings: Record<string, string>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const systemFieldValues: Record<string, string> = {};
  
  // Map CSV column values to system field names
  for (const [csvCol, sysField] of Object.entries(columnMappings)) {
    systemFieldValues[sysField] = row[csvCol.toLowerCase().replace(/\s+/g, '_')] || row[csvCol] || '';
  }

  // Validate amounts
  for (const amountField of ['balance', 'closing_balance', 'amount', 'prudent_buffer_amount']) {
    if (systemFieldValues[amountField] !== undefined) {
      const val = parseAmount(systemFieldValues[amountField]);
      if (val === null && systemFieldValues[amountField].trim() !== '') {
        errors.push({ level: 'ERROR', row: rowIndex, field: amountField, value: systemFieldValues[amountField], message: `Invalid amount format` });
      }
      if (amountField === 'closing_balance' && val !== null && val < 0) {
        errors.push({ level: 'ERROR', row: rowIndex, field: amountField, value: systemFieldValues[amountField], message: 'Bank balance cannot be negative' });
      }
    }
  }

  // Validate dates
  for (const dateField of ['balance_date', 'transaction_date', 'value_date', 'opened_date']) {
    if (systemFieldValues[dateField] !== undefined && systemFieldValues[dateField].trim() !== '') {
      const d = parseDate(systemFieldValues[dateField]);
      if (!d) {
        errors.push({ level: 'ERROR', row: rowIndex, field: dateField, value: systemFieldValues[dateField], message: 'Invalid date format' });
      } else if (d > new Date()) {
        errors.push({ level: 'WARNING', row: rowIndex, field: dateField, value: systemFieldValues[dateField], message: 'Date is in the future' });
      }
    }
  }

  // Validate direction
  if (systemFieldValues.direction !== undefined && systemFieldValues.direction.trim() !== '') {
    const d = systemFieldValues.direction.toUpperCase().trim();
    if (!['CREDIT', 'CR', 'C', 'DEBIT', 'DR', 'D'].includes(d)) {
      errors.push({ level: 'ERROR', row: rowIndex, field: 'direction', value: systemFieldValues.direction, message: "Direction must be CREDIT/CR or DEBIT/DR" });
    }
  }

  // Validate currency
  if (systemFieldValues.currency !== undefined) {
    const c = systemFieldValues.currency.trim().toUpperCase();
    if (c.length !== 3 || !/^[A-Z]{3}$/.test(c)) {
      errors.push({ level: 'ERROR', row: rowIndex, field: 'currency', value: systemFieldValues.currency, message: 'Currency must be a 3-letter ISO 4217 code' });
    }
  }

  return errors;
}

export function normaliseDirection(val: string): 'CREDIT' | 'DEBIT' | null {
  const v = val.toUpperCase().trim();
  if (['CREDIT', 'CR', 'C'].includes(v)) return 'CREDIT';
  if (['DEBIT', 'DR', 'D'].includes(v)) return 'DEBIT';
  return null;
}
