import Bull from 'bull';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { prisma } from '../../utils/prisma';
import { parseCsv, parseAmount, parseDate } from './csvParser';
import { validateSchema, validateRow, normaliseDirection } from './validator';
import { fileStorage } from '../../utils/fileStorage';

export const uploadQueue = new Bull('upload-validation', config.REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 120000 },
    removeOnComplete: 100,
    removeOnFail: false,
  },
});

uploadQueue.process('validate-upload', async (job) => {
  const { uploadId, firmId, columnMappings } = job.data as {
    uploadId: string;
    firmId: string;
    columnMappings: Record<string, string>;
  };

  logger.info({ uploadId, firmId }, 'Starting upload validation');

  const uploadRecord = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!uploadRecord || !uploadRecord.storagePath) {
    throw new Error(`Upload ${uploadId} not found or has no storage path`);
  }

  try {
    // Stage 1: Get file from storage
    const fileBuffer = await fileStorage.get(uploadRecord.storagePath);
    const parsed = await parseCsv(fileBuffer);
    
    // Stage 2: Schema validation
    const schemaErrors = validateSchema(parsed.headers, uploadRecord.inputType, columnMappings);
    if (schemaErrors.some(e => e.level === 'CRITICAL')) {
      await prisma.upload.update({
        where: { id: uploadId },
        data: {
          status: 'REJECTED',
          rowCount: parsed.rowCount,
          rowsAccepted: 0,
          rowsRejected: parsed.rowCount,
          errorSummary: { criticalErrors: schemaErrors, rowErrors: [] } as unknown as Prisma.InputJsonValue,
        },
      });
      return { status: 'REJECTED', schemaErrors };
    }

    // Stage 3 & 4: Row validation and insertion
    let rowsAccepted = 0;
    let rowsRejected = 0;
    const rowErrors: object[] = [];
    const batchSize = 1000;

    const processedRows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const rowErrors_i = validateRow(row, i + 2, uploadRecord.inputType, columnMappings);
      const hasError = rowErrors_i.some(e => e.level === 'ERROR' || e.level === 'CRITICAL');
      
      if (hasError) {
        rowsRejected++;
        rowErrors.push({ row: i + 2, errors: rowErrors_i });
        continue;
      }

      // Map row to system fields
      const mapped: Record<string, string> = {};
      for (const [csvCol, sysField] of Object.entries(columnMappings)) {
        const normalKey = csvCol.toLowerCase().replace(/\s+/g, '_');
        mapped[sysField] = row[normalKey] || row[csvCol] || '';
      }

      processedRows.push({ ...mapped, _rowIndex: i + 2, _warnings: rowErrors_i.filter(e => e.level === 'WARNING') });
    }

    // Insert in batches
    for (let i = 0; i < processedRows.length; i += batchSize) {
      const batch = processedRows.slice(i, i + batchSize);
      await insertBatch(batch, uploadRecord.inputType, firmId, uploadId, uploadRecord, columnMappings);
      rowsAccepted += batch.length;
      await job.progress(Math.floor((i / processedRows.length) * 100));
    }

    const finalStatus = rowsRejected === 0 ? 'ACCEPTED' : rowsAccepted > 0 ? 'PARTIAL' : 'REJECTED';
    
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: finalStatus,
        rowCount: parsed.rowCount,
        rowsAccepted,
        rowsRejected,
        errorSummary: (rowErrors.length > 0 ? { rowErrors: rowErrors.slice(0, 500) } : null) as unknown as Prisma.InputJsonValue,
      },
    });

    logger.info({ uploadId, rowsAccepted, rowsRejected, finalStatus }, 'Upload validation complete');
    return { status: finalStatus, rowsAccepted, rowsRejected };

  } catch (err) {
    logger.error({ err, uploadId }, 'Upload validation failed');
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'REJECTED',
        errorSummary: { error: (err as Error).message } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => {});
    throw err;
  }
});

