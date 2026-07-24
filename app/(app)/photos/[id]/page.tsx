import Link from 'next/link';
import {notFound, redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {createSignedUrl} from '@/lib/media';
import {formatPartialDate} from '@/lib/dates';
import {personName, sortByBirth} from '@/lib/persons/relations';
import {deletePhotoAction} from '@/lib/photos/actions';
import {Alert, Button, Card, PersonAvatar} from '@/components/ui';
import {EditPhotoForm} from '@/components/photos/EditPhotoForm';

export default async function PhotoDetailPage({
  params,
  searchParams
}: {
  params: Promise<{id: string}>;
  searchParams: Promise<{error?: string}>;
}) {
  const {id} = await params;
  const {error: pageError} = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const {data: photo} = await supabase.from('photos').select('*').eq('id', id).maybeSingle();
  if (!photo) notFound();

  const displayPath =
    photo.kind === 'photo'
      ? photo.storage_path_preview ?? photo.storage_path_original
      : photo.storage_path_original;
  const mediaUrl = await createSignedUrl(supabase, 'media', displayPath);
  const originalUrl =
    photo.kind === 'photo'
      ? await createSignedUrl(supabase, 'media', photo.storage_path_original)
      : mediaUrl;

  const [{data: tags}, {data: personsRaw}, {data: eventsRaw}, {data: linkedEvent}] =
    await Promise.all([
      supabase.from('photo_persons').select('person_id').eq('photo_id', id),
      supabase.from('visible_persons').select('*').eq('family_id', ctx.family.id),
      supabase
        .from('events')
        .select('id, type, title, event_year, event_month, event_day')
        .eq('family_id', ctx.family.id)
        .order('event_year', {ascending: false})
        .limit(100),
      photo.event_id
        ? supabase
            .from('events')
            .select('id, type, title, event_year')
            .eq('id', photo.event_id)
            .maybeSingle()
        : Promise.resolve({data: null})
    ]);

  const taggedIds = (tags ?? []).map((tag) => tag.person_id);
  const persons = sortByBirth(personsRaw ?? []);
  const taggedPersons = persons.filter((person) => taggedIds.includes(person.id));
  const canEdit = photo.uploaded_by === ctx.user.id || ctx.role === 'admin';

  const tEvents = await getTranslations('events');
  const takenText = formatPartialDate({
    year: photo.taken_year,
    month: photo.taken_month,
    day: photo.taken_day
  });

  const eventLabel = (event: {
    type: string;
    title: string | null;
    event_year: number;
    event_month?: number | null;
    event_day?: number | null;
  }) =>
    `${event.title ?? tEvents(`types.${event.type}` as never)} · ${formatPartialDate({
      year: event.event_year,
      month: event.event_month ?? null,
      day: event.event_day ?? null
    })}`;

  // Build the edit dropdown from recent events, but always include the
  // photo's currently linked event even if it falls outside the top 100 —
  // otherwise saving would silently clear the link.
  const eventOptions = (eventsRaw ?? []).map((event) => ({
    id: event.id,
    label: eventLabel(event)
  }));
  if (linkedEvent && !eventOptions.some((option) => option.id === linkedEvent.id)) {
    eventOptions.unshift({id: linkedEvent.id, label: eventLabel(linkedEvent)});
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {pageError === 'delete' ? (
        <Alert tone="error">{t('photos.deleteFailed')}</Alert>
      ) : null}
      <Link href="/photos" className="text-sm text-amber hover:underline">
        ← {t('photos.backToGallery')}
      </Link>
      <div className="overflow-hidden rounded-card border border-border bg-black/5">
        {photo.kind === 'video' ? (
          mediaUrl ? (
            <video controls playsInline className="max-h-[70vh] w-full" src={mediaUrl} />
          ) : null
        ) : mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl}
            alt={photo.description ?? ''}
            className="max-h-[70vh] w-full object-contain"
          />
        ) : null}
      </div>
      <Card>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {takenText ? (
            <div>
              <dt className="text-ink-muted">{t('photos.takenDate')}</dt>
              <dd>{takenText}</dd>
            </div>
          ) : null}
          {photo.location ? (
            <div>
              <dt className="text-ink-muted">{t('photos.location')}</dt>
              <dd>{photo.location}</dd>
            </div>
          ) : null}
          {linkedEvent ? (
            <div>
              <dt className="text-ink-muted">{t('photos.linkedEvent')}</dt>
              <dd>
                <Link
                  href={`/events/${linkedEvent.id}`}
                  className="text-amber hover:underline"
                >
                  {linkedEvent.title ?? tEvents(`types.${linkedEvent.type}`)} ·{' '}
                  {linkedEvent.event_year}
                </Link>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-muted">{t('photos.privacyLabel')}</dt>
            <dd>{t(`privacy.${photo.privacy}`)}</dd>
          </div>
        </dl>
        {photo.description ? (
          <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm">
            {photo.description}
          </p>
        ) : null}
        {taggedPersons.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-sm text-ink-muted">{t('photos.taggedPersons')}</p>
            <ul className="flex flex-wrap gap-2">
              {taggedPersons.map((person) => (
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
        {canEdit ? (
          <div className="mt-4 space-y-3">
            <EditPhotoForm
              photo={photo}
              persons={persons.map((person) => ({id: person.id, name: personName(person)}))}
              events={eventOptions}
              taggedIds={taggedIds}
            />
            <form action={deletePhotoAction}>
              <input type="hidden" name="photoId" value={photo.id} />
              <Button type="submit" variant="danger">
                {t('photos.deleteButton')}
              </Button>
            </form>
          </div>
        ) : null}
      </Card>
      {originalUrl && photo.kind === 'photo' ? (
        <p className="text-center">
          <a
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-ink-faint underline"
          >
            {t('photos.openOriginal')}
          </a>
        </p>
      ) : null}
    </div>
  );
}
