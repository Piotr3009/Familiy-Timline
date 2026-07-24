/**
 * Relations the quick-add form offers, all anchored to an existing person.
 *
 * Lives outside lib/persons/actions.ts on purpose: a 'use server' file may
 * only export async functions, so shared constants/types must be defined in
 * a plain module and imported by both the server actions and client forms.
 */
export const RELATIVE_KINDS = [
  'mother',
  'father',
  'partner',
  'sister',
  'brother',
  'daughter',
  'son'
] as const;

export type RelativeKind = (typeof RELATIVE_KINDS)[number];