async function insertBatch(
  rows: Array<Record<string, unknown>>,
  inputType: string,
  firmId: string,
  uploadId: string,
  _uploadRecord: object,
  _columnMappings: Record<string, string>
): Promise<void> {
  if (inputType === 'CLIENT_BALANCES') {
    for (const row of rows) {
      const clientId = String(row.client_id || '');
      const currency = String(row.currency || '').toUpperCase();
      const balance = parseAmount(String(row.balance || ''));
      const balanceDate = parseDate(String(row.balance_date || ''));
      if (!clientId || !currency || balance === null || !balanceDate) continue;

      // Upsert client account
      const clientAccount = await prisma.clientAccount.upsert({
        where: { firmId_clientId: { firmId, clientId } },
        update: { updatedAt: new Date() },
        create: { firmId, clientId },
      });

      // Upsert balance (skip if exists)
      await prisma.clientBalance.upsert({
        where: { firmId_clientAccountId_currency_balanceDate: { firmId, clientAccountId: clientAccount.id, currency, balanceDate } },
        update: {},
        create: {
          firmId,
          clientAccountId: clientAccount.id,
          currency,
          balance,
          balanceDate,
          uploadId,
        },
      });
    }
  } else if (inputType === 'SAFEGUARDING_LEDGER_BALANCES') {
    for (const row of rows) {
      const externalAccountId = String(row.external_account_id || '');
      const currency = String(row.currency || '').toUpperCase();
      const balance = parseAmount(String(row.balance || ''));
      const balanceDate = parseDate(String(row.balance_date || ''));
      if (!externalAccountId || !currency || balance === null || !balanceDate) continue;

      const account = await prisma.safeguardingAccount.findFirst({ where: { firmId, externalAccountId } });
      if (!account) continue; // Skip unknown accounts — they should be registered first

      await prisma.safeguardingLedgerBalance.create({
        data: {
          firmId,
          safeguardingAccountId: account.id,
          currency,
          balance,
          balanceDate,
          uploadId,
          prudentBufferAmount: row.prudent_buffer_amount ? parseAmount(String(row.prudent_buffer_amount)) : null,
        },
      }).catch(() => {}); // Skip duplicates
    }
  } else if (inputType === 'BANK_BALANCES') {
    for (const row of rows) {
      const externalAccountId = String(row.external_account_id || '');
      const currency = String(row.currency || '').toUpperCase();
      const closingBalance = parseAmount(String(row.closing_balance || ''));
      const balanceDate = parseDate(String(row.balance_date || ''));
      if (!externalAccountId || !currency || closingBalance === null || !balanceDate) continue;

      const account = await prisma.safeguardingAccount.findFirst({ where: { firmId, externalAccountId } });
      if (!account) continue;

      await prisma.bankBalance.create({
        data: {
          firmId,
          safeguardingAccountId: account.id,
          currency,
          closingBalance,
          balanceDate,
          uploadId,
        },
      }).catch(() => {});
    }
  } else if (inputType === 'BANK_TRANSACTIONS') {
    for (const row of rows) {
      const externalAccountId = String(row.external_account_id || '');
      const amount = parseAmount(String(row.amount || ''));
      const currency = String(row.currency || '').toUpperCase();
      const direction = normaliseDirection(String(row.direction || ''));
      const transactionDate = parseDate(String(row.transaction_date || ''));
      const externalTransactionId = String(row.external_transaction_id || '');
      if (!externalAccountId || amount === null || !currency || !direction || !transactionDate || !externalTransactionId) continue;

      const account = await prisma.safeguardingAccount.findFirst({ where: { firmId, externalAccountId } });
      if (!account) continue;

      await prisma.bankTransaction.create({
        data: {
          firmId,
          safeguardingAccountId: account.id,
          externalTransactionId,
          amount,
          currency,
          direction,
          transactionDate,
          reference: String(row.reference || ''),
          counterparty: String(row.counterparty || ''),
          uploadId,
        },
      }).catch(() => {});
    }
  } else if (inputType === 'CLIENT_TRANSACTIONS') {
    for (const row of rows) {
      const clientId = String(row.client_id || '');
      const amount = parseAmount(String(row.amount || ''));
      const currency = String(row.currency || '').toUpperCase();
      const direction = normaliseDirection(String(row.direction || ''));
      const transactionDate = parseDate(String(row.transaction_date || ''));
      const externalTransactionId = String(row.external_transaction_id || '');
      if (!clientId || amount === null || !currency || !direction || !transactionDate || !externalTransactionId) continue;

      const clientAccount = await prisma.clientAccount.upsert({
        where: { firmId_clientId: { firmId, clientId } },
        update: {},
        create: { firmId, clientId },
      });

      await prisma.clientTransaction.create({
        data: {
          firmId,
          clientAccountId: clientAccount.id,
          externalTransactionId,
          amount,
          currency,
          direction,
          transactionDate,
          uploadId,
        },
      }).catch(() => {});
    }
  }
}

uploadQueue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, data: job.data, err }, 'Upload job failed');
});
