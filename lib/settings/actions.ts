'use server';

import {cookies} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {
  isLocale,
  isTheme,
  LOCALE_COOKIE,
  THEME_COOKIE
} from '@/i18n/config';

const COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const
};

/**
 * Language & theme: stored in a cookie (instant effect, works before
 * login) AND on the account (user metadata) so the preference follows
 * the user across devices — the middleware syncs metadata -> cookie.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? '');
  if (!isLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, COOKIE_OPTIONS);
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.auth.updateUser({data: {locale}});
  }
  revalidatePath('/', 'layout');
}

export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = String(formData.get('theme') ?? '');
  if (!isTheme(theme)) return;
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, COOKIE_OPTIONS);
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.auth.updateUser({data: {theme}});
  }
  revalidatePath('/', 'layout');
}

export type ResolveReportState = {error: string | null; ok?: boolean};

export async function resolveReportAction(
  _prev: ResolveReportState,
  formData: FormData
): Promise<ResolveReportState> {
  const reportId = String(formData.get('reportId') ?? '');
  const outcome = String(formData.get('outcome') ?? '');
  if (!reportId || (outcome !== 'resolved' && outcome !== 'dismissed')) {
    return {error: 'errors.unexpected'};
  }
  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  const {data: updated, error} = await supabase
    .from('reports')
    .update({status: outcome, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString()})
    .eq('id', reportId)
    .select('id')
    .maybeSingle();
  if (error || !updated) return {error: 'errors.unexpected'};
  revalidatePath('/settings');
  return {error: null, ok: true};
}
