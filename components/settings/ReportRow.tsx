'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import {resolveReportAction, type ResolveReportState} from '@/lib/settings/actions';
import {Alert, Button} from '@/components/ui';

export function ReportRow({
  reportId,
  personName,
  reason,
  createdText
}: {
  reportId: string;
  personName: string;
  reason: string;
  createdText: string;
}) {
  const t = useTranslations('settings');
  const tCommon = useTranslations();
  const [state, formAction, pending] = useActionState(resolveReportAction, {
    error: null
  } as ResolveReportState);

  if (state.ok) return <Alert tone="success">{t('reportHandled')}</Alert>;

  return (
    <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
      {state.error ? <Alert tone="error">{tCommon(state.error)}</Alert> : null}
      <p className="text-sm font-medium text-ink">{personName}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{reason}</p>
      <p className="mt-1 text-xs text-ink-faint">{createdText}</p>
      <div className="mt-2 flex gap-2">
        <form action={formAction}>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="outcome" value="resolved" />
          <Button type="submit" className="px-3 py-1.5 text-xs" disabled={pending}>
            {t('markResolved')}
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="outcome" value="dismissed" />
          <Button
            type="submit"
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            disabled={pending}
          >
            {t('dismiss')}
          </Button>
        </form>
      </div>
    </div>
  );
}
