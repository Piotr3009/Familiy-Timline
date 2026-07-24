import {getFormatter, getTranslations} from 'next-intl/server';
import {classifyValue, isRevertible, parseFieldChanges} from '@/lib/audit/history';
import {RevertButton} from '@/components/history/RevertButton';
import type {AuditLogEntry} from '@/lib/database.types';

/**
 * Read-only edit history for one object (person, event, …), fed with
 * RLS-filtered audit_log entries. Field changes of `update` entries can
 * be reverted by users who may edit the object — a revert is an
 * ordinary update that itself lands in the history.
 */

const FIELD_LABEL_KEYS: Record<string, string> = {
  first_name: 'firstName',
  last_name: 'lastName',
  maiden_name: 'maidenName',
  gender: 'gender',
  birth_year: 'birthYear',
  birth_month: 'birthMonth',
  birth_day: 'birthDay',
  birth_place: 'birthPlace',
  death_year: 'deathYear',
  death_month: 'deathMonth',
  death_day: 'deathDay',
  death_place: 'deathPlace',
  is_deceased: 'isDeceased',
  bio: 'bio',
  avatar_url: 'avatar',
  life_details_privacy: 'lifeDetailsPrivacy',
  title: 'title',
  description: 'description',
  location: 'location',
  event_year: 'eventYear',
  event_month: 'eventMonth',
  event_day: 'eventDay',
  privacy: 'privacy',
  type: 'type',
  status: 'status',
  start_date: 'startDate',
  wedding_date: 'weddingDate',
  separation_date: 'separationDate',
  divorce_date: 'divorceDate',
  parent_role: 'parentRole',
  ended_at: 'endedAt',
  taken_year: 'takenYear',
  taken_month: 'takenMonth',
  taken_day: 'takenDay',
  event_id: 'linkedEvent',
  takeover_reviewed_at: 'takeoverReviewed'
};

async function renderValue(
  table: string,
  column: string,
  value: AuditLogEntry['changed']
): Promise<string> {
  const t = await getTranslations();
  const display = classifyValue(table, column, value as never);
  switch (display.kind) {
    case 'empty':
      return t('history.noValue');
    case 'boolean':
      return display.value ? t('history.yes') : t('history.no');
    case 'token':
      return t(`${display.namespace}.${display.token}`);
    case 'opaque':
      return t('history.valueUpdated');
    case 'text':
      return display.text.length > 80 ? `${display.text.slice(0, 77)}…` : display.text;
  }
}

export async function HistoryPanel({
  entries,
  actorNames,
  rowLabels,
  canEdit,
  revalidate
}: {
  /** RLS-filtered audit entries, newest first. */
  entries: AuditLogEntry[];
  /** actor_user_id -> display name (claimed person in this family). */
  actorNames: Map<string, string>;
  /** Optional row_id -> context label (e.g. which relationship). */
  rowLabels?: Map<string, string>;
  /** Whether the viewer may revert changes on this object. */
  canEdit: boolean;
  /** Path to revalidate after a revert (the current page). */
  revalidate: string;
}) {
  const t = await getTranslations();
  const format = await getFormatter();

  if (entries.length === 0) {
    return <p className="text-sm text-ink-muted">{t('history.empty')}</p>;
  }

  return (
    <ol className="space-y-3">
      {await Promise.all(
        entries.map(async (entry) => {
          const actor =
            (entry.actor_user_id ? actorNames.get(entry.actor_user_id) : null) ??
            t('history.unknownActor');
          const when = format.relativeTime(new Date(entry.created_at));
          const label = rowLabels?.get(entry.row_id);
          const changes = parseFieldChanges(entry);

          return (
            <li key={entry.id} className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
              <p className="text-xs text-ink-faint">
                {actor} · {when}
                {label ? <span> · {label}</span> : null}
              </p>
              {entry.action === 'insert' ? (
                <p className="mt-0.5 text-ink">{t('history.created')}</p>
              ) : entry.action === 'delete' ? (
                <p className="mt-0.5 text-ink">{t('history.deleted')}</p>
              ) : (
                <ul className="mt-0.5 space-y-1">
                  {await Promise.all(
                    changes.map(async (change) => {
                      const fieldKey = FIELD_LABEL_KEYS[change.column];
                      const field = fieldKey
                        ? t(`history.fields.${fieldKey}`)
                        : change.column;
                      const oldText = await renderValue(
                        entry.table_name,
                        change.column,
                        change.oldValue as never
                      );
                      const newText = await renderValue(
                        entry.table_name,
                        change.column,
                        change.newValue as never
                      );
                      return (
                        <li
                          key={change.column}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                        >
                          <span className="text-ink">
                            {t('history.fieldChange', {
                              field,
                              from: oldText,
                              to: newText
                            })}
                          </span>
                          {canEdit && isRevertible(entry.table_name, change.column) ? (
                            <RevertButton
                              auditId={entry.id}
                              column={change.column}
                              revalidate={revalidate}
                            />
                          ) : null}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </li>
          );
        })
      )}
    </ol>
  );
}
