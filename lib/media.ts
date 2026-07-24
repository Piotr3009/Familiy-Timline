import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/lib/database.types';

/**
 * Storage layout (private buckets, signed URLs only):
 *   media:   <family_id>/<photo_id>/{original|preview|thumb}.<ext>
 *   avatars: <family_id>/<person_id>.<ext>
 */

export type MediaVariant = 'original' | 'preview' | 'thumb';

export function mediaPath(
  familyId: string,
  photoId: string,
  variant: MediaVariant,
  ext: string
): string {
  return `${familyId}/${photoId}/${variant}.${ext}`;
}

export function avatarPath(familyId: string, personId: string, ext: string): string {
  return `${familyId}/${personId}.${ext}`;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Signed URL for a private object. The caller's RLS governs access:
 * signing fails for objects the user may not see.
 */
export async function createSignedUrl(
  supabase: SupabaseClient<Database>,
  bucket: 'media' | 'avatars',
  path: string
): Promise<string | null> {
  const {data, error} = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Batch variant — one round trip for gallery pages. */
export async function createSignedUrls(
  supabase: SupabaseClient<Database>,
  bucket: 'media' | 'avatars',
  paths: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const {data} = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) result.set(item.path, item.signedUrl);
  }
  return result;
}

export function fileExtension(fileName: string, fallback: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? fallback;
}
