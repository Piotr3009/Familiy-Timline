'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {updatePhotoAction} from '@/lib/photos/actions';
import type {ActionState} from '@/lib/persons/actions';
import {PRIVACY_LEVELS} from '@/lib/privacy';
import {Alert, Button, Input, Label, Select, Textarea} from '@/components/ui';
import {PartialDateFields} from '@/components/PersonFields';
import type {Photo} from '@/lib/database.types';

export function EditPhotoForm({
  photo,
  persons,
  events,
  taggedIds
}: {
  photo: Photo;
  persons: {id: string; name: string}[];
  events: {id: string; label: string}[];
  taggedIds: string[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updatePhotoAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {error: null} as ActionState
  );

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('common.edit')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-4 border-t border-border pt-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <input type="hidden" name="photoId" value={photo.id} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-muted">
          {t('photos.takenDate')}
        </legend>
        <PartialDateFields
          prefix="taken"
          defaults={{year: photo.taken_year, month: photo.taken_month, day: photo.taken_day}}
        />
      </fieldset>
      <div>
        <Label htmlFor="location">{t('photos.location')}</Label>
        <Input id="location" name="location" defaultValue={photo.location ?? ''} />
      </div>
      <div>
        <Label htmlFor="description">{t('photos.description')}</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={photo.description ?? ''}
        />
      </div>
      {events.length > 0 ? (
        <div>
          <Label htmlFor="eventId">{t('photos.linkedEvent')}</Label>
          <Select id="eventId" name="eventId" defaultValue={photo.event_id ?? ''}>
            <option value="">{t('photos.noEvent')}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {persons.length > 0 ? (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-muted">
            {t('photos.whoIsInIt')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {persons.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-ink-muted has-checked:border-amber has-checked:bg-amber-soft has-checked:text-amber-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber"
              >
                <input
                  type="checkbox"
                  name="taggedPersonIds"
                  value={person.id}
                  defaultChecked={taggedIds.includes(person.id)}
                  className="sr-only"
                />
                {person.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <Label htmlFor="privacy">{t('photos.privacyLabel')}</Label>
        <Select id="privacy" name="privacy" defaultValue={photo.privacy}>
          {PRIVACY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`privacy.${level}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? t('common.working') : t('common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
