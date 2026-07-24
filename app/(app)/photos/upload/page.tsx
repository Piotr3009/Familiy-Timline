import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {getAppConfig} from '@/lib/config';
import {personName, sortByBirth} from '@/lib/persons/relations';
import {formatPartialDate} from '@/lib/dates';
import {Card} from '@/components/ui';
import {UploadForm} from '@/components/photos/UploadForm';

export default async function PhotoUploadPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  const config = await getAppConfig(supabase);

  const [{data: personsRaw}, {data: eventsRaw}, {count: photoCount}, {count: videoCount}] =
    await Promise.all([
      supabase.from('visible_persons').select('*').eq('family_id', ctx.family.id),
      supabase
        .from('events')
        .select('id, type, title, event_year, event_month, event_day')
        .eq('family_id', ctx.family.id)
        .order('event_year', {ascending: false})
        .limit(100),
      supabase
        .from('photos')
        .select('id', {count: 'exact', head: true})
        .eq('uploaded_by', ctx.user.id)
        .eq('kind', 'photo'),
      supabase
        .from('photos')
        .select('id', {count: 'exact', head: true})
        .eq('uploaded_by', ctx.user.id)
        .eq('kind', 'video')
    ]);

  const tEvents = await getTranslations('events');
  const events = (eventsRaw ?? []).map((event) => ({
    id: event.id,
    label: `${event.title ?? tEvents(`types.${event.type}`)} · ${formatPartialDate({
      year: event.event_year,
      month: event.event_month,
      day: event.event_day
    })}`
  }));

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-heading text-2xl">{t('photos.uploadTitle')}</h1>
      <p className="text-sm text-ink-muted">
        {t('photos.quotaStatus', {
          photosUsed: photoCount ?? 0,
          photosMax: config.maxPhotosPerUser,
          videosUsed: videoCount ?? 0,
          videosMax: config.maxVideosPerUser
        })}
      </p>
      <Card>
        <UploadForm
          familyId={ctx.family.id}
          limits={{
            maxPhotoBytes: config.maxPhotoFileSizeMb * 1024 * 1024,
            maxVideoBytes: config.maxVideoFileSizeMb * 1024 * 1024,
            maxVideoDurationSec: config.maxVideoDurationSec
          }}
          persons={sortByBirth(personsRaw ?? []).map((person) => ({
            id: person.id,
            name: personName(person)
          }))}
          events={events}
        />
      </Card>
    </div>
  );
}
