import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {createSignedUrls} from '@/lib/media';
import {personName, sortByBirth} from '@/lib/persons/relations';
import {Button, EmptyState} from '@/components/ui';
import {PersonFilter} from '@/components/photos/PersonFilter';

const GALLERY_LIMIT = 200;

export default async function PhotosPage({
  searchParams
}: {
  searchParams: Promise<{person?: string}>;
}) {
  const {person: personFilter} = await searchParams;
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const supabase = await createClient();

  let photoIdsForPerson: string[] | null = null;
  if (personFilter) {
    const {data: tagged} = await supabase
      .from('photo_persons')
      .select('photo_id')
      .eq('person_id', personFilter);
    photoIdsForPerson = (tagged ?? []).map((tag) => tag.photo_id);
  }

  let photos: {
    id: string;
    kind: 'photo' | 'video';
    storage_path_thumb: string | null;
    storage_path_original: string;
    description: string | null;
    privacy: 'private' | 'immediate_family' | 'family';
  }[] = [];
  if (photoIdsForPerson === null || photoIdsForPerson.length > 0) {
    let query = supabase
      .from('photos')
      .select('id, kind, storage_path_thumb, storage_path_original, description, privacy')
      .eq('family_id', ctx.family.id)
      .order('created_at', {ascending: false})
      .limit(GALLERY_LIMIT);
    if (photoIdsForPerson !== null) {
      query = query.in('id', photoIdsForPerson);
    }
    photos = (await query).data ?? [];
  }

  const thumbPaths = (photos ?? [])
    .map((photo) => photo.storage_path_thumb)
    .filter((path): path is string => Boolean(path));
  const thumbUrls = await createSignedUrls(supabase, 'media', thumbPaths);

  const {data: personsRaw} = await supabase
    .from('visible_persons')
    .select('*')
    .eq('family_id', ctx.family.id);
  const personOptions = sortByBirth(personsRaw ?? []).map((person) => ({
    id: person.id,
    name: personName(person)
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl">{t('photos.title')}</h1>
        <div className="flex items-center gap-2">
          <PersonFilter
            options={personOptions}
            value={personFilter ?? ''}
            allLabel={t('photos.everyone')}
          />
          <Link href="/photos/upload">
            <Button>{t('photos.addButton')}</Button>
          </Link>
        </div>
      </div>

      {(photos ?? []).length === 0 ? (
        <EmptyState
          icon="🖼️"
          title={t('photos.emptyTitle')}
          hint={t('photos.emptyHint')}
          action={
            <Link href="/photos/upload">
              <Button>{t('photos.addFirst')}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5">
          {(photos ?? []).map((photo) => {
            const thumbUrl = photo.storage_path_thumb
              ? thumbUrls.get(photo.storage_path_thumb)
              : null;
            return (
              <li key={photo.id}>
                <Link
                  href={`/photos/${photo.id}`}
                  aria-label={photo.description || t('photos.openPhoto')}
                  className="group relative block aspect-square overflow-hidden rounded-lg border border-border bg-surface-sunken"
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={photo.description ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl">
                      {photo.kind === 'video' ? '🎞️' : '🖼️'}
                    </span>
                  )}
                  {photo.kind === 'video' ? (
                    <span
                      aria-hidden
                      className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white"
                    >
                      ▶
                    </span>
                  ) : null}
                  {photo.privacy !== 'family' ? (
                    <span
                      aria-hidden
                      className="absolute left-1 top-1 rounded bg-black/50 px-1 text-xs text-white"
                    >
                      🔒
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
