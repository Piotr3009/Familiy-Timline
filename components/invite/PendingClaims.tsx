'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {approveClaimAction, rejectClaimAction} from '@/lib/invitations/actions';
import {Alert, Button} from '@/components/ui';

export type PendingClaim = {
  invitationId: string;
  personName: string;
  claimerEmail: string | null;
};

function ClaimRow({claim}: {claim: PendingClaim}) {
  const t = useTranslations('invite');
  const tCommon = useTranslations();
  const [approveState, approveAction, approving] = useActionState(approveClaimAction, {
    error: null as string | null
  });
  const [rejectState, rejectAction, rejecting] = useActionState(rejectClaimAction, {
    error: null as string | null
  });

  if (approveState.ok) return <Alert tone="success">{t('claimApprovedNote')}</Alert>;
  if (rejectState.ok) return <Alert tone="info">{t('claimRejectedNote')}</Alert>;
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
      {error ? (
        <div className="mb-2">
          <Alert tone="error">{tCommon(error)}</Alert>
        </div>
      ) : null}
      <p className="text-sm text-ink">
        {t('claimQuestion', {
          claimer: claim.claimerEmail ?? t('someone'),
          person: claim.personName
        })}
      </p>
      <div className="mt-2 flex gap-2">
        <form action={approveAction} className="flex-1">
          <input type="hidden" name="invitationId" value={claim.invitationId} />
          <Button type="submit" className="w-full" disabled={approving || rejecting}>
            {approving ? tCommon('common.working') : t('approve')}
          </Button>
        </form>
        <form action={rejectAction} className="flex-1">
          <input type="hidden" name="invitationId" value={claim.invitationId} />
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={approving || rejecting}
          >
            {rejecting ? tCommon('common.working') : t('reject')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function PendingClaims({claims}: {claims: PendingClaim[]}) {
  const t = useTranslations('invite');
  if (claims.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg">{t('pendingClaimsTitle')}</h2>
      {claims.map((claim) => (
        <ClaimRow key={claim.invitationId} claim={claim} />
      ))}
    </section>
  );
}
