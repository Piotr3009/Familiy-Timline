import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, FamilyEvent} from '@/lib/database.types';
import {createSignedUrls} from '@/lib/media';
import {partialDateSortKey} from '@/lib/dates';

export type TimelineParticipant = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type TimelineEntry = {
  event: FamilyEvent;
  participants: TimelineParticipant[];
  photos: {id: string; thumbUrl: string}[];
  sortKey: number;
};

export type TimelineScope =
  | {kind: 'family'}
  | {kind: 'person'; personId: string};

/**
 * Loads RLS-filtered events with participants and photo thumbnails.
 * Sorting is newest-first by default; the UI can reverse.
 */
export async function loadTimeline(
  supabase: SupabaseClient<Database>,
  familyId: string,
  scope: TimelineScope,
  oldestFirst = false
): Promise<TimelineEntry[]> {
  let eventIdsForPerson: string[] | null = null;
  if (scope.kind === 'person') {
    const {data: participation} = await supabase
      .from('event_persons')
      .select('event_id')
      .eq('person_id', scope.personId);
    eventIdsForPerson = (participation ?? []).map((row) => row.event_id);
    if (eventIdsForPerson.length === 0) return [];
  }

  let query = supabase.from('events').select('*').eq('family_id', familyId);
  if (eventIdsForPerson) query = query.in('id', eventIdsForPerson);
  const {data: events} = await query;
  if (!events || events.length === 0) return [];

  const eventIds = events.map((event) => event.id);
  const [{data: participantRows}, {data: photoRows}] = await Promise.all([
    supabase.from('event_persons').select('event_id, person_id').in('event_id', eventIds),
    supabase
      .from('photos')
      .select('id, event_id, storage_path_thumb')
      .in('event_id', eventIds)
  ]);

  const personIds = [...new Set((participantRows ?? []).map((row) => row.person_id))];
  const {data: persons} = personIds.length
    ? await supabase
        .from('visible_persons')
        .select('id, first_name, last_name, avatar_url')
        .in('id', personIds)
    : {data: []};

  const avatarPaths = (persons ?? [])
    .map((person) => person.avatar_url)
    .filter((path): path is string => Boolean(path));
  const thumbPaths = (photoRows ?? [])
    .map((photo) => photo.storage_path_thumb)
    .filter((path): path is string => Boolean(path));
  const [avatarUrls, thumbUrls] = await Promise.all([
    createSignedUrls(supabase, 'avatars', avatarPaths),
    createSignedUrls(supabase, 'media', thumbPaths)
  ]);

  const personById = new Map(
    (persons ?? []).map((person) => [
      person.id,
      {
        id: person.id,
        name: `${person.first_name} ${person.last_name}`,
        avatarUrl: person.avatar_url ? avatarUrls.get(person.avatar_url) ?? null : null
      }
    ])
  );

  const participantsByEvent = new Map<string, TimelineParticipant[]>();
  for (const row of participantRows ?? []) {
    const participant = personById.get(row.person_id);
    if (!participant) continue;
    const list = participantsByEvent.get(row.event_id) ?? [];
    list.push(participant);
    participantsByEvent.set(row.event_id, list);
  }

  const photosByEvent = new Map<string, {id: string; thumbUrl: string}[]>();
  for (const photo of photoRows ?? []) {
    if (!photo.event_id || !photo.storage_path_thumb) continue;
    const url = thumbUrls.get(photo.storage_path_thumb);
    if (!url) continue;
    const list = photosByEvent.get(photo.event_id) ?? [];
    if (list.length < 4) list.push({id: photo.id, thumbUrl: url});
    photosByEvent.set(photo.event_id, list);
  }

  const entries: TimelineEntry[] = events.map((event) => ({
    event,
    participants: participantsByEvent.get(event.id) ?? [],
    photos: photosByEvent.get(event.id) ?? [],
    sortKey: partialDateSortKey({
      year: event.event_year,
      month: event.event_month,
      day: event.event_day
    })
  }));

  entries.sort((a, b) => (oldestFirst ? a.sortKey - b.sortKey : b.sortKey - a.sortKey));
  return entries;
}

/** Groups sorted entries by year, preserving entry order. */
export function groupByYear(entries: TimelineEntry[]): {year: number; entries: TimelineEntry[]}[] {
  const groups: {year: number; entries: TimelineEntry[]}[] = [];
  for (const entry of entries) {
    const year = entry.event.event_year;
    const last = groups[groups.length - 1];
    if (last && last.year === year) {
      last.entries.push(entry);
    } else {
      groups.push({year, entries: [entry]});
    }
  }
  return groups;
}
