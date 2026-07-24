'use client';

import {useActionState, useEffect, useState} from 'react';
import {useTranslations} from 'next-intl';
import {createInvitationAction, type InviteActionState} from '@/lib/invitations/actions';
import {Alert, Button, Input, Label} from '@/components/ui';

type InviteSummary = {
  status: 'pending' | 'opened' | 'claimed' | 'expired' | 'revoked';
  email: string | null;
  expiresAt: string;
  isExpired: boolean;
  hasPendingClaim: boolean;
} | null;

/**
 * Inviter-side panel on an unclaimed profile: create an invitation,
 * see its status, copy/share the link, re-send with one click.
 */
export function InvitePanel({
  personId,
  personFirstName,
  existing,
  expiresText
}: {
  personId: string;
  personFirstName: string;
  existing: InviteSummary;
  /** Pre-formatted expiry date (dd.mm.yyyy) of the live invitation. */
  expiresText: string | null;
}) {
  const t = useTranslations('invite');
  const tCommon = useTranslations();
  const [copied, setCopied] = useState(false);
  // Resolved after mount to avoid a server/client hydration mismatch.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && 'share' in navigator);
  }, []);
  const [state, formAction, pending] = useActionState(createInvitationAction, {
    error: null
  } as InviteActionState);

  const statusKey = existing
    ? existing.isExpired && (existing.status === 'pending' || existing.status === 'opened')
      ? 'expired'
      : existing.status
    : null;

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URL stays visible for manual copy.
    }
  }

  async function shareLink(url: string) {
    try {
      await navigator.share({url, text: t('shareText', {name: personFirstName})});
    } catch {
      // User cancelled or share unsupported.
    }
  }

  return (
    <div className="space-y-4">
      {existing && statusKey ? (
        <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2 text-sm">
          <span className="text-ink-muted">
            {t('statusLabel')}{' '}
            <span className="font-medium text-ink">{t(`statuses.${statusKey}`)}</span>
            {existing.email ? <span className="text-ink-faint"> · {existing.email}</span> : null}
          </span>
          {expiresText && !existing.isExpired ? (
            <span className="text-xs text-ink-faint">
              {t('validUntil', {date: expiresText})}
            </span>
          ) : null}
        </div>
      ) : null}
      {existing?.hasPendingClaim ? (
        <Alert tone="info">{t('pendingClaimNote')}</Alert>
      ) : null}

      {state.inviteUrl ? (
        <div className="space-y-2">
          <Alert tone="success">
            {state.emailSent ? t('createdAndEmailed') : t('created')}
          </Alert>
          <div className="break-all rounded-lg border border-border bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            {state.inviteUrl}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => copyLink(state.inviteUrl!)}
            >
              {copied ? t('copied') : t('copyLink')}
            </Button>
            {canShare ? (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => shareLink(state.inviteUrl!)}
              >
                {t('share')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{tCommon(state.error)}</Alert> : null}
          <input type="hidden" name="personId" value={personId} />
          <div>
            <Label htmlFor="inviteEmail">
              {t('emailLabel')}{' '}
              <span className="text-ink-faint">({tCommon('common.optional')})</span>
            </Label>
            <Input
              id="inviteEmail"
              name="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              defaultValue={existing?.email ?? ''}
            />
            <p className="mt-1 text-xs text-ink-faint">{t('emailHint')}</p>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? tCommon('common.working')
              : existing
                ? t('resend')
                : t('createInvite')}
          </Button>
        </form>
      )}
    </div>
  );
}
