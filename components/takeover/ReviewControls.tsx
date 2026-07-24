'use client';

import {useActionState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {
  removeMyEventParticipationAction,
  removeMyPhotoTagAction
} from '@/lib/takeover/actions';
import type {ActionState} from '@/lib/persons/actions';

const initialState: ActionState = {error: null};

/** "Hide" control on a review item: removes the viewer's own tag. */
export function HideItemButton({
  kind,
  targetId
}: {
  kind: 'photo' | 'event';
  targetId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const action = kind === 'photo' ? removeMyPhotoTagAction : removeMyEventParticipationAction;
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name={kind === 'photo' ? 'photoId' : 'eventId'} value={targetId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-amber hover:underline disabled:opacity-50"
      >
        {pending ? t('common.working') : t('takeover.hide')}
      </button>
      {state.error ? <span className="text-xs text-danger">{t(state.error)}</span> : null}
    </form>
  );
}
