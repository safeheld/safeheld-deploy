import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { runReconciliation } from '../modules/reconciliation/service';
import { detectGovernanceBreaches } from '../modules/breach/service';
import { generateSafeguardingReturn } from '../modules/reporting/service';
import { checkPegStatus } from '../modules/stablecoin/peg-service';
import { escalateOverdueActions } from '../services/rules-engine';
import { runFullMonitor } from '../services/reg-monitor';
import { runFullIngestion } from '../services/deep-ingestion';
import { runMonthlyBilling, checkTrials, checkFailedPayments } from '../services/billing';

const DAY_MAP: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/**
 * Daily reconciliation — runs at 06:00 UTC every day.
 * For each ACTIVE firm, checks if today matches a reconciliationDay.
 * If so, runs reconciliation with yesterday's date (T-1 pattern).
 */
cron.schedule('0 6 * * *', async () => {
  logger.info('Scheduled reconciliation job started');

  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun ... 6=Sat
    const dayNames = Object.entries(DAY_MAP)
      .filter(([, num]) => num === dayOfWeek)
      .map(([name]) => name);

    const firms = await prisma.firm.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, reconciliationDays: true },
    });

    let runCount = 0;

    for (const firm of firms) {
      const firmDays = (firm.reconciliationDays as string[]) ?? ['MON', 'TUE', 'WED', 'THU', 'FRI'];
      const shouldRun = dayNames.some(d => firmDays.includes(d));

      if (!shouldRun) continue;

      try {
        // Reconcile for yesterday (T-1)
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        await runReconciliation({
          firmId: firm.id,
          reconciliationDate: yesterday,
          trigger: 'SCHEDULED',
        });

        runCount++;
        logger.info({ firmId: firm.id, firmName: firm.name }, 'Scheduled reconciliation completed');
      } catch (err) {
        logger.error({ err, firmId: firm.id }, 'Scheduled reconciliation failed for firm');
      }
    }

    logger.info({ runCount, totalFirms: firms.length }, 'Scheduled reconciliation job finished');
  } catch (err) {
    logger.error({ err }, 'Scheduled reconciliation job failed');
  }
});

/**
 * Governance checks — runs at 07:00 UTC every weekday.
 * Checks for expiring letters and overdue due diligence.
 */
cron.schedule('0 7 * * 1-5', async () => {
  logger.info('Scheduled governance check started');

  try {
    const firms = await prisma.firm.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const firm of firms) {
      try {
        await detectGovernanceBreaches(firm.id);
      } catch (err) {
        logger.error({ err, firmId: firm.id }, 'Governance breach check failed');
      }
    }

    logger.info({ totalFirms: firms.length }, 'Scheduled governance check finished');
  } catch (err) {
    logger.error({ err }, 'Scheduled governance check job failed');
  }
});

/**
 * Monthly report generation — runs at 08:00 UTC on the 1st of each month.
 * Generates safeguarding return for the previous month for each active firm.
 */
cron.schedule('0 8 1 * *', async () => {
  logger.info('Scheduled monthly report generation started');

  try {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // first day of prev month

    const firms = await prisma.firm.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    for (const firm of firms) {
      try {
        await generateSafeguardingReturn(firm.id, periodStart, periodEnd, 'SYSTEM');
        logger.info({ firmId: firm.id, firmName: firm.name }, 'Monthly report generated');
      } catch (err) {
        logger.error({ err, firmId: firm.id }, 'Monthly report generation failed');
      }
    }

    logger.info({ totalFirms: firms.length }, 'Monthly report generation finished');
  } catch (err) {
    logger.error({ err }, 'Monthly report generation job failed');
  }
});

/**
 * Stablecoin peg monitoring — runs every 4 hours.
 * Fetches live prices and checks peg status for all active firms with stablecoin tokens.
 */
cron.schedule('0 */4 * * *', async () => {
  logger.info('Scheduled stablecoin peg check started');

  try {
    const firms = await prisma.firm.findMany({
      where: {
        status: 'ACTIVE',
        stablecoinTokens: { some: {} },
      },
      select: { id: true, name: true },
    });

    for (const firm of firms) {
      try {
        const result = await checkPegStatus(firm.id);
        logger.info({ firmId: firm.id, firmName: firm.name, checked: result.checked }, 'Peg check completed');
      } catch (err) {
        logger.error({ err, firmId: firm.id }, 'Peg check failed for firm');
      }
    }

    logger.info({ totalFirms: firms.length }, 'Scheduled stablecoin peg check finished');
  } catch (err) {
    logger.error({ err }, 'Scheduled stablecoin peg check job failed');
  }
});

/**
 * Remediation escalation — runs at 08:00 UTC every weekday.
 * Checks for overdue remediation actions and escalates severity.
 */
cron.schedule('0 8 * * 1-5', async () => {
  logger.info('Scheduled remediation escalation check started');

  try {
    const escalated = await escalateOverdueActions();
    logger.info({ escalated }, 'Remediation escalation check finished');
  } catch (err) {
    logger.error({ err }, 'Remediation escalation check failed');
  }
});

/**
 * Regulatory monitoring — runs at 06:00 UTC every day.
 * Checks all active regulatory sources for content changes.
 */
cron.schedule('0 6 * * *', async () => {
  logger.info('Scheduled regulatory monitoring run started');

  try {
    const result = await runFullMonitor();
    logger.info(result, 'Scheduled regulatory monitoring run finished');
  } catch (err) {
    logger.error({ err }, 'Scheduled regulatory monitoring run failed');
  }
});

/**
 * Quarterly deep ingestion — runs on the 1st of Jan, Apr, Jul, Oct at 02:00 UTC.
 * Validates all rules against source legislation.
 */
cron.schedule('0 2 1 1,4,7,10 *', async () => {
  logger.info('Scheduled quarterly deep ingestion started');
  try {
    const result = await runFullIngestion();
    logger.info(result.summary, 'Scheduled quarterly deep ingestion finished');
  } catch (err) {
    logger.error({ err }, 'Scheduled quarterly deep ingestion failed');
  }
});

/**
 * Monthly billing — runs at 07:00 UTC on the 1st of each month.
 * Generates invoices for all active firms based on month-end safeguarded balance.
 */
cron.schedule('0 7 1 * *', async () => {
  logger.info('Monthly billing job started');
  try {
    const result = await runMonthlyBilling();
    logger.info(result, 'Monthly billing job finished');
  } catch (err) {
    logger.error({ err }, 'Monthly billing job failed');
  }
});

/**
 * Trial management — runs at 09:00 UTC daily.
 * Warns firms 7 days before trial expiry, activates expired trials.
 */
cron.schedule('0 9 * * *', async () => {
  logger.info('Trial management check started');
  try {
    const result = await checkTrials();
    logger.info(result, 'Trial management check finished');
  } catch (err) {
    logger.error({ err }, 'Trial management check failed');
  }
});

/**
 * Failed payment check — runs at 10:00 UTC daily.
 * Suspends firms with failed invoices older than 14 days.
 */
cron.schedule('0 10 * * *', async () => {
  logger.info('Failed payment check started');
  try {
    const suspended = await checkFailedPayments();
    logger.info({ suspended }, 'Failed payment check finished');
  } catch (err) {
    logger.error({ err }, 'Failed payment check failed');
  }
});

logger.info('Scheduler initialized — recon 06:00 daily, governance 07:00 weekdays, reports 08:00 monthly, billing 07:00 1st, trials 09:00 daily, peg 4h, remediation 08:00 weekdays, reg-monitor 06:00 daily, deep-ingestion quarterly');
