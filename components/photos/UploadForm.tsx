'use client';

import {useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {uploadMedia, type UploadLimits} from '@/lib/photos/client';
import {validatePartialDate} from '@/lib/dates';
import {PRIVACY_LEVELS} from '@/lib/privacy';
import {Alert, Button, Input, Label, Select, Textarea} from '@/components/ui';
import {PartialDateFields} from '@/components/PersonFields';
import type {PrivacyLevel} from '@/lib/database.types';

export function UploadForm({
  familyId,
  limits,
  persons,
  events
}: {
  familyId: string;
  limits: UploadLimits;
  persons: {id: string; name: string}[];
  events: {id: string; label: string}[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('photos.errors.fileRequired');
      return;
    }
    const taken = {
      year: readInt(formData, 'takenYear'),
      month: readInt(formData, 'takenMonth'),
      day: readInt(formData, 'takenDay')
    };
    if (
      Number.isNaN(taken.year) ||
      Number.isNaN(taken.month) ||
      Number.isNaN(taken.day) ||
      validatePartialDate(taken) !== null
    ) {
      setError('persons.errors.invalidDate');
      return;
    }
    const rawPrivacy = String(formData.get('privacy') ?? 'family');
    const privacy: PrivacyLevel = (PRIVACY_LEVELS as string[]).includes(rawPrivacy)
      ? (rawPrivacy as PrivacyLevel)
      : 'family';

    setBusy(true);
    setError(null);
    const result = await uploadMedia(
      {
        file,
        familyId,
        taken,
        location: String(formData.get('location') ?? '').trim() || null,
        description: String(formData.get('description') ?? '').trim() || null,
        eventId: String(formData.get('eventId') ?? '') || null,
        privacy,
        taggedPersonIds: formData.getAll('taggedPersonIds').map(String)
      },
      limits
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    form.reset();
    setFileName(null);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {error ? <Alert tone="error">{t(error)}</Alert> : null}
      {done ? <Alert tone="success">{t('photos.uploaded')}</Alert> : null}
      <div>
        <Label htmlFor="file">{t('photos.fileLabel')}</Label>
        <input
          id="file"
          name="file"
          type="file"
          accept="image/*,video/*"
          required
          onChange={(event) => {
            setDone(false);
            setFileName(event.target.files?.[0]?.name ?? null);
          }}
          className="block w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-amber-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-amber-strong"
        />
        {fileName ? <p className="mt-1 text-xs text-ink-faint">{fileName}</p> : null}
        <p className="mt-1 text-xs text-ink-faint">{t('photos.limitsHint')}</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-muted">
          {t('photos.takenDate')}{' '}
          <span className="text-ink-faint">({t('persons.partialDateHint')})</span>
        </legend>
        <PartialDateFields prefix="taken" />
      </fieldset>
      <div>
        <Label htmlFor="location">{t('photos.location')}</Label>
        <Input id="location" name="location" />
      </div>
      <div>
        <Label htmlFor="description">{t('photos.description')}</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      {events.length > 0 ? (
        <div>
          <Label htmlFor="eventId">{t('photos.linkedEvent')}</Label>
          <Select id="eventId" name="eventId" defaultValue="">
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
        <Select id="privacy" name="privacy" defaultValue="family">
          {PRIVACY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`privacy.${level}`)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t('photos.uploading') : t('photos.uploadButton')}
      </Button>
    </form>
  );
}

function readInt(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}
