import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {formatDate} from '@/lib/dates';
import {PersonAvatar} from '@/components/ui';
import {
  AddRelationshipToggle,
  EditRelationshipToggle,
  MarkWidowedButton
} from '@/components/people/RelationshipForms';
import type {Relationship} from '@/lib/database.types';

export type RelationshipItem = {
  relationship: Relationship;
  partner: {
    id: string;
    name: string;
    avatarUrl: string | null;
    isDeceased: boolean;
  };
  /** Names of children this couple shares. */
  sharedChildren: string[];
  canEdit: boolean;
  /** Partner recorded deceased while status is partners/married. */
  offerWidowed: boolean;
};

/**
 * The Relationships section of a person profile: every partner record
 * (past and present) with status, dates and shared children. Ending a
 * relationship is a status change — nobody ever disappears from the tree.
 */
export async function RelationshipsSection({
  anchorId,
  items,
  addOptions
}: {
  anchorId: string;
  items: RelationshipItem[];
  addOptions: {id: string; name: string}[];
}) {
  const t = await getTranslations();

  const dateParts = (relationship: Relationship): string[] => {
    const parts: string[] = [];
    if (relationship.start_date) {
      parts.push(`${t('relationships.startDate')}: ${formatDate(relationship.start_date)}`);
    }
    if (relationship.wedding_date) {
      parts.push(`${t('relationships.weddingDate')}: ${formatDate(relationship.wedding_date)}`);
    }
    if (relationship.separation_date) {
      parts.push(
        `${t('relationships.separationDate')}: ${formatDate(relationship.separation_date)}`
      );
    }
    if (relationship.divorce_date) {
      parts.push(`${t('relationships.divorceDate')}: ${formatDate(relationship.divorce_date)}`);
    }
    return parts;
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('relationships.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.relationship.id}
              className="rounded-lg border border-border px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Link href={`/people/${item.partner.id}`} className="shrink-0">
                  <PersonAvatar
                    name={item.partner.name}
                    src={item.partner.avatarUrl}
                    size="sm"
                    deceased={item.partner.isDeceased}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/people/${item.partner.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {item.partner.name}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {item.relationship.status
                      ? t(`relationships.statuses.${item.relationship.status}`)
                      : ''}
                  </p>
                </div>
                {item.canEdit ? (
                  <EditRelationshipToggle relationship={item.relationship} />
                ) : null}
              </div>
              {dateParts(item.relationship).length > 0 ? (
                <p className="mt-1.5 text-xs text-ink-faint">
                  {dateParts(item.relationship).join(' · ')}
                </p>
              ) : null}
              {item.sharedChildren.length > 0 ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {t('relationships.sharedChildren')}: {item.sharedChildren.join(', ')}
                </p>
              ) : null}
              {item.canEdit && item.offerWidowed ? (
                <div className="mt-1.5">
                  <MarkWidowedButton relationshipId={item.relationship.id} />
                  <p className="text-xs text-ink-faint">
                    {t('relationships.markWidowedHint', {name: item.partner.name})}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <AddRelationshipToggle anchorId={anchorId} options={addOptions} />
    </div>
  );
}
