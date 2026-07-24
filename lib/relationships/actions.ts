'use server';

import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {dbErrorKey} from '@/lib/errors';
import {
  isPartnerStatus,
  validateRelationshipDates,
  type RelationshipDates
} from '@/lib/relationships/validate';
import type {ActionState} from '@/lib/persons/actions';

function readDate(formData: FormData, name: string): string | null {
  return String(formData.get(name) ?? '').trim() || null;
}

function readDates(formData: FormData): RelationshipDates {
  return {
    startDate: readDate(formData, 'startDate'),
    weddingDate: readDate(formData, 'weddingDate'),
    separationDate: readDate(formData, 'separationDate'),
    divorceDate: readDate(formData, 'divorceDate')
  };
}

function revalidateRelationshipPages(personA: string, personB: string): void {
  revalidatePath(`/people/${personA}`);
  revalidatePath(`/people/${personB}`);
  revalidatePath('/tree');
}

/** Maps DB failures to friendly errors for the relationship forms. */
function relationshipDbError(error: {code?: string; message?: string}): string {
  if (error.code === '23505') return 'relationships.errors.duplicateActive';
  if (error.code === '23514') return 'relationships.errors.datesRejected';
  if (error.code === '42501') return 'relationships.errors.needsUnclaimed';
  return dbErrorKey(error);
}

/**
 * Links two EXISTING persons as partners. New partners who are not in
 * the tree yet go through the add-relative flow instead. RLS blocks
 * linking two claimed accounts (consent-based linking is Stage 3).
 */
export async function createPartnerRelationshipAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const anchorId = String(formData.get('anchorId') ?? '');
  const otherId = String(formData.get('otherId') ?? '');
  const rawStatus = String(formData.get('status') ?? '');
  if (!anchorId || !otherId || anchorId === otherId || !isPartnerStatus(rawStatus)) {
    return {error: 'errors.unexpected'};
  }
  const dates = readDates(formData);
  const dateError = validateRelationshipDates(dates);
  if (dateError) return {error: `relationships.errors.${dateError}`};

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const {data: endpoints} = await supabase
    .from('persons')
    .select('id, family_id')
    .in('id', [anchorId, otherId]);
  if (
    (endpoints ?? []).length !== 2 ||
    (endpoints ?? []).some((person) => person.family_id !== ctx.family.id)
  ) {
    return {error: 'errors.person_not_found'};
  }

  const {error} = await supabase.from('relationships').insert({
    family_id: ctx.family.id,
    person_a_id: anchorId,
    person_b_id: otherId,
    type: 'partner',
    status: rawStatus,
    start_date: dates.startDate,
    wedding_date: dates.weddingDate,
    separation_date: dates.separationDate,
    divorce_date: dates.divorceDate,
    created_by: ctx.user.id
  });
  if (error) return {error: relationshipDbError(error)};

  revalidateRelationshipPages(anchorId, otherId);
  return {error: null, ok: true};
}

/** Edit status + dates of a partner relationship (divorces live here). */
export async function updatePartnerRelationshipAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const relationshipId = String(formData.get('relationshipId') ?? '');
  const rawStatus = String(formData.get('status') ?? '');
  if (!relationshipId || !isPartnerStatus(rawStatus)) return {error: 'errors.unexpected'};
  const dates = readDates(formData);
  const dateError = validateRelationshipDates(dates);
  if (dateError) return {error: `relationships.errors.${dateError}`};

  const supabase = await createClient();
  const {data: existing} = await supabase
    .from('relationships')
    .select('id, type, person_a_id, person_b_id')
    .eq('id', relationshipId)
    .maybeSingle();
  if (!existing || existing.type !== 'partner') return {error: 'errors.unexpected'};

  const {data: updated, error} = await supabase
    .from('relationships')
    .update({
      status: rawStatus,
      start_date: dates.startDate,
      wedding_date: dates.weddingDate,
      separation_date: dates.separationDate,
      divorce_date: dates.divorceDate
    })
    .eq('id', relationshipId)
    .select('id')
    .maybeSingle();
  if (error) return {error: relationshipDbError(error)};
  if (!updated) return {error: 'relationships.errors.notAllowed'};

  revalidateRelationshipPages(existing.person_a_id, existing.person_b_id);
  return {error: null, ok: true};
}

/**
 * One-click "mark as widowed" offered on the surviving partner's
 * relationship after the other partner is recorded as deceased.
 * Never automatic — always a user action.
 */
export async function markWidowedAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const relationshipId = String(formData.get('relationshipId') ?? '');
  if (!relationshipId) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {data: existing} = await supabase
    .from('relationships')
    .select('id, type, status, person_a_id, person_b_id')
    .eq('id', relationshipId)
    .maybeSingle();
  if (
    !existing ||
    existing.type !== 'partner' ||
    !['partners', 'married'].includes(existing.status ?? '')
  ) {
    return {error: 'errors.unexpected'};
  }

  const {data: updated, error} = await supabase
    .from('relationships')
    .update({status: 'widowed'})
    .eq('id', relationshipId)
    .select('id')
    .maybeSingle();
  if (error) return {error: relationshipDbError(error)};
  if (!updated) return {error: 'relationships.errors.notAllowed'};

  revalidateRelationshipPages(existing.person_a_id, existing.person_b_id);
  return {error: null, ok: true};
}
