import {describe, expect, it} from 'vitest';
import {hasBecomeAdult, isMinor} from '@/lib/persons/minors';

const NOW = new Date(2026, 6, 24); // 24.07.2026
const AGE = 18;

describe('isMinor', () => {
  it('treats missing birth years as adults', () => {
    expect(isMinor({year: null, month: null, day: null}, AGE, NOW)).toBe(false);
  });

  it('treats deceased persons as non-minors for this mechanism', () => {
    expect(isMinor({year: 2015, month: 1, day: 1}, AGE, NOW, true)).toBe(false);
  });

  it('classifies a clear minor and a clear adult', () => {
    expect(isMinor({year: 2015, month: 3, day: 10}, AGE, NOW)).toBe(true);
    expect(isMinor({year: 1990, month: 3, day: 10}, AGE, NOW)).toBe(false);
  });

  it('flips exactly on the 18th birthday with a full date', () => {
    // Born 24.07.2008 -> turns 18 on 24.07.2026 (= NOW): adult.
    expect(isMinor({year: 2008, month: 7, day: 24}, AGE, NOW)).toBe(false);
    // Born one day later -> still a minor on NOW.
    expect(isMinor({year: 2008, month: 7, day: 25}, AGE, NOW)).toBe(true);
  });

  it('assumes the latest possible birthday for partial dates (conservative)', () => {
    // Year-only 2008: could be born 31.12.2008 -> not certainly 18
    // until 31.12.2026, so still a minor in July 2026.
    expect(isMinor({year: 2008, month: null, day: null}, AGE, NOW)).toBe(true);
    // Year-only 2007: latest birthday 31.12.2007 -> certainly 18 by
    // 31.12.2025, adult in July 2026.
    expect(isMinor({year: 2007, month: null, day: null}, AGE, NOW)).toBe(false);
    // Year+month 2008-07: latest day 31.07 -> still minor on 24.07.2026…
    expect(isMinor({year: 2008, month: 7, day: null}, AGE, NOW)).toBe(true);
    // …and 2008-06 (latest 30.06 < 24.07) is certainly adult.
    expect(isMinor({year: 2008, month: 6, day: null}, AGE, NOW)).toBe(false);
  });

  it('respects a configured adulthood age', () => {
    expect(isMinor({year: 2007, month: 1, day: 1}, 21, NOW)).toBe(true);
    expect(isMinor({year: 2004, month: 1, day: 1}, 21, NOW)).toBe(false);
  });
});

describe('hasBecomeAdult', () => {
  it('is false without a birth year (never triggers the banner)', () => {
    expect(hasBecomeAdult({year: null, month: null, day: null}, AGE, NOW)).toBe(false);
  });

  it('is true only once adulthood is certain', () => {
    expect(hasBecomeAdult({year: 2008, month: 7, day: 24}, AGE, NOW)).toBe(true);
    expect(hasBecomeAdult({year: 2008, month: null, day: null}, AGE, NOW)).toBe(false);
    expect(hasBecomeAdult({year: 2007, month: null, day: null}, AGE, NOW)).toBe(true);
  });

  it('is false for deceased profiles', () => {
    expect(hasBecomeAdult({year: 1990, month: 1, day: 1}, AGE, NOW, true)).toBe(false);
  });
});
