'use client';

import {useActionState, useState} from 'react';
import {useTranslations} from 'next-intl';
import {reportPersonAction, type ReportState} from '@/lib/reports/actions';
import {Alert, Button, Label, Textarea} from '@/components/ui';

export function ReportButton({personId}: {personId: string}) {
  const t = useTranslations('report');
  const tCommon = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(reportPersonAction, {
    error: null
  } as ReportState);

  if (state.ok) {
    return <Alert tone="success">{t('submitted')}</Alert>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-faint underline hover:text-danger"
      >
        {t('reportProfile')}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-border p-3">
      {state.error ? <Alert tone="error">{tCommon(state.error)}</Alert> : null}
      <input type="hidden" name="personId" value={personId} />
      <Label htmlFor="reason">{t('reasonLabel')}</Label>
      <Textarea id="reason" name="reason" rows={3} required maxLength={2000} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? tCommon('common.working') : t('submit')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tCommon('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
