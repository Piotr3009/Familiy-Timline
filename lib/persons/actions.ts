'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {validatePartialDate} from '@/lib/dates';
import {isPrivacyLevel} from '@/lib/privacy';
import type {Gender, PartnerStatus} from '@/lib/database.types';

export type ActionState = {error: string | null; ok?: boolean};

/** Relations the quick-add form offers, all anchored to an existing person. */
export const RELATIVE_KINDS = [
  'mother',
  'father',
  'partner',
  'sister',
  'brother',
  'daughter',
  'son'
] as const;
export type RelativeKind = (typeof RELATIVE_KINDS)[number];

const GENDER_FOR_KIND: Partial<Record<RelativeKind, Gender>> = {
  mother: 'female',
  father: 'male',
  sister: 'female',
  brother: 'male',
  daughter: 'female',
  son: 'male'
};

function isGender(value: string): value is Gender {
  return ['male', 'female', 'other', 'unspecified'].includes(value);
}

function readOptionalInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

type PersonFields = {
  firstName: string;
  lastName: string;
  maidenName: string | null;
  gender: Gender | null;
  birth: {year: number | null; month: number | null; day: number | null};
  birthPlace: string | null;
  isDeceased: boolean;
  death: {year: number | null; month: number | null; day: number | null};
  deathPlace: string | null;
};

function readPersonFields(formData: FormData): PersonFields | {fieldError: string} {
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  if (!firstName || !lastName) return {fieldError: 'persons.errors.nameRequired'};
  if (firstName.length > 100 || lastName.length > 100) {
    return {fieldError: 'persons.errors.nameTooLong'};
  }

  const birth = {
    year: readOptionalInt(formData, 'birthYear'),
    month: readOptionalInt(formData, 'birthMonth'),
    day: readOptionalInt(formData, 'birthDay')
  };
  const death = {
    year: readOptionalInt(formData, 'deathYear'),
    month: readOptionalInt(formData, 'deathMonth'),
    day: readOptionalInt(formData, 'deathDay')
  };
  for (const date of [birth, death]) {
    if (
      Number.isNaN(date.year) ||
      Number.isNaN(date.month) ||
      Number.isNaN(date.day) ||
      validatePartialDate({
        year: date.year,
        month: date.month,
        day: date.day
      }) !== null
    ) {
      return {fieldError: 'persons.errors.invalidDate'};
    }
  }

  const isDeceased = formData.get('isDeceased') === 'on';
  const rawGender = String(formData.get('gender') ?? '').trim();
  const maidenName = String(formData.get('maidenName') ?? '').trim() || null;

  return {
    firstName,
    lastName,
    maidenName,
    gender: rawGender && isGender(rawGender) ? rawGender : null,
    birth: birth as PersonFields['birth'],
    birthPlace: String(formData.get('birthPlace') ?? '').trim() || null,
    isDeceased,
    death: isDeceased
      ? (death as PersonFields['death'])
      : {year: null, month: null, day: null},
    deathPlace: isDeceased
      ? String(formData.get('deathPlace') ?? '').trim() || null
      : null
  };
}

/** Onboarding step 1: create the family + the user's own profile. */
export async function createFamilyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const familyName = String(formData.get('familyName') ?? '').trim();
  if (!familyName) return {error: 'onboarding.errors.familyNameRequired'};
  const fields = readPersonFields(formData);
  if ('fieldError' in fields) return {error: fields.fieldError};

  const supabase = await createClient();
  const {error} = await supabase.rpc('create_family_with_profile', {
    p_family_name: familyName,
    p_first_name: fields.firstName,
    p_last_name: fields.lastName,
    p_maiden_name: fields.maidenName,
    p_gender: fields.gender,
    p_birth_year: fields.birth.year,
    p_birth_month: fields.birth.month,
    p_birth_day: fields.birth.day,
    p_birth_place: fields.birthPlace
  });
  if (error) return {error: 'errors.unexpected'};
  revalidatePath('/', 'layout');
  return {error: null, ok: true};
}

/**
 * Adds a relative anchored to an existing person and creates the
 * matching relationship record(s). Used by onboarding and profiles.
 */
