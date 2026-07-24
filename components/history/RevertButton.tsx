'use client';

import {useActionState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {revertFieldChangeAction} from '@/lib/audit/actions';
import type {ActionState} from '@/lib/persons/actions';

/** One-click revert of a single field change from the History panel. */
export function RevertButton({
  auditId,
  column,
  revalidate
}: {
  auditId: string;
  column: string;
  revalidate: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await revertFieldChangeAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    {error: null} as ActionState
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="auditId" value={auditId} />
      <input type="hidden" name="column" value={column} />
      <input type="hidden" name="revalidate" value={revalidate} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-amber hover:underline disabled:opacity-50"
      >
        {pending ? t('common.working') : t('history.revert')}
      </button>
      {state.error ? (
        <span className="text-xs text-danger">{t(state.error)}</span>
      ) : null}
    </form>
  );
}
