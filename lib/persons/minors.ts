import type {PartialDate} from '@/lib/dates';

/**
 * Minor-status computation — the TypeScript mirror of public.is_minor
 * (20260724000016_minors.sql). Keep the two in sync.
 *
 * Conservative by design: with a partial birth date the LATEST possible
 * birthday is assumed (month -> December, day -> end of month), so a
 * person stays "minor" until they are certainly an adult. No birth year
 * -> treated as adult (the mechanism needs a date to work with).
 */
export function isMinor(
  birth: PartialDate,
  adulthoodAge: number,
  now: Date,
  isDeceased = false
): boolean {
  if (birth.year == null || isDeceased) return false;
  const assumedMonth = birth.month ?? 12;
  const assumedDay = birth.day ?? 31;
  let age = now.getFullYear() - birth.year;
  const nowMonth = now.getMonth() + 1;
  const nowDay = now.getDate();
  if (nowMonth < assumedMonth || (nowMonth === assumedMonth && nowDay < assumedDay)) {
    age -= 1;
  }
  return age < adulthoodAge;
}

/**
 * True when the person has crossed adulthood — used by the guardian
 * banner ("invite them to take over"). Only meaningful for profiles
 * with a birth year; unknown birth dates never trigger the banner.
 */
export function hasBecomeAdult(
  birth: PartialDate,
  adulthoodAge: number,
  now: Date,
  isDeceased = false
): boolean {
  if (birth.year == null || isDeceased) return false;
  return !isMinor(birth, adulthoodAge, now, isDeceased);
}
