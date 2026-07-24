'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {validatePartialDate} from '@/lib/dates';
import {isPrivacyLevel} from '@/lib/privacy';
import type {ActionState} from '@/lib/persons/actions';

function readOptionalInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

/** Edit photo metadata, tags and privacy (uploader or admin via RLS). */
export async function updatePhotoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const photoId = String(formData.get('photoId') ?? '');
  if (!photoId) return {error: 'errors.unexpected'};

  const taken = {
    year: readOptionalInt(formData, 'takenYear'),
    month: readOptionalInt(formData, 'takenMonth'),
    day: readOptionalInt(formData, 'takenDay')
  };
  if (
    Number.isNaN(taken.year) ||
    Number.isNaN(taken.month) ||
    Number.isNaN(taken.day) ||
    validatePartialDate(taken) !== null
  ) {
    return {error: 'persons.errors.invalidDate'};
  }

  const rawPrivacy = String(formData.get('privacy') ?? '');
  const eventId = String(formData.get('eventId') ?? '') || null;
  const taggedIds = formData.getAll('taggedPersonIds').map(String);

  const supabase = await createClient();
  const {data: updated, error} = await supabase
    .from('photos')
    .update({
      taken_year: taken.year,
      taken_month: taken.month,
      taken_day: taken.day,
      location: String(formData.get('location') ?? '').trim() || null,
      description: String(formData.get('description') ?? '').trim() || null,
      event_id: eventId,
      ...(isPrivacyLevel(rawPrivacy) ? {privacy: rawPrivacy} : {})
    })
    .eq('id', photoId)
    .select('id')
    .maybeSingle();
  if (error) return {error: 'errors.unexpected'};
  if (!updated) return {error: 'photos.errors.notAllowed'};

  // Reconcile tags: replace the set (photo editors only, enforced by RLS).
  const {data: existingTags} = await supabase
    .from('photo_persons')
    .select('person_id')
    .eq('photo_id', photoId);
  const existing = new Set((existingTags ?? []).map((tag) => tag.person_id));
  const wanted = new Set(taggedIds);
  const toAdd = taggedIds.filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));
  if (toAdd.length > 0) {
    await supabase
      .from('photo_persons')
      .insert(toAdd.map((personId) => ({photo_id: photoId, person_id: personId})));
  }
  if (toRemove.length > 0) {
    await supabase
      .from('photo_persons')
      .delete()
      .eq('photo_id', photoId)
      .in('person_id', toRemove);
  }

  revalidatePath(`/photos/${photoId}`);
  revalidatePath('/photos');
  return {error: null, ok: true};
}

/** Delete a photo/video: storage objects first, then the row. */
export async function deletePhotoAction(formData: FormData): Promise<void> {
  const photoId = String(formData.get('photoId') ?? '');
  if (!photoId) return;
  const supabase = await createClient();

  const {data: photo} = await supabase
    .from('photos')
    .select('storage_path_original, storage_path_preview, storage_path_thumb')
    .eq('id', photoId)
    .maybeSingle();
  if (!photo) redirect('/photos');

  const paths = [
    photo.storage_path_original,
    photo.storage_path_preview,
    photo.storage_path_thumb
  ].filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    await supabase.storage.from('media').remove(paths);
  }
  await supabase.from('photos').delete().eq('id', photoId);
  revalidatePath('/photos');
  redirect('/photos');
}
