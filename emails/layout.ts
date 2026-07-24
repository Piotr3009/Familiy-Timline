/**
 * Branded HTML shell for all transactional email (Resend). One template
 * family: cream background, amber accent, serif heading — matching the
 * app. All COPY is passed in already-translated (next-intl at the call
 * site); this module contains no user-facing strings.
 */

export type BrandedEmail = {
  /** Preheader + <title>. */
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: {label: string; url: string};
  /** Small print under the button (e.g. expiry note). */
  footnote?: string;
  /** App name for header/footer, translated. */
  appName: string;
};

export function renderBrandedEmail(email: BrandedEmail): string {
  const cta = email.cta
    ? `<tr><td align="center" style="padding: 8px 0 24px 0;">
        <a href="${escapeHtml(email.cta.url)}"
           style="display: inline-block; background-color: #b45309; color: #fffdf8;
                  font-family: Arial, Helvetica, sans-serif; font-size: 16px;
                  font-weight: bold; text-decoration: none; padding: 12px 28px;
                  border-radius: 8px;">
          ${escapeHtml(email.cta.label)}
        </a>
      </td></tr>`
    : '';

  const footnote = email.footnote
    ? `<tr><td style="padding: 0 32px 24px 32px; font-family: Arial, Helvetica, sans-serif;
                      font-size: 13px; color: #9a8d79; text-align: center;">
        ${escapeHtml(email.footnote)}
      </td></tr>`
    : '';

  const paragraphs = email.paragraphs
    .map(
      (p) => `<tr><td style="padding: 0 32px 16px 32px; font-family: Arial, Helvetica,
                    sans-serif; font-size: 16px; line-height: 1.6; color: #2b2118;">
          ${escapeHtml(p)}
        </td></tr>`
    )
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(email.subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3ede1;">
  <span style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(email.subject)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color: #f3ede1; padding: 32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width: 520px; background-color: #fffdf8; border-radius: 16px;
                    border: 1px solid #e6dcc9;">
        <tr><td style="padding: 28px 32px 8px 32px; text-align: center;">
          <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px;
                      color: #b45309; letter-spacing: 0.5px;">
            ${escapeHtml(email.appName)}
          </div>
        </td></tr>
        <tr><td style="padding: 8px 32px 16px 32px; text-align: center;">
          <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif;
                     font-size: 26px; font-weight: normal; color: #2b2118;">
            ${escapeHtml(email.heading)}
          </h1>
        </td></tr>
        ${paragraphs}
        ${cta}
        ${footnote}
      </table>
      <div style="padding: 20px; font-family: Arial, Helvetica, sans-serif; font-size: 12px;
                  color: #9a8d79;">
        ${escapeHtml(email.appName)}
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
