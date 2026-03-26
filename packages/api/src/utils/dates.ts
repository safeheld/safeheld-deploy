import { prisma } from './prisma';

// Business days utility
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) {
      added++;
    }
  }
  return result;
}

export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current < end) {
    current.setDate(current.getDate() + 1);
    if (!isWeekend(current)) {
      count++;
    }
  }
  return count;
}

export function dayOfWeekAbbrev(date: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[date.getDay()];
}

export function isReconciliationDay(date: Date, reconDays: string[]): boolean {
  return reconDays.includes(dayOfWeekAbbrev(date));
}

export function toDateOnly(date: Date): Date {
  return new Date(date.toISOString().split('T')[0]);
}

/**
 * Check if a given date is a UK bank holiday by querying the
 * reconciliation_calendar_days table. Returns the holiday name if it is
 * a holiday, or null otherwise.
 *
 * Also checks firm-specific foreign market holidays when firmId is provided.
 */
export async function isUkBankHoliday(
  date: Date,
  firmId?: string,
): Promise<{ isHoliday: boolean; holidayName: string | null }> {
  const dateOnly = toDateOnly(date);

  // Check global UK bank holidays (firmId is null)
  const ukHoliday = await prisma.reconciliationCalendarDay.findFirst({
    where: {
      calendarDate: dateOnly,
      isHoliday: true,
      calendarType: 'UK_BANK_HOLIDAY',
      firmId: null,
    },
    select: { holidayName: true },
  });

  if (ukHoliday) {
    return { isHoliday: true, holidayName: ukHoliday.holidayName };
  }

  // Check firm-specific foreign market holidays
  if (firmId) {
    const firmHoliday = await prisma.reconciliationCalendarDay.findFirst({
      where: {
        calendarDate: dateOnly,
        isHoliday: true,
        firmId,
      },
      select: { holidayName: true },
    });

    if (firmHoliday) {
      return { isHoliday: true, holidayName: firmHoliday.holidayName };
    }
  }

  return { isHoliday: false, holidayName: null };
}

/**
 * Get all holidays in a date range from the calendar table.
 * Includes both global UK bank holidays and firm-specific holidays.
 */
export async function getHolidaysInRange(
  startDate: Date,
  endDate: Date,
  firmId?: string,
): Promise<Array<{ date: Date; holidayName: string | null; calendarType: string }>> {
  const holidays = await prisma.reconciliationCalendarDay.findMany({
    where: {
      calendarDate: { gte: toDateOnly(startDate), lte: toDateOnly(endDate) },
      isHoliday: true,
      OR: [
        { firmId: null },
        ...(firmId ? [{ firmId }] : []),
      ],
    },
    select: { calendarDate: true, holidayName: true, calendarType: true },
    orderBy: { calendarDate: 'asc' },
  });

  return holidays.map(h => ({
    date: h.calendarDate,
    holidayName: h.holidayName,
    calendarType: h.calendarType,
  }));
}
