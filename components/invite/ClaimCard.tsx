'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {claimInvitationAction} from '@/lib/invitations/actions';
import {Alert, Button} from '@/components/ui';

export function ClaimCard({token, personName}: {token: string; personName: string}) {
  const t = useTranslations('invite');
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState(claimInvitationAction, {
    error: null as string | null,
    claimed: false
  });

  if (state.claimed) {
    return <Alert tone="success">{t('claimSubmitted')}</Alert>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{tErrors(state.error)}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink-muted">{t('isThisYou', {name: personName})}</p>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? tErrors('common.working') : t('claimButton')}
      </Button>
      <p className="text-xs text-ink-faint">{t('approvalNote')}</p>
    </form>
  );
}
