import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {createSignedUrls} from '@/lib/media';
import {formatPartialDate} from '@/lib/dates';
import {EVENT_TYPES} from '@/lib/event-types';
import {finishTakeoverReviewAction} from '@/lib/takeover/actions';
import {Button, Card} from '@/components/ui';
import {HideItemButton, RequestRemovalButton} from '@/components/takeover/ReviewControls';

/**
 * Post-takeover review: after claiming their profile, the new owner
 * sees what already exists about them — profile fields, photos they
 * appear in, events they participate in — with per-item controls.
 * "Hide" removes their own tag/participation; the underlying content
 * stays with its owner.
 */
export default async function ProfileReviewPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  if (!ctx.person) redirect('/dashboard');
  const t = await getTranslations();
  const supabase = await createClient();

  const [{data: photoTags}, {data: participations}] = await Promise.all([
    supabase.from('photo_persons').select('photo_id').eq('person_id', ctx.person.id),
    supabase.from('event_persons').select('event_id').eq('person_id', ctx.person.id)
  ]);

  const photoIds = (photoTags ?? []).map((row) => row.photo_id);
  const eventIds = (participations ?? []).map((row) => row.event_id);

  const [{data: photos}, {data: events}] = await Promise.all([
    photoIds.length
      ? supabase
          .from('photos')
          .select('id, storage_path_thumb, kind, description')
          .in('id', photoIds)
      : Promise.resolve({data: []}),
    eventIds.length
      ? supabase
          .from('events')
          .select('id, type, title, event_year, event_month, event_day')
          .in('id', eventIds)
      : Promise.resolve({data: []})
  ]);

  const thumbUrls = await createSignedUrls(
    supabase,
    'media',
    (photos ?? [])
      .map((photo) => photo.storage_path_thumb)
      .filter((path): path is string => Boolean(path))
  );

  const fields: Array<{label: string; value: string}> = [
    {
      label: t('persons.birthDate'),
      value: formatPartialDate({
        year: ctx.person.birth_year,
        month: ctx.person.birth_month,
        day: ctx.person.birth_day
      })
    },
    {label: t('persons.birthPlace'), value: ctx.person.birth_place ?? ''},
    {label: t('persons.bio'), value: ctx.person.bio ?? ''}
  ].filter((field) => field.value);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-heading text-2xl">{t('takeover.reviewTitle')}</h1>
      <p className="text-sm text-ink-muted">{t('takeover.reviewIntro')}</p>

      <Card>
        <h2 className="font-heading mb-3 text-lg">{t('takeover.profileSection')}</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('takeover.profileEmpty')}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            {fields.map((field) => (
              <div key={field.label} className="flex justify-between gap-4">
                <dt className="text-ink-muted">{field.label}</dt>
                <dd className="text-right">{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-xs text-ink-faint">{t('takeover.profileHint')}</p>
        <Link href={`/people/${ctx.person.id}`} className="text-sm text-amber hover:underline">
          {t('takeover.openProfile')}
        </Link>
      </Card>

      <Card>
        <h2 className="font-heading mb-3 text-lg">
          {t('takeover.photosSection', {count: (photos ?? []).length})}
        </h2>
        {(photos ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">{t('takeover.photosEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {(photos ?? []).map((photo) => {
              const url = photo.storage_path_thumb
                ? thumbUrls.get(photo.storage_path_thumb)
                : null;
              return (
                <li
                  key={photo.id}
                  className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2"
                >
                  <Link
                    href={`/photos/${photo.id}`}
                    className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border"
                    aria-label={t('photos.openPhoto')}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        {photo.kind === 'video' ? '🎞️' : '🖼️'}
                      </span>
                    )}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {photo.description ?? t('takeover.untitledPhoto')}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <HideItemButton kind="photo" targetId={photo.id} />
                    <RequestRemovalButton kind="photo" targetId={photo.id} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-heading mb-3 text-lg">
          {t('takeover.eventsSection', {count: (events ?? []).length})}
        </h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">{t('takeover.eventsEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {(events ?? []).map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2"
              >
                <span aria-hidden>{EVENT_TYPES[event.type].icon}</span>
                <Link
                  href={`/events/${event.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-ink hover:underline"
                >
                  {event.title ?? t(`events.types.${event.type}`)}
                  <span className="ml-2 text-xs text-ink-faint">
                    {formatPartialDate({
                      year: event.event_year,
                      month: event.event_month,
                      day: event.event_day
                    })}
                  </span>
                </Link>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <HideItemButton kind="event" targetId={event.id} />
                  <RequestRemovalButton kind="event" targetId={event.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form action={finishTakeoverReviewAction}>
        <Button type="submit" className="w-full">
          {t('takeover.finish')}
        </Button>
      </form>
    </div>
  );
}
