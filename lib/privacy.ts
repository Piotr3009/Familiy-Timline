import type {PrivacyLevel} from '@/lib/database.types';

/**
 * Stage 1 privacy levels, ordered from most to least restrictive.
 * Stored as stable keys; translated via i18n (privacy.<key>).
 * The schema enum is extensible for future generation-based levels.
 */
export const PRIVACY_LEVELS: PrivacyLevel[] = ['private', 'immediate_family', 'family'];

export const DEFAULT_PRIVACY: PrivacyLevel = 'family';

export function isPrivacyLevel(value: string): value is PrivacyLevel {
  return (PRIVACY_LEVELS as string[]).includes(value);
}
