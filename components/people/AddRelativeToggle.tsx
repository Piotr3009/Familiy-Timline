'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui';
import {AddRelativeForm} from '@/components/onboarding/OnboardingForms';

export function AddRelativeToggle({
  anchorId,
  anchorName,
  partnerOptions
}: {
  anchorId: string;
  anchorName: string;
  partnerOptions: {id: string; name: string}[];
}) {
  const t = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('addRelative')}
      </Button>
    );
  }
  return (
    <div className="border-t border-border pt-4">
      <AddRelativeForm
        anchorId={anchorId}
        anchorName={anchorName}
        partnerOptions={partnerOptions}
      />
      <Button
        type="button"
        variant="ghost"
        className="mt-2 w-full"
        onClick={() => setOpen(false)}
      >
        {tCommon('close')}
      </Button>
    </div>
  );
}
