import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {getLocale, getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {setLocaleAction, setThemeAction} from '@/lib/settings/actions';
import {signOutAction} from '@/lib/auth/actions';
import {formatDateTime} from '@/lib/dates';
import {isTheme, locales, THEME_COOKIE, type Theme} from '@/i18n/config';
import {Button, Card} from '@/components/ui';
import {ResetPasswordForm} from '@/components/auth/AuthForms';
import {ReportRow} from '@/components/settings/ReportRow';

const THEMES: Theme[] = ['light', 'dark', 'system'];

function choiceClass(active: boolean): string {
  return active
    ? 'rounded-lg border border-amber bg-amber-soft px-4 py-2 text-sm font-medium text-amber-strong'
    : 'rounded-lg border border-border px-4 py-2 text-sm text-ink-muted hover:bg-surface-sunken';
}

export default async function SettingsPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations();
  const locale = await getLocale();
  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE)?.value ?? 'light';
  const currentTheme: Theme = isTheme(rawTheme) ? rawTheme : 'light';

  let openReports: {
    id: string;
    reason: string;
    personName: string;
    createdAt: string;
  }[] = [];
  if (ctx.role === 'admin') {
    const supabase = await createClient();
    const {data: reports} = await supabase
      .from('reports')
      .select('id, reason, reported_person_id, created_at')
      .eq('family_id', ctx.family.id)
      .eq('status', 'open')
      .order('created_at', {ascending: false});
    if (reports && reports.length > 0) {
      const {data: persons} = await supabase
        .from('visible_persons')
        .select('id, first_name, last_name')
        .in('id', reports.map((report) => report.reported_person_id));
      const nameById = new Map(
        (persons ?? []).map((person) => [person.id, `${person.first_name} ${person.last_name}`])
      );
      openReports = reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        personName: nameById.get(report.reported_person_id) ?? '',
        createdAt: report.created_at
      }));
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-heading text-2xl">{t('settings.title')}</h1>

      <Card>
        <h2 className="font-heading mb-3 text-lg">{t('settings.language')}</h2>
        <div className="flex gap-2">
          {locales.map((code) => (
            <form key={code} action={setLocaleAction}>
              <input type="hidden" name="locale" value={code} />
              <button type="submit" className={choiceClass(locale === code)}>
                {t(`settings.locales.${code}`)}
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-heading mb-3 text-lg">{t('settings.theme')}</h2>
        <div className="flex gap-2">
          {THEMES.map((theme) => (
            <form key={theme} action={setThemeAction}>
              <input type="hidden" name="theme" value={theme} />
              <button type="submit" className={choiceClass(currentTheme === theme)}>
                {t(`settings.themes.${theme}`)}
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="font-heading mb-3 text-lg">{t('settings.account')}</h2>
        <p className="mb-4 text-sm text-ink-muted">
          {t('settings.signedInAs', {email: ctx.user.email ?? ''})}
        </p>
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-amber hover:underline">
            {t('settings.changePassword')}
          </summary>
          <div className="mt-3">
            <ResetPasswordForm />
          </div>
        </details>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            {t('settings.signOut')}
          </Button>
        </form>
      </Card>

      {ctx.role === 'admin' ? (
        <Card>
          <h2 className="font-heading mb-3 text-lg">{t('settings.reportsTitle')}</h2>
          {openReports.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('settings.noReports')}</p>
          ) : (
            <div className="space-y-2">
              {openReports.map((report) => (
                <ReportRow
                  key={report.id}
                  reportId={report.id}
                  personName={report.personName}
                  reason={report.reason}
                  createdText={formatDateTime(report.createdAt)}
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
