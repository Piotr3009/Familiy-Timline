/**
 * App-side mirror of the DB can_edit_person predicate (RLS remains the
 * source of truth; this only decides what UI to render).
 * Claimed profile -> owner only; unclaimed -> manager, active guardians,
 * or a family admin when orphaned.
 */
export function canEditPersonRecord(
  person: {id: string; user_id: string | null; managed_by: string | null},
  viewer: {userId: string; isAdmin: boolean; guardedPersonIds: ReadonlySet<string>}
): boolean {
  if (person.user_id === viewer.userId) return true;
  if (person.user_id !== null) return false;
  if (person.managed_by === viewer.userId) return true;
  if (viewer.guardedPersonIds.has(person.id)) return true;
  return person.managed_by === null && viewer.isAdmin;
}
