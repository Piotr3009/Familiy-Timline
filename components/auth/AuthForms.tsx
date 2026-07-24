'use client';

import {useActionState} from 'react';
import {useTranslations} from 'next-intl';
import Link from 'next/link';
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  type AuthActionState
} from '@/lib/auth/actions';
import {Alert, Button, Input, Label} from '@/components/ui';

const initialState: AuthActionState = {error: null};

function GoogleButton({next, label}: {next: string; label: string}) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" className="w-full">
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
          <path
            fill="currentColor"
            d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
          />
        </svg>
        {label}
      </Button>
    </form>
  );
}

export function LoginForm({next}: {next: string}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <div className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('common.working') : t('auth.signIn')}
        </Button>
      </form>
      <GoogleButton next={next} label={t('auth.continueWithGoogle')} />
      <div className="flex items-center justify-between text-sm">
        <Link className="text-amber hover:underline" href="/forgot-password">
          {t('auth.forgotPassword')}
        </Link>
        <Link
          className="text-amber hover:underline"
          href={`/register?next=${encodeURIComponent(next)}`}
        >
          {t('auth.noAccountYet')}
        </Link>
      </div>
    </div>
  );
}

export function RegisterForm({next}: {next: string}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <div className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="mt-1 text-xs text-ink-faint">{t('auth.passwordHint')}</p>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('common.working') : t('auth.createAccount')}
        </Button>
      </form>
      <GoogleButton next={next} label={t('auth.continueWithGoogle')} />
      <p className="text-center text-sm">
        <Link
          className="text-amber hover:underline"
          href={`/login?next=${encodeURIComponent(next)}`}
        >
          {t('auth.alreadyHaveAccount')}
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(forgotPasswordAction, {
    error: null as string | null,
    sent: false
  });

  if (state.sent) {
    return <Alert tone="success">{t('auth.resetLinkSent')}</Alert>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <div>
        <Label htmlFor="email">{t('auth.email')}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('common.working') : t('auth.sendResetLink')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{t(state.error)}</Alert> : null}
      <div>
        <Label htmlFor="password">{t('auth.newPassword')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="mt-1 text-xs text-ink-faint">{t('auth.passwordHint')}</p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('common.working') : t('auth.setNewPassword')}
      </Button>
    </form>
  );
}
