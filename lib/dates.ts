/**
 * The single date-formatting utility for the whole app.
 * Display format is dd.mm.yyyy for ALL locales (product decision).
 *
 * Partial dates mirror the DB convention (<field>_year/_month/_day):
 * day requires month, month requires year. Render gracefully:
 *   {1969, null, null} -> "1969"
 *   {1969, 5, null}    -> "05.1969"
 *   {1969, 5, 7}       -> "07.05.1969"
 */

export type PartialDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatPartialDate(date: PartialDate): string {
  const {year, month, day} = date;
  if (year == null) return '';
  if (month == null) return String(year);
  if (day == null) return `${pad2(month)}.${year}`;
  return `${pad2(day)}.${pad2(month)}.${year}`;
}

/** Formats a full Date (or ISO string) as dd.mm.yyyy. */
export function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** dd.mm.yyyy hh:mm — for timestamps like invitation expiry. */
export function formatDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Sortable numeric key; unknown month/day sort before known ones within
 * the same year (a year-only event appears before dated events of that
 * year in oldest-first order).
 */
export function partialDateSortKey(date: PartialDate): number {
  if (date.year == null) return Number.NEGATIVE_INFINITY;
  return date.year * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

export type PartialDateError = 'month_requires_year' | 'day_requires_month' | 'invalid_date';

/** Validates the DB partial-date rules plus real calendar validity. */
export function validatePartialDate(date: PartialDate): PartialDateError | null {
  const {year, month, day} = date;
  if (month != null && year == null) return 'month_requires_year';
  if (day != null && month == null) return 'day_requires_month';
  if (year != null && (year < 1 || year > 2200)) return 'invalid_date';
  if (month != null && (month < 1 || month > 12)) return 'invalid_date';
  if (day != null) {
    if (day < 1 || day > 31) return 'invalid_date';
    const probe = new Date(Date.UTC(year!, month! - 1, day));
    // Years < 100 need explicit handling because Date.UTC maps them to 19xx.
    probe.setUTCFullYear(year!);
    if (probe.getUTCMonth() !== month! - 1 || probe.getUTCDate() !== day) {
      return 'invalid_date';
    }
  }
  return null;
}

/**
 * Next yearly occurrence of month/day on or after `from` (birthdays,
 * anniversaries). 29 February falls back to 28 February in common years.
 */
export function nextOccurrence(month: number, day: number, from: Date): Date {
  const startYear = from.getFullYear();
  for (let year = startYear; year <= startYear + 1; year++) {
    const effectiveDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
    const candidate = new Date(year, month - 1, effectiveDay);
    if (
      candidate.getTime() >=
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
    ) {
      return candidate;
    }
  }
  // Unreachable: one of the two candidates is always in the future.
  return new Date(startYear + 1, month - 1, day);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Age in full years; null when the birth year is unknown. */
export function computeAge(birth: PartialDate, until?: PartialDate | null): number | null {
  if (birth.year == null) return null;
  const end: PartialDate =
    until && until.year != null
      ? until
      : {
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
          day: new Date().getDate()
        };
  if (end.year == null) return null;
  let age = end.year - birth.year;
  const bm = birth.month ?? 1;
  const bd = birth.day ?? 1;
  const em = end.month ?? 12;
  const ed = end.day ?? 31;
  if (em < bm || (em === bm && ed < bd)) age -= 1;
  return age < 0 ? null : age;
}

/** "1948–2020" / "b. 1950" life-span helper for tree cards. */
export function lifeSpan(
  birth: PartialDate,
  death: PartialDate,
  isDeceased: boolean
): string {
  const b = birth.year != null ? String(birth.year) : '';
  const d = death.year != null ? String(death.year) : '';
  if (isDeceased) {
    if (b && d) return `${b}–${d}`;
    if (b) return `${b}–`;
    if (d) return `–${d}`;
    return '';
  }
  return b ? `*${b}` : '';
}
