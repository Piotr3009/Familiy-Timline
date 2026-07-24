import {NextResponse, type NextRequest} from 'next/server';
import type {EmailOtpType} from '@supabase/supabase-js';
import {createClient} from '@/lib/supabase/server';

/**
 * token_hash verification endpoint for custom Supabase email templates
 * (verification / recovery links sent through Resend SMTP), as
 * documented in the README.
 */
export async function GET(request: NextRequest) {
  const {searchParams, origin} = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  if (tokenHash && type) {
    const supabase = await createClient();
    const {error} = await supabase.auth.verifyOtp({type, token_hash: tokenHash});
    if (!error) {
      return NextResponse.redirect(
        `${origin}${type === 'recovery' ? '/reset-password' : next}`
      );
    }
  }
  return NextResponse.redirect(`${origin}/login?error=confirm_failed`);
}
