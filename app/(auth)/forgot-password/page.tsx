import {getTranslations} from 'next-intl/server';
import {Card} from '@/components/ui';
import {ForgotPasswordForm} from '@/components/auth/AuthForms';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <Card>
      <h1 className="font-heading mb-1 text-2xl">{t('forgotTitle')}</h1>
      <p className="mb-4 text-sm text-ink-muted">{t('forgotSubtitle')}</p>
      <ForgotPasswordForm />
    </Card>
  );
}
