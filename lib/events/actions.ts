'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {validatePartialDate} from '@/lib/dates';
import {isPrivacyLevel} from '@/lib/privacy';
import {EVENT_TYPES} from '@/lib/event-types';
import type {ActionState} from '@/lib/persons/actions';
import type {EventType} from '@/lib/database.types';

function isEventType(value: string): value is EventType {
  return value in EVENT_TYPES;
}

function readOptionalInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

type EventFields = {
  type: EventType;
  title: string | null;
  description: string | null;
  location: string | null;
  year: number;
  month: number | null;
  day: number | null;
  privacy: 'private' | 'immediate_family' | 'family';
  participantIds: string[];
};

function readEventFields(formData: FormData): EventFields | {fieldError: string} {
  const rawType = String(formData.get('type') ?? '');
  if (!isEventType(rawType)) return {fieldError: 'errors.unexpected'};

  const title = String(formData.get('title') ?? '').trim() || null;
  if (rawType === 'other' && !title) return {fieldError: 'events.errors.titleRequired'};
  if (title && title.length > 200) return {fieldError: 'events.errors.titleTooLong'};

  const year = readOptionalInt(formData, 'eventYear');
  const month = readOptionalInt(formData, 'eventMonth');
  const day = readOptionalInt(formData, 'eventDay');
  if (year === null) return {fieldError: 'events.errors.yearRequired'};
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    validatePartialDate({year, month, day}) !== null
  ) {
    return {fieldError: 'persons.errors.invalidDate'};
  }

  const rawPrivacy = String(formData.get('privacy') ?? 'family');
  return {
    type: rawType,
    title,
    description: String(formData.get('description') ?? '').trim() || null,
    location: String(formData.get('location') ?? '').trim() || null,
    year,
    month,
    day,
    privacy: isPrivacyLevel(rawPrivacy) ? rawPrivacy : 'family',
    participantIds: formData.getAll('participantIds').map(String)
  };
}

export async function createEventAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = readEventFields(formData);
  if ('fieldError' in fields) return {error: fields.fieldError};

  const ctx = await getFamilyContext();
  if (ctx === 'no-user' || ctx === 'no-family') return {error: 'errors.not_authenticated'};
  const supabase = await createClient();

  const {data: created, error} = await supabase
    .from('events')
    .insert({
      family_id: ctx.family.id,
      created_by: ctx.user.id,
      type: fields.type,
      title: fields.title,
      description: fields.description,
      location: fields.location,
      event_year: fields.year,
      event_month: fields.month,
      event_day: fields.day,
      privacy: fields.privacy
    })
    .select('id')
    .single();
  if (error || !created) return {error: 'errors.unexpected'};

  if (fields.participantIds.length > 0) {
    const {error: participantError} = await supabase.from('event_persons').insert(
      fields.participantIds.map((personId) => ({
        event_id: created.id,
        person_id: personId
      }))
    );
    if (participantError) {
      // Compensate: don't leave a half-populated event behind.
      await supabase.from('events').delete().eq('id', created.id);
      return {error: 'errors.unexpected'};
    }
  }

  revalidatePath('/events');
  revalidatePath('/timeline');
  revalidatePath('/dashboard');
  return {error: null, ok: true};
}

export async function updateEventAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return {error: 'errors.unexpected'};
  const fields = readEventFields(formData);
  if ('fieldError' in fields) return {error: fields.fieldError};

  const supabase = await createClient();
  const {data: updated, error} = await supabase
    .from('events')
    .update({
      type: fields.type,
      title: fields.title,
      description: fields.description,
      location: fields.location,
      event_year: fields.year,
      event_month: fields.month,
      event_day: fields.day,
      privacy: fields.privacy
    })
    .eq('id', eventId)
    .select('id')
    .maybeSingle();
  if (error) return {error: 'errors.unexpected'};
  if (!updated) return {error: 'events.errors.notAllowed'};

  const {data: existing} = await supabase
    .from('event_persons')
    .select('person_id')
    .eq('event_id', eventId);
  const current = new Set((existing ?? []).map((row) => row.person_id));
  const wanted = new Set(fields.participantIds);
  const toAdd = fields.participantIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));
  // Add before remove and surface errors: a single stale/invalid id must
  // not silently drop the existing participants while reporting success.
  if (toAdd.length > 0) {
    const {error: addError} = await supabase
      .from('event_persons')
      .insert(toAdd.map((personId) => ({event_id: eventId, person_id: personId})));
    if (addError) return {error: 'errors.unexpected'};
  }
  if (toRemove.length > 0) {
    const {error: removeError} = await supabase
      .from('event_persons')
      .delete()
      .eq('event_id', eventId)
      .in('person_id', toRemove);
    if (removeError) return {error: 'errors.unexpected'};
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/events');
  revalidatePath('/timeline');
  return {error: null, ok: true};
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get('eventId') ?? '');
  if (!eventId) return;
  const supabase = await createClient();
  await supabase.from('events').delete().eq('id', eventId);
  revalidatePath('/events');
  revalidatePath('/timeline');
  redirect('/events');
}
