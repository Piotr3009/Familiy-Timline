'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {createEventAction, updateEventAction} from '@/lib/events/actions';
import type {ActionState} from '@/lib/persons/actions';
import {EVENT_TYPE_KEYS, EVENT_TYPES} from '@/lib/event-types';
import {PRIVACY_LEVELS} from '@/lib/privacy';
import {Alert, Button, Input, Label, Select, Textarea} from '@/components/ui';
import {PartialDateFields} from '@/components/PersonFields';
import type {EventType, FamilyEvent} from '@/lib/database.types';

export function EventForm({
  event,
  persons,
  participantIds = [],
  defaultParticipantId
}: {
  /** When set, the form edits this event; otherwise it creates one. */
  event?: FamilyEvent;
  persons: {id: string; name: string}[];
  participantIds?: string[];
  defaultParticipantId?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [type, setType] = useState<EventType>(event?.type ?? 'family_gathering');
  const isEdit = Boolean(event);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const action = isEdit ? updateEventAction : createEventAction;
      const result = await action(prev, formData);
      if (result.ok) {
        if (isEdit) {
          router.refresh();
        } else {
          router.push('/events');
        }
      }
      return result;
    },
    {error: null} as ActionState
  );

  const initialTags = isEdit
    ? participantIds
    : defaultParticipantId
      ? [defaultParticipantId]
      : [];

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
      <div>
        <Label htmlFor="type">{t('events.typeLabel')}</Label>
        <Select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
        >
          {EVENT_TYPE_KEYS.map((key) => (
            <option key={key} value={key}>
              {EVENT_TYPES[key].icon} {t(`events.types.${key}`)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="title">
          {t('events.titleLabel')}{' '}
          {type !== 'other' ? (
            <span className="text-ink-faint">({t('common.optional')})</span>
          ) : null}
        </Label>
        <Input
          id="title"
          name="title"
          maxLength={200}
          required={type === 'other'}
          defaultValue={event?.title ?? ''}
          placeholder={t('events.titlePlaceholder')}
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-muted">
          {t('events.dateLabel')}{' '}
          <span className="text-ink-faint">({t('events.yearRequiredHint')})</span>
        </legend>
        <PartialDateFields
          prefix="event"
          defaults={
            event
              ? {year: event.event_year, month: event.event_month, day: event.event_day}
              : undefined
          }
        />
      </fieldset>
      <div>
        <Label htmlFor="location">{t('events.locationLabel')}</Label>
        <Input id="location" name="location" defaultValue={event?.location ?? ''} />
      </div>
      <div>
        <Label htmlFor="description">{t('events.descriptionLabel')}</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description ?? ''}
        />
      </div>
      {persons.length > 0 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-muted">
            {t('events.participantsLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {persons.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-ink-muted has-checked:border-amber has-checked:bg-amber-soft has-checked:text-amber-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber"
              >
                <input
                  type="checkbox"
                  name="participantIds"
                  value={person.id}
                  defaultChecked={initialTags.includes(person.id)}
                  className="sr-only"
                />
                {person.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <Label htmlFor="privacy">{t('events.privacyLabel')}</Label>
        <Select id="privacy" name="privacy" defaultValue={event?.privacy ?? 'family'}>
          {PRIVACY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`privacy.${level}`)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? t('common.working')
          : isEdit
            ? t('common.save')
            : t('events.createButton')}
      </Button>
    </form>
  );
}
