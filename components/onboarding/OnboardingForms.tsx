'use client';

import {useActionState, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {addRelativeAction, createFamilyAction, type ActionState} from '@/lib/persons/actions';
import {RELATIVE_KINDS, type RelativeKind} from '@/lib/persons/relative-kinds';
import {Alert, Button, Card, Input, Label, Select} from '@/components/ui';
import {PersonFormFields} from '@/components/PersonFields';

const initialState: ActionState = {error: null};

export function CreateFamilyForm() {
  const t = useTranslations();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createFamilyAction(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initialState
  );

  return (
    <Card>
      <h2 className="font-heading mb-1 text-xl">{t('onboarding.step1Title')}</h2>
      <p className="mb-4 text-sm text-ink-muted">{t('onboarding.step1Subtitle')}</p>
      <form action={formAction} className="space-y-4">
        {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
        <div>
          <Label htmlFor="familyName">{t('onboarding.familyName')}</Label>
          <Input
            id="familyName"
            name="familyName"
            required
            maxLength={120}
            placeholder={t('onboarding.familyNamePlaceholder')}
          />
        </div>
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-ink">{t('onboarding.aboutYou')}</p>
          <PersonFormFields showDeceased={false} />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('common.working') : t('onboarding.createFamily')}
        </Button>
      </form>
    </Card>
  );
}

export function AddRelativeForm({
  anchorId,
  anchorName,
  partnerOptions,
  onDone
}: {
  anchorId: string;
  anchorName: string;
  /** Anchor's current partners — offered as the child's second parent. */
  partnerOptions: {id: string; name: string}[];
  onDone?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [kind, setKind] = useState<RelativeKind>('mother');
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addRelativeAction(prev, formData);
      if (result.ok) {
        setFormKey((value) => value + 1);
        router.refresh();
        onDone?.();
      }
      return result;
    },
    initialState
  );

  const isChild = kind === 'daughter' || kind === 'son';
  const isPartner = kind === 'partner';

  return (
    <form action={formAction} key={formKey} className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      {state.ok ? <Alert tone="success">{t('onboarding.relativeAdded')}</Alert> : null}
      <input type="hidden" name="anchorId" value={anchorId} />
      <div>
        <Label htmlFor="kind">{t('onboarding.relationTo', {name: anchorName})}</Label>
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as RelativeKind)}
        >
          {RELATIVE_KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`relatives.${value}`)}
            </option>
          ))}
        </Select>
      </div>
      {isPartner ? (
        <div>
          <Label htmlFor="partnerStatus">{t('onboarding.partnerStatus')}</Label>
          <Select id="partnerStatus" name="partnerStatus" defaultValue="married">
            <option value="married">{t('relationships.statuses.married')}</option>
            <option value="partners">{t('relationships.statuses.partners')}</option>
          </Select>
        </div>
      ) : null}
      {isChild && partnerOptions.length > 0 ? (
        <div>
          <Label htmlFor="secondParentId">{t('onboarding.secondParent')}</Label>
          <Select id="secondParentId" name="secondParentId" defaultValue={partnerOptions[0]?.id}>
            <option value="">{t('onboarding.secondParentNone')}</option>
            {partnerOptions.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <PersonFormFields />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('common.working') : t('onboarding.addRelative')}
      </Button>
    </form>
  );
}
