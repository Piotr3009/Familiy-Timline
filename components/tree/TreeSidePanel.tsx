import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {PersonAvatar} from '@/components/ui';
import {personName} from '@/lib/persons/relations';
import type {VisiblePerson} from '@/lib/database.types';
import {formatPartialDate} from '@/lib/dates';

/**
 * Right-hand profile panel on the tree page (approved "Our roots"
 * design): big photo, vitals, closest relatives and a full-profile CTA.
 * Desktop-only; on mobile tapping a card opens the profile instead.
 */
export async function TreeSidePanel({
  person,
  avatarUrl,
  parents,
  spouse,
  childList,
  isYou
}: {
  person: VisiblePerson;
  avatarUrl: string | null;
  parents: VisiblePerson[];
  spouse: VisiblePerson | null;
  childList: VisiblePerson[];
  isYou: boolean;
}) {
  const t = await getTranslations('tree');
  const born = person.birth_year
    ? formatPartialDate({
        year: person.birth_year,
        month: person.birth_month,
        day: person.birth_day
      })
    : null;

  const row = (label: string, content: React.ReactNode) => (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-amber-strong">{label}</p>
      <div className="text-sm text-ink">{content}</div>
    </div>
  );

  const personLink = (p: VisiblePerson) => (
    <Link key={p.id} href={`/people/${p.id}`} className="block hover:text-amber-strong">
      {personName(p)}
      {p.birth_year ? <span className="text-ink-faint"> ({p.birth_year})</span> : null}
    </Link>
  );

  return (
    <aside className="hidden w-80 shrink-0 space-y-4 xl:block">
      <div className="overflow-hidden rounded-card border border-border bg-surface-raised shadow-sm">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={personName(person)}
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center bg-surface-sunken p-6">
            <PersonAvatar
              name={personName(person)}
              src={null}
              size="lg"
              deceased={person.is_deceased}
            />
          </div>
        )}
        <div className="space-y-4 p-4">
          <div>
            <h2 className="font-heading text-xl text-ink">{personName(person)}</h2>
            <p className="text-sm text-ink-muted">
              {person.birth_year ?? ''}
              {isYou ? (
                <span className="ml-2 rounded-full bg-amber px-2 py-0.5 text-[11px] font-medium text-white">
                  {t('you')}
                </span>
              ) : null}
            </p>
          </div>
          {born
            ? row(
                t('panelBorn'),
                <span>
                  {born}
                  {person.birth_place ? `, ${person.birth_place}` : ''}
                </span>
              )
            : null}
          {parents.length > 0 ? row(t('panelParents'), parents.map(personLink)) : null}
          {row(t('panelSpouse'), spouse ? personLink(spouse) : <span className="text-ink-faint">—</span>)}
          {childList.length > 0 ? row(t('panelChildren'), childList.map(personLink)) : null}
          <Link
            href={`/people/${person.id}`}
            className="block rounded-xl bg-amber px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-strong"
          >
            {t('panelView')}
          </Link>
        </div>
      </div>
      <div className="rounded-card border border-border bg-surface-raised/80 p-4">
        <p className="font-heading text-2xl leading-none text-amber">“</p>
        <p className="text-sm italic text-ink-muted">{t('quote')}</p>
      </div>
    </aside>
  );
}
