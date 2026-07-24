import {describe, expect, it} from 'vitest';
import {
  computeAge,
  formatDate,
  formatPartialDate,
  lifeSpan,
  nextOccurrence,
  partialDateSortKey,
  validatePartialDate
} from '@/lib/dates';

describe('formatPartialDate', () => {
  it('renders full dates as dd.mm.yyyy', () => {
    expect(formatPartialDate({year: 1969, month: 5, day: 7})).toBe('07.05.1969');
  });
  it('renders year+month as mm.yyyy', () => {
    expect(formatPartialDate({year: 1969, month: 5, day: null})).toBe('05.1969');
  });
  it('renders year-only as yyyy', () => {
    expect(formatPartialDate({year: 1969, month: null, day: null})).toBe('1969');
  });
  it('renders unknown as empty string', () => {
    expect(formatPartialDate({year: null, month: null, day: null})).toBe('');
  });
  it('zero-pads day and month', () => {
    expect(formatPartialDate({year: 2005, month: 1, day: 3})).toBe('03.01.2005');
  });
});

describe('formatDate', () => {
  it('formats a Date as dd.mm.yyyy', () => {
    expect(formatDate(new Date(2024, 11, 24))).toBe('24.12.2024');
  });
  it('returns empty string for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('validatePartialDate', () => {
  it('accepts valid combinations', () => {
    expect(validatePartialDate({year: 1969, month: null, day: null})).toBeNull();
    expect(validatePartialDate({year: 1969, month: 5, day: null})).toBeNull();
    expect(validatePartialDate({year: 1969, month: 5, day: 7})).toBeNull();
    expect(validatePartialDate({year: null, month: null, day: null})).toBeNull();
  });
  it('rejects month without year', () => {
    expect(validatePartialDate({year: null, month: 5, day: null})).toBe(
      'month_requires_year'
    );
  });
  it('rejects day without month', () => {
    expect(validatePartialDate({year: 1969, month: null, day: 7})).toBe(
      'day_requires_month'
    );
  });
  it('rejects impossible calendar dates', () => {
    expect(validatePartialDate({year: 2023, month: 2, day: 29})).toBe('invalid_date');
    expect(validatePartialDate({year: 2024, month: 2, day: 29})).toBeNull();
    expect(validatePartialDate({year: 2024, month: 4, day: 31})).toBe('invalid_date');
    expect(validatePartialDate({year: 2024, month: 13, day: 1})).toBe('invalid_date');
  });
});

describe('partialDateSortKey', () => {
  it('orders year-only before dated entries of the same year', () => {
    const yearOnly = partialDateSortKey({year: 1969, month: null, day: null});
    const dated = partialDateSortKey({year: 1969, month: 1, day: 1});
    expect(yearOnly).toBeLessThan(dated);
  });
  it('orders across years', () => {
    expect(
      partialDateSortKey({year: 1970, month: null, day: null})
    ).toBeGreaterThan(partialDateSortKey({year: 1969, month: 12, day: 31}));
  });
});

describe('nextOccurrence', () => {
  it('returns this year when the day is ahead', () => {
    const next = nextOccurrence(12, 24, new Date(2026, 6, 24));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(11);
    expect(next.getDate()).toBe(24);
  });
  it('rolls to next year when the day has passed', () => {
    const next = nextOccurrence(3, 14, new Date(2026, 6, 24));
    expect(next.getFullYear()).toBe(2027);
  });
  it('returns today when the birthday is today', () => {
    const next = nextOccurrence(7, 24, new Date(2026, 6, 24, 15, 30));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getDate()).toBe(24);
  });
  it('handles 29 February in common years', () => {
    const next = nextOccurrence(2, 29, new Date(2026, 0, 1));
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });
});

describe('computeAge', () => {
  it('computes age between partial dates', () => {
    expect(
      computeAge({year: 1975, month: 3, day: 14}, {year: 2026, month: 7, day: 24})
    ).toBe(51);
    expect(
      computeAge({year: 1975, month: 12, day: 31}, {year: 2026, month: 7, day: 24})
    ).toBe(50);
  });
  it('returns null without a birth year', () => {
    expect(computeAge({year: null, month: null, day: null})).toBeNull();
  });
});

describe('lifeSpan', () => {
  it('renders deceased spans', () => {
    expect(
      lifeSpan(
        {year: 1948, month: null, day: null},
        {year: 2020, month: null, day: null},
        true
      )
    ).toBe('1948–2020');
  });
  it('renders living persons with a birth year', () => {
    expect(
      lifeSpan({year: 1950, month: null, day: null}, {year: null, month: null, day: null}, false)
    ).toBe('*1950');
  });
});