export async function addRelativeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const anchorId = String(formData.get('anchorId') ?? '');
  const kind = String(formData.get('kind') ?? '') as RelativeKind;
  if (!anchorId || !RELATIVE_KINDS.includes(kind)) {
    return {error: 'errors.unexpected'};
  }
  const fields = readPersonFields(formData);
  if ('fieldError' in fields) return {error: fields.fieldError};

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const {data: anchor} = await supabase
    .from('persons')
    .select('id, family_id')
    .eq('id', anchorId)
    .maybeSingle();
  if (!anchor || anchor.family_id !== ctx.family.id) {
    return {error: 'errors.person_not_found'};
  }

  const gender = fields.gender ?? GENDER_FOR_KIND[kind] ?? null;

  const {data: created, error: insertError} = await supabase
    .from('persons')
    .insert({
      family_id: ctx.family.id,
      created_by: ctx.user.id,
      managed_by: ctx.user.id,
      first_name: fields.firstName,
      last_name: fields.lastName,
      maiden_name: fields.maidenName,
      gender,
      birth_year: fields.birth.year,
      birth_month: fields.birth.month,
      birth_day: fields.birth.day,
      birth_place: fields.birthPlace,
      is_deceased: fields.isDeceased,
      death_year: fields.death.year,
      death_month: fields.death.month,
      death_day: fields.death.day,
      death_place: fields.deathPlace
    })
    .select('id')
    .single();
  if (insertError || !created) return {error: 'errors.unexpected'};

  const relationshipRows = [];
  if (kind === 'mother' || kind === 'father') {
    relationshipRows.push({
      family_id: ctx.family.id,
      person_a_id: created.id,
      person_b_id: anchorId,
      type: 'parent_child' as const,
      parent_role: 'biological' as const,
      created_by: ctx.user.id
    });
  } else if (kind === 'daughter' || kind === 'son') {
    relationshipRows.push({
      family_id: ctx.family.id,
      person_a_id: anchorId,
      person_b_id: created.id,
      type: 'parent_child' as const,
      parent_role: 'biological' as const,
      created_by: ctx.user.id
    });
    const secondParentId = String(formData.get('secondParentId') ?? '');
    if (secondParentId && secondParentId !== anchorId) {
      relationshipRows.push({
        family_id: ctx.family.id,
        person_a_id: secondParentId,
        person_b_id: created.id,
        type: 'parent_child' as const,
        parent_role: 'biological' as const,
        created_by: ctx.user.id
      });
    }
  } else if (kind === 'sister' || kind === 'brother') {
    relationshipRows.push({
      family_id: ctx.family.id,
      person_a_id: anchorId,
      person_b_id: created.id,
      type: 'sibling' as const,
      created_by: ctx.user.id
    });
  } else {
    const rawStatus = String(formData.get('partnerStatus') ?? 'married');
    const status: PartnerStatus = rawStatus === 'partners' ? 'partners' : 'married';
    relationshipRows.push({
      family_id: ctx.family.id,
      person_a_id: anchorId,
      person_b_id: created.id,
      type: 'partner' as const,
      status,
      created_by: ctx.user.id
    });
  }

  const {error: relError} = await supabase.from('relationships').insert(relationshipRows);
  if (relError) {
    // Compensate: do not leave an unconnected person behind.
    await supabase.from('persons').delete().eq('id', created.id);
    return {error: 'errors.unexpected'};
  }

  revalidatePath('/onboarding');
  revalidatePath('/tree');
  revalidatePath(`/people/${anchorId}`);
  return {error: null, ok: true};
}

/** Edit a profile (own or managed). Ownership columns are DB-protected. */
export async function updatePersonAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const personId = String(formData.get('personId') ?? '');
  if (!personId) return {error: 'errors.unexpected'};
  const fields = readPersonFields(formData);
  if ('fieldError' in fields) return {error: fields.fieldError};

  const rawPrivacy = String(formData.get('lifeDetailsPrivacy') ?? '');
  const bio = String(formData.get('bio') ?? '').trim() || null;

  const supabase = await createClient();
  const {data: updated, error} = await supabase
    .from('persons')
    .update({
      first_name: fields.firstName,
      last_name: fields.lastName,
      maiden_name: fields.maidenName,
      gender: fields.gender,
      birth_year: fields.birth.year,
      birth_month: fields.birth.month,
      birth_day: fields.birth.day,
      birth_place: fields.birthPlace,
      is_deceased: fields.isDeceased,
      death_year: fields.death.year,
      death_month: fields.death.month,
      death_day: fields.death.day,
      death_place: fields.deathPlace,
      bio,
      ...(isPrivacyLevel(rawPrivacy) ? {life_details_privacy: rawPrivacy} : {})
    })
    .eq('id', personId)
    .select('id')
    .maybeSingle();

  if (error) return {error: 'errors.unexpected'};
  if (!updated) return {error: 'persons.errors.notAllowed'};

  revalidatePath(`/people/${personId}`);
  revalidatePath('/tree');
  return {error: null, ok: true};
}

/** Remove an unclaimed profile you manage (mistake cleanup). */
export async function deletePersonAction(formData: FormData): Promise<void> {
  const personId = String(formData.get('personId') ?? '');
  if (!personId) return;
  const supabase = await createClient();
  await supabase.from('persons').delete().eq('id', personId);
  revalidatePath('/tree');
  redirect('/tree');
}
