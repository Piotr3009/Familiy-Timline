import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, FeedItem} from '@/lib/database.types';
import type {FamilyGraph} from '@/lib/persons/relations';
import {personName} from '@/lib/persons/relations';
import {createSignedUrls} from '@/lib/media';

/**
 * Feed loading + render preparation. feed_items rows are RLS-filtered
 * (visibility re-checks the target object), so everything read here is
 * already safe to show; this module resolves names/thumbnails for
 * display and prepares cursor pagination.
 */

export type RenderedFeedItem = {
  id: string;
  type: FeedItem['type'];
  createdAt: string;
  actorName: string | null;
  /** Target link (person/event/photo page). */
  href: string | null;
  /** Person or event display name for the sentence. */
  targetLabel: string | null;
  /** event_added: the event type key (icon + fallback title). */
  eventType?: string;
  /** relationship items: the two endpoint names + status. */
  pair?: {a: string; b: string; status: string | null};
  /** photo_added: visible thumbnails of the batch. */
  photos?: Array<{id: string; thumbUrl: string | null}>;
  photoCount?: number;
  /** comment_added: target of the comment (label may be empty; the
   *  renderer falls back to the event-type name or a generic word). */
  commentTarget?: {href: string; label: string; eventType?: string} | null;
};

export type FeedPage = {
  items: RenderedFeedItem[];
  /** created_at cursor for the next (older) page, if any. */
  nextCursor: string | null;
};

const PAGE_SIZE = 20;

function photoIdsOf(item: FeedItem): string[] {
  const payload = item.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [];
  const ids = (payload as {photo_ids?: unknown}).photo_ids;
  if (!Array.isArray(ids)) return [];
  return ids.filter((value): value is string => typeof value === 'string');
}

function statusOf(item: FeedItem): string | null {
  const payload = item.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const status = (payload as {status?: unknown}).status;
  return typeof status === 'string' ? status : null;
}

export async function loadFeed(
  supabase: SupabaseClient<Database>,
  familyId: string,
  graph: FamilyGraph,
  options: {before?: string | null} = {}
): Promise<FeedPage> {
  let query = supabase
    .from('feed_items')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', {ascending: false})
    .limit(PAGE_SIZE + 1);
  if (options.before) query = query.lt('created_at', options.before);
  const {data: rows} = await query;

  const pageRows = (rows ?? []).slice(0, PAGE_SIZE);
  const nextCursor =
    (rows ?? []).length > PAGE_SIZE
      ? pageRows[pageRows.length - 1]?.created_at ?? null
      : null;

  // Resolve render data. Persons/relationships come from the graph the
  // dashboard already loads; events/photos/comments are RLS-filtered
  // queries (invisible targets simply resolve to nothing — their feed
  // rows were already hidden by RLS anyway).
  const eventIds = pageRows
    .filter((item) => item.type === 'event_added')
    .map((item) => item.target_id)
    .filter((id): id is string => Boolean(id));
  const allPhotoIds = [...new Set(pageRows.flatMap(photoIdsOf))];
  const commentIds = pageRows
    .filter((item) => item.type === 'comment_added')
    .map((item) => item.target_id)
    .filter((id): id is string => Boolean(id));

  const [{data: events}, {data: photos}, {data: comments}] = await Promise.all([
    eventIds.length
      ? supabase.from('events').select('id, type, title').in('id', eventIds)
      : Promise.resolve({data: []}),
    allPhotoIds.length
      ? supabase.from('photos').select('id, storage_path_thumb').in('id', allPhotoIds)
      : Promise.resolve({data: []}),
    commentIds.length
      ? supabase
          .from('comments')
          .select('id, target_type, target_id')
          .in('id', commentIds)
      : Promise.resolve({data: []})
  ]);

  const commentTargetEventIds = (comments ?? [])
    .filter((comment) => comment.target_type === 'event')
    .map((comment) => comment.target_id);
  const {data: commentEvents} = commentTargetEventIds.length
    ? await supabase.from('events').select('id, type, title').in('id', commentTargetEventIds)
    : {data: []};

  const eventById = new Map([...(events ?? []), ...(commentEvents ?? [])].map((e) => [e.id, e]));
  const photoById = new Map((photos ?? []).map((p) => [p.id, p]));
  const commentById = new Map((comments ?? []).map((c) => [c.id, c]));

  const thumbPaths = (photos ?? [])
    .map((photo) => photo.storage_path_thumb)
    .filter((path): path is string => Boolean(path));
  const thumbUrls = await createSignedUrls(supabase, 'media', thumbPaths);

  const actorNameOf = (userId: string | null): string | null => {
    if (!userId) return null;
    for (const person of graph.persons.values()) {
      if (person.user_id === userId) return personName(person);
    }
    return null;
  };

  const items: RenderedFeedItem[] = [];
  for (const row of pageRows) {
    const base: RenderedFeedItem = {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      actorName: actorNameOf(row.actor_user_id),
      href: null,
      targetLabel: null
    };
    switch (row.type) {
      case 'person_added':
      case 'person_claimed': {
        const person = row.target_id ? graph.persons.get(row.target_id) : undefined;
        if (!person) continue;
        base.href = `/people/${person.id}`;
        base.targetLabel = personName(person);
        break;
      }
      case 'event_added': {
        const event = row.target_id ? eventById.get(row.target_id) : undefined;
        if (!event) continue;
        base.href = `/events/${event.id}`;
        base.targetLabel = event.title ?? null;
        base.eventType = event.type;
        break;
      }
      case 'photo_added': {
        const visible = photoIdsOf(row)
          .map((id) => photoById.get(id))
          .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));
        if (visible.length === 0) continue;
        base.photoCount = visible.length;
        base.photos = visible.slice(0, 4).map((photo) => ({
          id: photo.id,
          thumbUrl: photo.storage_path_thumb
            ? thumbUrls.get(photo.storage_path_thumb) ?? null
            : null
        }));
        base.href = `/photos/${visible[0]!.id}`;
        break;
      }
      case 'relationship_added':
      case 'relationship_ended': {
        const rel = graph.relationships.find((r) => r.id === row.target_id);
        if (!rel) continue;
        const a = graph.persons.get(rel.person_a_id);
        const b = graph.persons.get(rel.person_b_id);
        if (!a || !b) continue;
        base.pair = {
          a: personName(a),
          b: personName(b),
          status: statusOf(row) ?? rel.status
        };
        base.href = `/people/${a.id}`;
        break;
      }
      case 'comment_added': {
        const comment = row.target_id ? commentById.get(row.target_id) : undefined;
        if (!comment) continue;
        if (comment.target_type === 'event') {
          const event = eventById.get(comment.target_id);
          base.commentTarget = event
            ? {
                href: `/events/${event.id}`,
                label: event.title ?? '',
                eventType: event.type
              }
            : null;
          base.href = `/events/${comment.target_id}`;
        } else {
          base.commentTarget = {href: `/photos/${comment.target_id}`, label: ''};
          base.href = `/photos/${comment.target_id}`;
        }
        break;
      }
      default:
        continue;
    }
    items.push(base);
  }

  return {items, nextCursor};
}
