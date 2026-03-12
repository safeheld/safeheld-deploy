import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { runReconciliation } from '../modules/reconciliation/service';
import { detectGovernanceBreaches } from '../modules/breach/service';
import { generateSafeguardingReturn } from '../modules/reporting/service';

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

logger.info('Scheduler initialized — reconciliation 06:00 UTC daily, governance 07:00 UTC weekdays, reports 08:00 UTC monthly');
