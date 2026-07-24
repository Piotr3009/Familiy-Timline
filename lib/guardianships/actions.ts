'use server';

import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {dbErrorKey} from '@/lib/errors';
import type {ActionState} from '@/lib/persons/actions';

/**
 * Guardian management. RLS is the enforcement layer: adding requires
 * can_manage_guardians (existing guardians, or any profile editor when
 * none exist yet), ending requires being a guardian, and a DB trigger
 * keeps at least one active guardian on unclaimed profiles.
 */
export async function addGuardianAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const personId = String(formData.get('personId') ?? '');
  const guardianPersonId = String(formData.get('guardianPersonId') ?? '');
  const rawType = String(formData.get('type') ?? 'parent');
  const type = rawType === 'legal_guardian' ? 'legal_guardian' : 'parent';
  if (!personId || !guardianPersonId || personId === guardianPersonId) {
    return {error: 'errors.unexpected'};
  }

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const {error} = await supabase.from('guardianships').insert({
    family_id: ctx.family.id,
    person_id: personId,
    guardian_person_id: guardianPersonId,
    type,
    created_by: ctx.user.id
  });
  if (error) {
    if (error.code === '42501') return {error: 'guardians.errors.notAllowed'};
    if (error.code === '23505') return {error: 'guardians.errors.alreadyGuardian'};
    return {error: dbErrorKey(error)};
  }

  revalidatePath(`/people/${personId}`);
  return {error: null, ok: true};
}

/** Ends (never deletes) a guardianship; the row stays as history. */
export async function endGuardianshipAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const guardianshipId = String(formData.get('guardianshipId') ?? '');
  const personId = String(formData.get('personId') ?? '');
  if (!guardianshipId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {data: updated, error} = await supabase
    .from('guardianships')
    .update({ended_at: new Date().toISOString()})
    .eq('id', guardianshipId)
    .is('ended_at', null)
    .select('id')
    .maybeSingle();
  if (error) return {error: dbErrorKey(error)};
  if (!updated) return {error: 'guardians.errors.notAllowed'};

  if (personId) revalidatePath(`/people/${personId}`);
  return {error: null, ok: true};
}
