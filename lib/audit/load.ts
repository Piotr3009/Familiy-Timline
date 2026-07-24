import type {SupabaseClient} from '@supabase/supabase-js';
import type {AuditLogEntry, Database} from '@/lib/database.types';

/**
 * Loads RLS-filtered audit history for one object page. Multiple
 * (table, rowIds) scopes are merged newest-first — the person page shows
 * profile changes together with changes to the person's relationships.
 */
export async function loadHistory(
  supabase: SupabaseClient<Database>,
  scopes: Array<{table: string; rowIds: string[]}>,
  limit = 50
): Promise<AuditLogEntry[]> {
  const lists = await Promise.all(
    scopes
      .filter((scope) => scope.rowIds.length > 0)
      .map(async (scope) => {
        const {data} = await supabase
          .from('audit_log')
          .select('*')
          .eq('table_name', scope.table)
          .in('row_id', scope.rowIds)
          .order('created_at', {ascending: false})
          .limit(limit);
        return data ?? [];
      })
  );
  return lists
    .flat()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

/** actor_user_id -> display name, resolved via claimed profiles. */
export async function loadActorNames(
  supabase: SupabaseClient<Database>,
  familyId: string,
  entries: AuditLogEntry[]
): Promise<Map<string, string>> {
  const actorIds = [
    ...new Set(
      entries
        .map((entry) => entry.actor_user_id)
        .filter((id): id is string => Boolean(id))
    )
  ];
  if (actorIds.length === 0) return new Map();
  const {data: persons} = await supabase
    .from('visible_persons')
    .select('user_id, first_name, last_name')
    .eq('family_id', familyId)
    .in('user_id', actorIds);
  return new Map(
    (persons ?? [])
      .filter((person): person is typeof person & {user_id: string} => Boolean(person.user_id))
      .map((person) => [person.user_id, `${person.first_name} ${person.last_name}`])
  );
}
