import {nextOccurrence} from '@/lib/dates';

/**
 * Upcoming birthdays and wedding anniversaries, computed from data the
 * viewer is allowed to see (queries are RLS-filtered upstream).
 * Only dates with a known month + day can recur.
 */

export type CelebrationPerson = {
  id: string;
  first_name: string;
  last_name: string;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  is_deceased: boolean;
};

export type CelebrationEvent = {
  id: string;
  type: string;
  event_year: number;
  event_month: number | null;
  event_day: number | null;
  participantNames: string[];
};

export type Celebration = {
  kind: 'birthday' | 'anniversary';
  date: Date;
  /** Person or couple display name. */
  label: string;
  /** Age being turned / years celebrated (null when the year is unknown). */
  years: number | null;
  href: string;
};

export function upcomingCelebrations(
  persons: CelebrationPerson[],
  weddingEvents: CelebrationEvent[],
  withinDays: number,
  now: Date
): Celebration[] {
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + withinDays);
  const results: Celebration[] = [];

  for (const person of persons) {
    if (person.is_deceased) continue;
    if (person.birth_month == null || person.birth_day == null) continue;
    const date = nextOccurrence(person.birth_month, person.birth_day, now);
    if (date.getTime() > horizon.getTime()) continue;
    results.push({
      kind: 'birthday',
      date,
      label: `${person.first_name} ${person.last_name}`,
      years: person.birth_year != null ? date.getFullYear() - person.birth_year : null,
      href: `/people/${person.id}`
    });
  }

  for (const event of weddingEvents) {
    if (event.type !== 'wedding') continue;
    if (event.event_month == null || event.event_day == null) continue;
    const date = nextOccurrence(event.event_month, event.event_day, now);
    if (date.getTime() > horizon.getTime()) continue;
    results.push({
      kind: 'anniversary',
      date,
      label: event.participantNames.join(' & '),
      years: date.getFullYear() - event.event_year,
      href: `/events/${event.id}`
    });
  }

  results.sort((a, b) => a.date.getTime() - b.date.getTime());
  return results;
}
