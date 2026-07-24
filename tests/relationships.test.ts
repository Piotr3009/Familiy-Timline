import {describe, expect, it} from 'vitest';
import {
  ACTIVE_PARTNER_STATUSES,
  ENDED_PARTNER_STATUSES,
  PARTNER_STATUSES,
  isPartnerStatus,
  validateRelationshipDates,
  type RelationshipDates
} from '@/lib/relationships/validate';

const dates = (partial: Partial<RelationshipDates>): RelationshipDates => ({
  startDate: null,
  weddingDate: null,
  separationDate: null,
  divorceDate: null,
  ...partial
});

describe('validateRelationshipDates', () => {
  it('accepts all-empty dates', () => {
    expect(validateRelationshipDates(dates({}))).toBeNull();
  });

  it('accepts a coherent full sequence', () => {
    expect(
      validateRelationshipDates(
        dates({
          startDate: '1990-05-01',
          weddingDate: '1992-06-15',
          separationDate: '2001-01-01',
          divorceDate: '2002-03-20'
        })
      )
    ).toBeNull();
  });

  it('accepts partial combinations (missing intermediate dates)', () => {
    expect(
      validateRelationshipDates(dates({startDate: '1990-05-01', divorceDate: '2002-03-20'}))
    ).toBeNull();
    expect(validateRelationshipDates(dates({divorceDate: '2002-03-20'}))).toBeNull();
    expect(
      validateRelationshipDates(dates({weddingDate: '1992-06-15', separationDate: '1992-06-15'}))
    ).toBeNull(); // same day is allowed (≥, not >)
  });

  it('rejects each out-of-order pair', () => {
    expect(
      validateRelationshipDates(dates({startDate: '1995-01-01', weddingDate: '1994-01-01'}))
    ).toBe('wedding_before_start');
    expect(
      validateRelationshipDates(
        dates({weddingDate: '1995-01-01', separationDate: '1994-01-01'})
      )
    ).toBe('separation_before_wedding');
    expect(
      validateRelationshipDates(
        dates({startDate: '1995-01-01', separationDate: '1994-01-01'})
      )
    ).toBe('separation_before_start');
    expect(
      validateRelationshipDates(
        dates({separationDate: '2001-01-01', divorceDate: '2000-01-01'})
      )
    ).toBe('divorce_before_separation');
    expect(
      validateRelationshipDates(dates({weddingDate: '2001-01-01', divorceDate: '2000-01-01'}))
    ).toBe('divorce_before_wedding');
    expect(
      validateRelationshipDates(dates({startDate: '2001-01-01', divorceDate: '2000-01-01'}))
    ).toBe('divorce_before_start');
  });

  it('rejects malformed and impossible dates', () => {
    expect(validateRelationshipDates(dates({startDate: '01.05.1990'}))).toBe('invalid_date');
    expect(validateRelationshipDates(dates({weddingDate: '1992-13-01'}))).toBe('invalid_date');
    expect(validateRelationshipDates(dates({divorceDate: '2001-02-30'}))).toBe('invalid_date');
  });
});

describe('partner status sets', () => {
  it('covers every status exactly once across active/ended', () => {
    expect([...ACTIVE_PARTNER_STATUSES, ...ENDED_PARTNER_STATUSES].sort()).toEqual(
      [...PARTNER_STATUSES].sort()
    );
  });

  it('guards status strings', () => {
    expect(isPartnerStatus('married')).toBe(true);
    expect(isPartnerStatus('divorced')).toBe(true);
    expect(isPartnerStatus('roommates')).toBe(false);
  });
});
