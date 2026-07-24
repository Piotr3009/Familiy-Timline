'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {deletePersonAction} from '@/lib/persons/actions';
import {Button} from '@/components/ui';

/** Manager-only removal of an unclaimed profile, with confirmation. */
export function DeletePersonButton({personId}: {personId: string}) {
  const t = useTranslations('persons');
  const tCommon = useTranslations('common');
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-ink-faint underline hover:text-danger"
      >
        {t('deleteProfile')}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft p-2">
      <span className="text-xs text-danger">{t('deleteConfirm')}</span>
      <form action={deletePersonAction}>
        <input type="hidden" name="personId" value={personId} />
        <Button type="submit" variant="danger" className="px-3 py-1.5 text-xs">
          {tCommon('delete')}
        </Button>
      </form>
      <Button
        type="button"
        variant="ghost"
        className="px-3 py-1.5 text-xs"
        onClick={() => setConfirming(false)}
      >
        {tCommon('cancel')}
      </Button>
    </div>
  );
}
