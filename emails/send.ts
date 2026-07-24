import 'server-only';
import {Resend} from 'resend';

/**
 * Thin Resend wrapper. RESEND_API_KEY and EMAIL_FROM come from the
 * environment (.env.example documents them). Failures are returned, not
 * thrown — an invitation still works via copy-link when email delivery
 * is down.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ok: true} | {ok: false; error: string}> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {ok: false, error: 'email_not_configured'};
  }
  try {
    const resend = new Resend(apiKey);
    const {error} = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html
    });
    if (error) return {ok: false, error: error.message};
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : 'send_failed'};
  }
}
