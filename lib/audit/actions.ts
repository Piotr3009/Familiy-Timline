'use server';

import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {isRevertible, parseFieldChanges} from '@/lib/audit/history';
import type {ActionState} from '@/lib/persons/actions';

/**
 * Reverts a single field change recorded in the audit log by writing
 * the OLD value back through an ordinary UPDATE. History is append-only:
 * the revert produces a new audit entry; nothing is rewritten.
 *
 * Permissions are enforced by RLS twice over: reading the audit entry
 * requires visibility of the object, and the UPDATE only succeeds for
 * users the table policies allow to edit it.
 */
export async function revertFieldChangeAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auditId = String(formData.get('auditId') ?? '');
  const column = String(formData.get('column') ?? '');
  const revalidate = String(formData.get('revalidate') ?? '');
  if (!auditId || !column) return {error: 'errors.unexpected'};

  const supabase = await createClient();
  const {data: entry} = await supabase
    .from('audit_log')
    .select('*')
    .eq('id', auditId)
    .maybeSingle();
  if (!entry || entry.action !== 'update') return {error: 'errors.unexpected'};
  if (!isRevertible(entry.table_name, column)) return {error: 'errors.unexpected'};

  const change = parseFieldChanges(entry).find((item) => item.column === column);
  if (!change) return {error: 'errors.unexpected'};

  // The three audited tables reverts apply to. The column allow-list
  // (isRevertible) keeps this to plain editable fields.
  const table = entry.table_name as 'persons' | 'events' | 'relationships';
  const {data: updated, error} = await supabase
    .from(table)
    .update({[column]: change.oldValue} as never)
    .eq('id', entry.row_id)
    .select('id')
    .maybeSingle();
  if (error) return {error: 'history.errors.revertFailed'};
  if (!updated) return {error: 'history.errors.notAllowed'};

  if (revalidate.startsWith('/')) revalidatePath(revalidate);
  return {error: null, ok: true};
}
