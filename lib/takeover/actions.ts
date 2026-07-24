'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import type {ActionState} from '@/lib/persons/actions';

/**
 * Post-takeover review actions. The new profile owner walks through
 * what already exists about them and can hide items (remove their own
 * tag/participation — RLS policies from 20260724000017 allow exactly
 * that). "Request removal" of the underlying content notifies the
 * owner via the Stage 2 notification system.
 */

export async function removeMyPhotoTagAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const photoId = String(formData.get('photoId') ?? '');
  if (!photoId) return {error: 'errors.unexpected'};
  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family' || !ctx.person) {
    return {error: 'errors.not_authenticated'};
  }
  const supabase = await createClient();
  const {error} = await supabase
    .from('photo_persons')
    .delete()
    .eq('photo_id', photoId)
    .eq('person_id', ctx.person.id);
  if (error) return {error: 'errors.unexpected'};
  revalidatePath('/profile-review');
  revalidatePath(`/photos/${photoId}`);
  return {error: null, ok: true};
}

export async function removeMyEventParticipationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return {error: 'errors.unexpected'};
  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family' || !ctx.person) {
    return {error: 'errors.not_authenticated'};
  }
  const supabase = await createClient();
  const {error} = await supabase
    .from('event_persons')
    .delete()
    .eq('event_id', eventId)
    .eq('person_id', ctx.person.id);
  if (error) return {error: 'errors.unexpected'};
  revalidatePath('/profile-review');
  revalidatePath(`/events/${eventId}`);
  return {error: null, ok: true};
}

/** Marks the review as done and returns to the dashboard. */
export async function finishTakeoverReviewAction(): Promise<void> {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family' || !ctx.person) redirect('/login');
  const supabase = await createClient();
  await supabase
    .from('persons')
    .update({takeover_reviewed_at: new Date().toISOString()})
    .eq('id', ctx.person.id);
  revalidatePath('/dashboard');
  revalidatePath('/profile-review');
  redirect('/dashboard');
}
