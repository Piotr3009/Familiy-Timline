'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {updatePersonAction, type ActionState} from '@/lib/persons/actions';
import {PRIVACY_LEVELS} from '@/lib/privacy';
import {Alert, Button, Label, Select, Textarea} from '@/components/ui';
import {PersonFormFields} from '@/components/PersonFields';
import type {VisiblePerson} from '@/lib/database.types';

export function EditPersonForm({person}: {person: VisiblePerson}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updatePersonAction(prev, formData);
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
      <input type="hidden" name="personId" value={person.id} />
      <PersonFormFields
        defaults={{
          firstName: person.first_name,
          lastName: person.last_name,
          maidenName: person.maiden_name,
          gender: person.gender,
          birth: {year: person.birth_year, month: person.birth_month, day: person.birth_day},
          birthPlace: person.birth_place,
          isDeceased: person.is_deceased,
          death: {year: person.death_year, month: person.death_month, day: person.death_day},
          deathPlace: person.death_place
        }}
      />
      <div>
        <Label htmlFor="bio">{t('persons.bio')}</Label>
        <Textarea id="bio" name="bio" rows={4} defaultValue={person.bio ?? ''} />
      </div>
      <div>
        <Label htmlFor="lifeDetailsPrivacy">{t('persons.lifeDetailsPrivacy')}</Label>
        <Select
          id="lifeDetailsPrivacy"
          name="lifeDetailsPrivacy"
          defaultValue={person.life_details_privacy}
        >
          {PRIVACY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`privacy.${level}`)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-ink-faint">{t('persons.lifeDetailsPrivacyHint')}</p>
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
