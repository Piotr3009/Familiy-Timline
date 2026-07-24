import {getTranslations} from 'next-intl/server';

export default async function DashboardPage() {
  const t = await getTranslations('nav');
  return <h1 className="font-heading text-2xl">{t('dashboard')}</h1>;
}
