'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {
  createPartnerRelationshipAction,
  markWidowedAction,
  updatePartnerRelationshipAction
} from '@/lib/relationships/actions';
import {PARTNER_STATUSES} from '@/lib/relationships/validate';
import type {ActionState} from '@/lib/persons/actions';
import {Alert, Button, Input, Label, Select} from '@/components/ui';

const initialState: ActionState = {error: null};

function DateFields({
  defaults
}: {
  defaults?: {
    startDate: string | null;
    weddingDate: string | null;
    separationDate: string | null;
    divorceDate: string | null;
  };
}) {
  const t = useTranslations('relationships');
  const tCommon = useTranslations('common');
  const fields = [
    {name: 'startDate', label: t('startDate'), value: defaults?.startDate},
    {name: 'weddingDate', label: t('weddingDate'), value: defaults?.weddingDate},
    {name: 'separationDate', label: t('separationDate'), value: defaults?.separationDate},
    {name: 'divorceDate', label: t('divorceDate'), value: defaults?.divorceDate}
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name}>
          <Label htmlFor={field.name}>
            {field.label} <span className="text-ink-faint">({tCommon('optional')})</span>
          </Label>
          <Input
            id={field.name}
            name={field.name}
            type="date"
            defaultValue={field.value ?? ''}
          />
        </div>
      ))}
    </div>
  );
}

function StatusSelect({defaultValue}: {defaultValue?: string}) {
  const t = useTranslations('relationships');
  return (
    <div>
      <Label htmlFor="status">{t('statusLabel')}</Label>
      <Select id="status" name="status" defaultValue={defaultValue ?? 'married'}>
        {PARTNER_STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`statuses.${status}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Link an EXISTING person as a partner (with status + dates). */
export function AddRelationshipToggle({
  anchorId,
  options
}: {
  anchorId: string;
  /** Family persons without an ongoing record with the anchor. */
  options: {id: string; name: string}[];
}) {
  const t = useTranslations('relationships');
  const tCommon = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createPartnerRelationshipAction(prev, formData);
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
        {t('addButton')}
      </Button>
    );
  }
  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-4">
      {state.error ? <Alert tone="error">{tCommon(state.error)}</Alert> : null}
      <input type="hidden" name="anchorId" value={anchorId} />
      <div>
        <Label htmlFor="otherId">{t('selectPerson')}</Label>
        <Select id="otherId" name="otherId" defaultValue={options[0]?.id}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-ink-faint">{t('addNewHint')}</p>
      </div>
      <StatusSelect />
      <DateFields />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? tCommon('common.working') : tCommon('common.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tCommon('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Edit status + dates of one partner relationship (records divorces). */
export function EditRelationshipToggle({
  relationship
}: {
  relationship: {
    id: string;
    status: string | null;
    start_date: string | null;
    wedding_date: string | null;
    separation_date: string | null;
    divorce_date: string | null;
  };
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updatePartnerRelationshipAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initialState
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-amber hover:underline"
      >
        {t('common.edit')}
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-2 space-y-3 border-t border-border pt-3">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <input type="hidden" name="relationshipId" value={relationship.id} />
      <StatusSelect defaultValue={relationship.status ?? 'married'} />
      <DateFields
        defaults={{
          startDate: relationship.start_date,
          weddingDate: relationship.wedding_date,
          separationDate: relationship.separation_date,
          divorceDate: relationship.divorce_date
        }}
      />
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

/** One-click widowed update offered after a partner is marked deceased. */
export function MarkWidowedButton({relationshipId}: {relationshipId: string}) {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await markWidowedAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-amber hover:underline disabled:opacity-50"
      >
        {pending ? t('common.working') : t('relationships.markWidowed')}
      </button>
      {state.error ? <span className="text-xs text-danger">{t(state.error)}</span> : null}
    </form>
  );
}
