'use server';

import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';

/**
 * Auth server actions. Return shape: {error} with an i18n key — the
 * client translates. Redirects happen server-side on success.
 */

export type AuthActionState = {error: string | null};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/**
 * Only allow internal redirect targets. Backslashes are rejected too:
 * URL parsers treat '\' as '/', so '/\evil.com' would resolve to
 * '//evil.com' (protocol-relative external redirect).
 */
function safeNext(next: unknown): string {
  if (
    typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('\\')
  ) {
    return next;
  }
  return '/dashboard';
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email) {
    return {error: 'auth.errors.emailRequired'};
  }
  if (password.length < 8) {
    return {error: 'auth.errors.weakPassword'};
  }

  const supabase = await createClient();
  const {error} = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });

  if (error) {
    if (error.code === 'user_already_exists') {
      return {error: 'auth.errors.emailInUse'};
    }
    if (error.code === 'weak_password') {
      return {error: 'auth.errors.weakPassword'};
    }
    return {error: 'auth.errors.signUpFailed'};
  }
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  const supabase = await createClient();
  const {error} = await supabase.auth.signInWithPassword({email, password});

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return {error: 'auth.errors.emailNotConfirmed'};
    }
    return {error: 'auth.errors.invalidCredentials'};
  }
  redirect(next);
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeNext(formData.get('next'));
  const supabase = await createClient();
  const {data, error} = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`
    }
  });
  if (error || !data.url) {
    redirect('/login?error=oauth');
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function forgotPasswordAction(
  _prev: AuthActionState & {sent?: boolean},
  formData: FormData
): Promise<AuthActionState & {sent?: boolean}> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return {error: 'auth.errors.emailRequired'};

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent('/reset-password')}`
  });
  // Always report success — do not leak which emails exist.
  return {error: null, sent: true};
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) {
    return {error: 'auth.errors.weakPassword'};
  }
  const supabase = await createClient();
  const {error} = await supabase.auth.updateUser({password});
  if (error) {
    return {error: 'auth.errors.resetFailed'};
  }
  redirect('/dashboard');
}
