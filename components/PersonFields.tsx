'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Input, Label, Select} from '@/components/ui';
import type {Gender} from '@/lib/database.types';

/**
 * Reusable person form fields (names, gender, partial dates, places).
 * Partial dates are three separate inputs; leave day/month empty when
 * unknown. Field names match lib/persons/actions.ts.
 */

export function PartialDateFields({
  prefix,
  defaults
}: {
  prefix: 'birth' | 'death' | 'taken' | 'event';
  defaults?: {year: number | null; month: number | null; day: number | null};
}) {
  const t = useTranslations('persons');
  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <Label htmlFor={`${prefix}Day`}>{t('dateDay')}</Label>
        <Input
          id={`${prefix}Day`}
          name={`${prefix}Day`}
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          placeholder="—"
          defaultValue={defaults?.day ?? ''}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}Month`}>{t('dateMonth')}</Label>
        <Input
          id={`${prefix}Month`}
          name={`${prefix}Month`}
          type="number"
          min={1}
          max={12}
          inputMode="numeric"
          placeholder="—"
          defaultValue={defaults?.month ?? ''}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}Year`}>{t('dateYear')}</Label>
        <Input
          id={`${prefix}Year`}
          name={`${prefix}Year`}
          type="number"
          min={1}
          max={2200}
          inputMode="numeric"
          placeholder={t('dateYearPlaceholder')}
          defaultValue={defaults?.year ?? ''}
        />
      </div>
    </div>
  );
}

export function PersonFormFields({
  showGender = true,
  showDeceased = true,
  defaults
}: {
  showGender?: boolean;
  showDeceased?: boolean;
  defaults?: {
    firstName?: string;
    lastName?: string;
    maidenName?: string | null;
    gender?: Gender | null;
    birth?: {year: number | null; month: number | null; day: number | null};
    birthPlace?: string | null;
    isDeceased?: boolean;
    death?: {year: number | null; month: number | null; day: number | null};
    deathPlace?: string | null;
  };
}) {
  const t = useTranslations('persons');
  const [deceased, setDeceased] = useState(defaults?.isDeceased ?? false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            maxLength={100}
            defaultValue={defaults?.firstName ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            maxLength={100}
            defaultValue={defaults?.lastName ?? ''}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="maidenName">
          {t('maidenName')} <span className="text-ink-faint">({t('maidenNameHint')})</span>
        </Label>
        <Input
          id="maidenName"
          name="maidenName"
          maxLength={100}
          defaultValue={defaults?.maidenName ?? ''}
        />
      </div>
      {showGender ? (
        <div>
          <Label htmlFor="gender">{t('gender')}</Label>
          <Select id="gender" name="gender" defaultValue={defaults?.gender ?? ''}>
            <option value="">{t('genders.unspecified')}</option>
            <option value="female">{t('genders.female')}</option>
            <option value="male">{t('genders.male')}</option>
            <option value="other">{t('genders.other')}</option>
          </Select>
        </div>
      ) : null}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-muted">
          {t('birthDate')} <span className="text-ink-faint">({t('partialDateHint')})</span>
        </legend>
        <PartialDateFields prefix="birth" defaults={defaults?.birth} />
      </fieldset>
      <div>
        <Label htmlFor="birthPlace">{t('birthPlace')}</Label>
        <Input id="birthPlace" name="birthPlace" defaultValue={defaults?.birthPlace ?? ''} />
      </div>
      {showDeceased ? (
        <>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="isDeceased"
              checked={deceased}
              onChange={(event) => setDeceased(event.target.checked)}
              className="h-4 w-4 accent-amber"
            />
            {t('isDeceased')}
          </label>
          {deceased ? (
            <>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink-muted">
                  {t('deathDate')}
                </legend>
                <PartialDateFields prefix="death" defaults={defaults?.death} />
              </fieldset>
              <div>
                <Label htmlFor="deathPlace">{t('deathPlace')}</Label>
                <Input
                  id="deathPlace"
                  name="deathPlace"
                  defaultValue={defaults?.deathPlace ?? ''}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
