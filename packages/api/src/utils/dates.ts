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
