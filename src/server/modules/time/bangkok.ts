export const BANGKOK_TZ = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface BangkokDateParts {
  year: number;
  month: number;
  day: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  isoWeekday: number;
  hour: number;
  minute: number;
  second: number;
  isoDate: string;
}

export interface PeriodWindow {
  periodKey: string;
  startDate: string;
  endDate: string;
  deadlineAt: Date;
  briefScheduledAt: Date;
}

/**
 * Thailand observes UTC+07:00 year-round without DST.
 * Converting via UTC+7 shifted Date gives exact deterministic calendar arithmetic.
 */
export function getBangkokParts(date: Date = new Date()): BangkokDateParts {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const rawDay = shifted.getUTCDay(); // 0=Sun..6=Sat
  const isoWeekday = rawDay === 0 ? 7 : rawDay;
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    isoWeekday,
    hour,
    minute,
    second,
    isoDate: `${year}-${pad(month)}-${pad(day)}`,
  };
}

export function bangkokLocalToUtc(isoDate: string, timeHhMmSs: string): Date {
  const normalizedTime = timeHhMmSs.length === 5 ? `${timeHhMmSs}:00` : timeHhMmSs;
  return new Date(`${isoDate}T${normalizedTime}+07:00`);
}

export function addDaysIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utcMidnight = Date.UTC(y!, m! - 1, d! + deltaDays);
  const shifted = new Date(utcMidnight);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function computeIsoWeekKey(mondayIsoDate: string): string {
  // Thursday of a Monday-based week always belongs to the ISO week-year.
  const thursdayIso = addDaysIsoDate(mondayIsoDate, 3);
  const [ty, tm, td] = thursdayIso.split('-').map(Number);
  const thursdayUtc = Date.UTC(ty!, tm! - 1, td!);
  const jan1Utc = Date.UTC(ty!, 0, 1);
  const jan1Day = new Date(jan1Utc).getUTCDay() || 7;
  const firstThursdayUtc = jan1Utc + ((4 - jan1Day + 7) % 7) * 86_400_000;
  const jan1Thursday = jan1Day <= 4 ? jan1Utc + (4 - jan1Day) * 86_400_000 : firstThursdayUtc;
  const weekNumber = Math.floor((thursdayUtc - jan1Thursday) / (7 * 86_400_000)) + 1;
  return `${ty}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Computes Monday–Sunday reporting window in Asia/Bangkok timezone (DEC-02)
 * with Sunday 20:00 ICT cutoff & Sunday 20:30 ICT Meeting Brief schedule (DEC-01).
 */
export function getMondaySundayPeriodBounds(
  referenceDate: Date = new Date(),
  deadlineTimeLocal = '20:00',
  briefTimeLocal = '20:30'
): PeriodWindow {
  const parts = getBangkokParts(referenceDate);
  const startDate = addDaysIsoDate(parts.isoDate, -(parts.isoWeekday - 1));
  const endDate = addDaysIsoDate(startDate, 6);
  const periodKey = computeIsoWeekKey(startDate);

  return {
    periodKey,
    startDate,
    endDate,
    deadlineAt: bangkokLocalToUtc(endDate, deadlineTimeLocal),
    briefScheduledAt: bangkokLocalToUtc(endDate, briefTimeLocal),
  };
}

export function isPastDeadline(now: Date, deadlineAt: Date): boolean {
  return now.getTime() > deadlineAt.getTime();
}

export function formatThaiDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: BANGKOK_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
