import {describe, expect, it} from 'vitest';
import {upcomingCelebrations, type CelebrationPerson} from '@/lib/celebrations';

const person = (
  id: string,
  month: number | null,
  day: number | null,
  year: number | null = 1980,
  deceased = false
): CelebrationPerson => ({
  id,
  first_name: 'Test',
  last_name: id,
  birth_year: year,
  birth_month: month,
  birth_day: day,
  is_deceased: deceased
});

const NOW = new Date(2026, 6, 24); // 24.07.2026

describe('upcomingCelebrations', () => {
  it('includes birthdays inside the window and sorts by date', () => {
    const result = upcomingCelebrations(
      [person('a', 8, 10), person('b', 7, 30), person('c', 12, 24)],
      [],
      30,
      NOW
    );
    expect(result.map((c) => c.label)).toEqual(['Test b', 'Test a']);
  });

  it('computes the age being turned', () => {
    const result = upcomingCelebrations([person('a', 8, 1, 1980)], [], 30, NOW);
    expect(result[0]?.years).toBe(46);
  });

  it('skips deceased persons and unknown month/day', () => {
    const result = upcomingCelebrations(
      [person('dead', 8, 1, 1950, true), person('yearOnly', null, null)],
      [],
      30,
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('includes wedding anniversaries with couple labels', () => {
    const result = upcomingCelebrations(
      [],
      [
        {
          id: 'w1',
          type: 'wedding',
          event_year: 2003,
          event_month: 8,
          event_day: 2,
          participantNames: ['Anna', 'Piotr']
        }
      ],
      30,
      NOW
    );
    expect(result[0]?.kind).toBe('anniversary');
    expect(result[0]?.label).toBe('Anna & Piotr');
    expect(result[0]?.years).toBe(23);
  });

  it('includes today', () => {
    const result = upcomingCelebrations([person('today', 7, 24)], [], 30, NOW);
    expect(result).toHaveLength(1);
  });

  it('excludes dates beyond the window', () => {
    const result = upcomingCelebrations([person('later', 9, 24)], [], 30, NOW);
    expect(result).toHaveLength(0);
  });
});
