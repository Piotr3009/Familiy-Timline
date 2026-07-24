/**
 * Maps errors raised by database functions (raise exception '<token>')
 * to i18n keys under `errors.*`. Unknown errors fall back to
 * `errors.unexpected`.
 */
const DB_ERROR_TOKENS = [
  'rate_limit_exceeded',
  'invitation_not_found',
  'invitation_expired',
  'invitation_not_active',
  'invitation_already_claimed',
  'person_already_claimed',
  'person_not_found',
  'person_deceased',
  'not_a_family_member',
  'already_has_profile_in_family',
  'no_pending_claim',
  'not_allowed_to_approve',
  'not_authenticated',
  'media_quota_exceeded',
  'file_size_exceeded',
  'video_duration_exceeded'
] as const;

export type DbErrorToken = (typeof DB_ERROR_TOKENS)[number];

export function dbErrorKey(error: unknown): `errors.${DbErrorToken}` | 'errors.unexpected' {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as {message: unknown}).message)
      : String(error);
  for (const token of DB_ERROR_TOKENS) {
    if (message.includes(token)) return `errors.${token}`;
  }
  return 'errors.unexpected';
}
