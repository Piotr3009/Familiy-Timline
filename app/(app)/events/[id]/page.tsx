import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {EVENT_TYPES} from '@/lib/event-types';
import {formatPartialDate} from '@/lib/dates';
import {createSignedUrls} from '@/lib/media';
import {personName, sortByBirth} from '@/lib/persons/relations';
import {deleteEventAction} from '@/lib/events/actions';
import {loadActorNames, loadHistory} from '@/lib/audit/load';
import {Button, Card, PersonAvatar} from '@/components/ui';
import {EventForm} from '@/components/events/EventForm';
import {HistoryPanel} from '@/components/history/HistoryPanel';
import {CommentsSection} from '@/components/comments/CommentsSection';

async function EventHistory({
  familyId,
  eventId,
  canEdit
}: {
  familyId: string;
  eventId: string;
  canEdit: boolean;
}) {
  const supabase = await createClient();
  const entries = await loadHistory(supabase, [{table: 'events', rowIds: [eventId]}]);
  const actorNames = await loadActorNames(supabase, familyId, entries);
  return (
    <HistoryPanel
      entries={entries}
      actorNames={actorNames}
      canEdit={canEdit}
      revalidate={`/events/${eventId}`}
    />
  );
}

export default async function EventDetailPage({
  params
}: {
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  // Family-scoped: a member of several families must not see another
  // family's item under this family's chrome (role/permissions differ).
  const {data: event} = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('family_id', ctx.family.id)
    .maybeSingle();
  if (!event) notFound();

  const [{data: participantRows}, {data: personsRaw}, {data: photos}] = await Promise.all([
    supabase.from('event_persons').select('person_id').eq('event_id', id),
    supabase.from('visible_persons').select('*').eq('family_id', ctx.family.id),
    supabase
      .from('photos')
      .select('id, storage_path_thumb, kind')
      .eq('event_id', id)
      .limit(24)
  ]);

  const participantIds = (participantRows ?? []).map((row) => row.person_id);
  const persons = sortByBirth(personsRaw ?? []);
  const participants = persons.filter((person) => participantIds.includes(person.id));
  const canEdit = event.created_by === ctx.user.id || ctx.role === 'admin';

  const thumbPaths = (photos ?? [])
    .map((photo) => photo.storage_path_thumb)
    .filter((path): path is string => Boolean(path));
  const thumbUrls = await createSignedUrls(supabase, 'media', thumbPaths);

  const meta = EVENT_TYPES[event.type];
  const dateText = formatPartialDate({
    year: event.event_year,
    month: event.event_month,
    day: event.event_day
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/timeline" className="text-sm text-amber hover:underline">
        ← {t('events.backToTimeline')}
      </Link>
      <Card>
        <div className="flex items-start gap-3">
          <span aria-hidden className="text-3xl">
            {meta.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl">
              {event.title ?? t(`events.types.${event.type}`)}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {dateText}
              {event.location ? ` · ${event.location}` : ''}
            </p>
            <p className="mt-1 text-xs text-ink-faint">
              {t(`privacy.${event.privacy}`)}
            </p>
          </div>
        </div>
        {event.description ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-sm">
            {event.description}
          </p>
        ) : null}
        {participants.length > 0 ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm text-ink-muted">{t('events.participantsLabel')}</p>
            <ul className="flex flex-wrap gap-2">
              {participants.map((person) => (
                <li key={person.id}>
                  <Link
                    href={`/people/${person.id}`}
                    className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm hover:bg-surface-sunken"
                  >
                    <PersonAvatar name={personName(person)} size="sm" />
                    {personName(person)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {(photos ?? []).length > 0 ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-sm text-ink-muted">{t('events.photosLabel')}</p>
            <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {(photos ?? []).map((photo) => {
                const url = photo.storage_path_thumb
                  ? thumbUrls.get(photo.storage_path_thumb)
                  : null;
                return (
                  <li key={photo.id}>
                    <Link
                      href={`/photos/${photo.id}`}
                      aria-label={t('photos.openPhoto')}
                      className="block aspect-square overflow-hidden rounded-lg border border-border bg-surface-sunken"
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xl">
                          {photo.kind === 'video' ? '🎞️' : '🖼️'}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Card>
      <Card>
        <h2 className="font-heading mb-3 text-lg">{t('comments.title')}</h2>
        <CommentsSection
          targetType="event"
          targetId={event.id}
          familyId={ctx.family.id}
          viewerUserId={ctx.user.id}
          viewerIsAdmin={ctx.role === 'admin'}
        />
      </Card>

      <Card>
        <details>
          <summary className="font-heading cursor-pointer text-lg">
            {t('history.title')}
          </summary>
          <div className="mt-4">
            <EventHistory familyId={ctx.family.id} eventId={event.id} canEdit={canEdit} />
          </div>
        </details>
      </Card>

      {canEdit ? (
        <Card>
          <h2 className="font-heading mb-3 text-lg">{t('events.editTitle')}</h2>
          <EventForm
            event={event}
            persons={persons.map((person) => ({id: person.id, name: personName(person)}))}
            participantIds={participantIds}
          />
          <form action={deleteEventAction} className="mt-3 border-t border-border pt-3">
            <input type="hidden" name="eventId" value={event.id} />
            <Button type="submit" variant="danger">
              {t('events.deleteButton')}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
