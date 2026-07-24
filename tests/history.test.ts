import {describe, expect, it} from 'vitest';
import {classifyValue, isRevertible, parseFieldChanges} from '@/lib/audit/history';

describe('parseFieldChanges', () => {
  it('extracts old/new pairs from an update entry', () => {
    const changes = parseFieldChanges({
      action: 'update',
      changed: {
        bio: {old: null, new: 'Hello'},
        birth_year: {old: 1932, new: 1933}
      }
    });
    expect(changes).toEqual([
      {column: 'bio', oldValue: null, newValue: 'Hello'},
      {column: 'birth_year', oldValue: 1932, newValue: 1933}
    ]);
  });

  it('returns nothing for insert and delete entries', () => {
    expect(parseFieldChanges({action: 'insert', changed: {}})).toEqual([]);
    expect(
      parseFieldChanges({action: 'delete', changed: {snapshot: {id: 'x'}}})
    ).toEqual([]);
  });

  it('ignores malformed change payloads', () => {
    expect(
      parseFieldChanges({action: 'update', changed: {bad: 'not-a-pair'} as never})
    ).toEqual([]);
    expect(parseFieldChanges({action: 'update', changed: null})).toEqual([]);
    expect(parseFieldChanges({action: 'update', changed: [1, 2] as never})).toEqual([]);
  });

  it('sorts changes by column for stable rendering', () => {
    const changes = parseFieldChanges({
      action: 'update',
      changed: {
        last_name: {old: 'A', new: 'B'},
        first_name: {old: 'C', new: 'D'}
      }
    });
    expect(changes.map((change) => change.column)).toEqual(['first_name', 'last_name']);
  });
});

describe('isRevertible', () => {
  it('allows plain editable fields', () => {
    expect(isRevertible('persons', 'first_name')).toBe(true);
    expect(isRevertible('events', 'title')).toBe(true);
    expect(isRevertible('relationships', 'status')).toBe(true);
  });

  it('blocks ownership and unknown columns', () => {
    expect(isRevertible('persons', 'user_id')).toBe(false);
    expect(isRevertible('persons', 'managed_by')).toBe(false);
    expect(isRevertible('persons', 'family_id')).toBe(false);
    expect(isRevertible('photos', 'storage_path_original')).toBe(false);
    expect(isRevertible('guardianships', 'ended_at')).toBe(false);
    expect(isRevertible('nonsense', 'first_name')).toBe(false);
  });
});

describe('classifyValue', () => {
  it('maps empty values', () => {
    expect(classifyValue('persons', 'bio', null)).toEqual({kind: 'empty'});
    expect(classifyValue('persons', 'bio', '')).toEqual({kind: 'empty'});
  });

  it('maps booleans and numbers', () => {
    expect(classifyValue('persons', 'is_deceased', true)).toEqual({
      kind: 'boolean',
      value: true
    });
    expect(classifyValue('persons', 'birth_year', 1969)).toEqual({
      kind: 'text',
      text: '1969'
    });
  });

  it('maps enum-ish columns to translation tokens per table', () => {
    expect(classifyValue('persons', 'life_details_privacy', 'private')).toEqual({
      kind: 'token',
      namespace: 'privacy',
      token: 'private'
    });
    expect(classifyValue('events', 'type', 'wedding')).toEqual({
      kind: 'token',
      namespace: 'events.types',
      token: 'wedding'
    });
    expect(classifyValue('relationships', 'status', 'divorced')).toEqual({
      kind: 'token',
      namespace: 'relationships.statuses',
      token: 'divorced'
    });
    // `type` on relationships is NOT an event type.
    expect(classifyValue('relationships', 'type', 'partner')).toEqual({
      kind: 'text',
      text: 'partner'
    });
  });

  it('hides technical values', () => {
    expect(classifyValue('persons', 'avatar_url', 'f1/p1.jpg')).toEqual({kind: 'opaque'});
    expect(classifyValue('photos', 'storage_path_thumb', 'a/b/thumb.jpg')).toEqual({
      kind: 'opaque'
    });
  });
});
