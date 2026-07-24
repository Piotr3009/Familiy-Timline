'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {addGuardianAction, endGuardianshipAction} from '@/lib/guardianships/actions';
import type {ActionState} from '@/lib/persons/actions';
import {Alert, Button, Label, Select} from '@/components/ui';

const initialState: ActionState = {error: null};

export function AddGuardianToggle({
  personId,
  options
}: {
  personId: string;
  /** Family persons eligible as guardians (not the child, not already active). */
  options: {id: string; name: string}[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addGuardianAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initialState
  );

  if (options.length === 0) return null;
  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('guardians.addButton')}
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <input type="hidden" name="personId" value={personId} />
      <div>
        <Label htmlFor="guardianPersonId">{t('guardians.selectGuardian')}</Label>
        <Select id="guardianPersonId" name="guardianPersonId" defaultValue={options[0]?.id}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="guardianType">{t('guardians.typeLabel')}</Label>
        <Select id="guardianType" name="type" defaultValue="parent">
          <option value="parent">{t('guardians.types.parent')}</option>
          <option value="legal_guardian">{t('guardians.types.legal_guardian')}</option>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? t('common.working') : t('common.add')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function EndGuardianshipButton({
  guardianshipId,
  personId
}: {
  guardianshipId: string;
  personId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await endGuardianshipAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="guardianshipId" value={guardianshipId} />
      <input type="hidden" name="personId" value={personId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-danger hover:underline disabled:opacity-50"
      >
        {pending ? t('common.working') : t('guardians.remove')}
      </button>
      {state.error ? <span className="text-xs text-danger">{t(state.error)}</span> : null}
    </form>
  );
}
