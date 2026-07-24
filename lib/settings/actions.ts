'use server';

import {cookies} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
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

/**
 * Tree "all/current relationships" filter — persisted on the account
 * (user metadata) like theme/locale, so it follows the user across
 * devices. Redirects back to the tree with the new filter applied.
 */
export async function setTreePartnerFilterAction(formData: FormData): Promise<void> {
  const filter = String(formData.get('filter') ?? '');
  if (filter !== 'all' && filter !== 'current') return;
  const rawFocus = String(formData.get('focus') ?? '');
  const focus = /^[0-9a-f-]{36}$/i.test(rawFocus) ? rawFocus : null;

  const supabase = await createClient();
  const {
    data: {user}
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.auth.updateUser({data: {tree_partner_filter: filter}});
  }
  revalidatePath('/tree');
  redirect(`/tree?partners=${filter}${focus ? `&focus=${focus}` : ''}`);
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
