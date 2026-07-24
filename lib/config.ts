import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/lib/database.types';

/**
 * Product limits — ALWAYS read from the config table, never hardcoded.
 * The fallbacks below only guard against a missing row (they mirror the
 * seeded defaults in 20260724000002_config.sql).
 */
export type AppConfig = {
  maxPhotoFileSizeMb: number;
  maxPhotosPerUser: number;
  maxVideoFileSizeMb: number;
  maxVideoDurationSec: number;
  maxVideosPerUser: number;
  inviteValidityDays: number;
  maxInvitesPerUserDay: number;
};

const FALLBACKS: AppConfig = {
  maxPhotoFileSizeMb: 10,
  maxPhotosPerUser: 500,
  maxVideoFileSizeMb: 200,
  maxVideoDurationSec: 180,
  maxVideosPerUser: 10,
  inviteValidityDays: 30,
  maxInvitesPerUserDay: 20
};

const KEY_MAP: Record<keyof AppConfig, string> = {
  maxPhotoFileSizeMb: 'max_photo_file_size_mb',
  maxPhotosPerUser: 'max_photos_per_user',
  maxVideoFileSizeMb: 'max_video_file_size_mb',
  maxVideoDurationSec: 'max_video_duration_sec',
  maxVideosPerUser: 'max_videos_per_user',
  inviteValidityDays: 'invite_validity_days',
  maxInvitesPerUserDay: 'max_invites_per_user_day'
};

export async function getAppConfig(
  supabase: SupabaseClient<Database>
): Promise<AppConfig> {
  const {data} = await supabase.from('config').select('key, value');
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  const result = {...FALLBACKS};
  for (const prop of Object.keys(KEY_MAP) as (keyof AppConfig)[]) {
    const raw = byKey.get(KEY_MAP[prop]);
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(num) && num > 0) result[prop] = num;
  }
  return result;
}
