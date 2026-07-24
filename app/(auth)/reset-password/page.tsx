import {getTranslations} from 'next-intl/server';
import {Card} from '@/components/ui';
import {ResetPasswordForm} from '@/components/auth/AuthForms';

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <Card>
      <h1 className="font-heading mb-4 text-2xl">{t('resetTitle')}</h1>
      <ResetPasswordForm />
    </Card>
  );
}
