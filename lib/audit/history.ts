import type {AuditLogEntry, Json} from '@/lib/database.types';
import {formatDate} from '@/lib/dates';

/**
 * Parsing and display helpers for audit_log entries. Kept in a plain
 * module (no 'use server') so both server components and the revert
 * action can import them.
 *
 * `changed` format (see 20260724000014_guardianships_audit.sql):
 *   update: {column: {"old": ..., "new": ...}}
 *   insert: {}
 *   delete: {"snapshot": {...}}
 */

export type FieldChange = {
  column: string;
  oldValue: Json | null;
  newValue: Json | null;
};

/** Columns whose values are technical and should not be printed. */
const OPAQUE_COLUMNS = new Set([
  'avatar_url',
  'storage_path_original',
  'storage_path_preview',
  'storage_path_thumb'
]);

/**
 * Columns a revert may write, per table. Mirrors what the UI lets users
 * edit; RLS and column grants enforce the same on the DB side.
 */
export const REVERTIBLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  persons: new Set([
    'first_name',
    'last_name',
    'maiden_name',
    'gender',
    'birth_year',
    'birth_month',
    'birth_day',
    'birth_place',
    'death_year',
    'death_month',
    'death_day',
    'death_place',
    'is_deceased',
    'bio',
    'life_details_privacy'
  ]),
  events: new Set([
    'type',
    'title',
    'description',
    'location',
    'event_year',
    'event_month',
    'event_day',
    'privacy'
  ]),
  relationships: new Set([
    'status',
    'start_date',
    'wedding_date',
    'separation_date',
    'divorce_date'
  ])
};

export function isRevertible(table: string, column: string): boolean {
  return REVERTIBLE_COLUMNS[table]?.has(column) ?? false;
}

/** Field changes of an update entry, in a stable order. */
export function parseFieldChanges(entry: Pick<AuditLogEntry, 'action' | 'changed'>): FieldChange[] {
  if (entry.action !== 'update') return [];
  const changed = entry.changed;
  if (typeof changed !== 'object' || changed === null || Array.isArray(changed)) return [];
  const result: FieldChange[] = [];
  for (const [column, value] of Object.entries(changed)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const pair = value as {old?: Json; new?: Json};
    result.push({
      column,
      oldValue: pair.old ?? null,
      newValue: pair.new ?? null
    });
  }
  result.sort((a, b) => a.column.localeCompare(b.column));
  return result;
}

export type DisplayValue =
  | {kind: 'empty'}
  | {kind: 'text'; text: string}
  | {kind: 'boolean'; value: boolean}
  /** Enum-ish values the UI translates (privacy levels, statuses, …). */
  | {kind: 'token'; namespace: string; token: string}
  | {kind: 'opaque'};

/** Translated-token columns, keyed by table (columns like `type` differ). */
const TOKEN_NAMESPACES: Record<string, Record<string, string>> = {
  persons: {
    life_details_privacy: 'privacy',
    gender: 'persons.genders'
  },
  events: {
    privacy: 'privacy',
    type: 'events.types'
  },
  photos: {
    privacy: 'privacy'
  },
  relationships: {
    status: 'relationships.statuses'
  },
  guardianships: {
    type: 'guardians.types'
  }
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Classifies a raw audit value for rendering. The component translates
 * tokens; plain values are printed as text.
 */
export function classifyValue(table: string, column: string, value: Json | null): DisplayValue {
  if (value === null || value === '') return {kind: 'empty'};
  if (OPAQUE_COLUMNS.has(column)) return {kind: 'opaque'};
  if (typeof value === 'boolean') return {kind: 'boolean', value};
  const namespace = TOKEN_NAMESPACES[table]?.[column];
  if (namespace && typeof value === 'string') {
    return {kind: 'token', namespace, token: value};
  }
  if (typeof value === 'number') return {kind: 'text', text: String(value)};
  if (typeof value === 'string') {
    // Timestamps (e.g. guardianships.ended_at) print as dates.
    if (ISO_TIMESTAMP.test(value)) {
      return {kind: 'text', text: formatDate(value)};
    }
    return {kind: 'text', text: value};
  }
  return {kind: 'opaque'};
}
