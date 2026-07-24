import type {PartnerStatus} from '@/lib/database.types';
import {CURRENT_PARTNER_STATUSES} from '@/lib/persons/relations';

/**
 * Partner-relationship helpers shared by the profile UI, server actions
 * and the tree. Plain module (no 'use server') on purpose — see
 * lib/persons/relative-kinds.ts for the pattern.
 */

export const PARTNER_STATUSES: PartnerStatus[] = [
  'partners',
  'married',
  'separated',
  'divorced',
  'former_partner',
  'widowed'
];

/** Statuses rendered with a solid line / treated as ongoing. */
export const ACTIVE_PARTNER_STATUSES: PartnerStatus[] = [...CURRENT_PARTNER_STATUSES];

/** Ended statuses (dashed line; divorce/former also free the pair for a new record). */
export const ENDED_PARTNER_STATUSES: PartnerStatus[] = PARTNER_STATUSES.filter(
  (status) => !ACTIVE_PARTNER_STATUSES.includes(status)
);

/**
 * Statuses that free the pair for a NEW partner record — must match the
 * relationships_partner_active_unique index (20260724000015).
 */
export const TERMINAL_PARTNER_STATUSES: PartnerStatus[] = ['divorced', 'former_partner'];

export function isPartnerStatus(value: string): value is PartnerStatus {
  return (PARTNER_STATUSES as string[]).includes(value);
}

export type RelationshipDates = {
  /** ISO yyyy-mm-dd strings or null — matches the DATE columns. */
  startDate: string | null;
  weddingDate: string | null;
  separationDate: string | null;
  divorceDate: string | null;
};

export type RelationshipDateError =
  | 'wedding_before_start'
  | 'separation_before_start'
  | 'separation_before_wedding'
  | 'divorce_before_start'
  | 'divorce_before_wedding'
  | 'divorce_before_separation'
  | 'invalid_date';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(value: string | null): boolean {
  if (value === null) return false;
  if (!ISO_DATE.test(value)) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  );
}

/**
 * Order rules (each only when both sides are present — partial input is
 * always fine): start ≤ wedding ≤ separation ≤ divorce.
 * ISO strings compare correctly as plain strings.
 */
export function validateRelationshipDates(
  dates: RelationshipDates
): RelationshipDateError | null {
  const {startDate, weddingDate, separationDate, divorceDate} = dates;
  for (const value of [startDate, weddingDate, separationDate, divorceDate]) {
    if (invalid(value)) return 'invalid_date';
  }
  if (weddingDate && startDate && weddingDate < startDate) return 'wedding_before_start';
  if (separationDate && weddingDate && separationDate < weddingDate) {
    return 'separation_before_wedding';
  }
  if (separationDate && startDate && separationDate < startDate) return 'separation_before_start';
  if (divorceDate && separationDate && divorceDate < separationDate) {
    return 'divorce_before_separation';
  }
  if (divorceDate && weddingDate && divorceDate < weddingDate) return 'divorce_before_wedding';
  if (divorceDate && startDate && divorceDate < startDate) return 'divorce_before_start';
  return null;
}
