import Link from 'next/link';
import {PersonAvatar} from '@/components/ui';
import {personName} from '@/lib/persons/relations';
import {lifeSpan} from '@/lib/dates';
import {CARD_H, CARD_W, type TreeLayout} from '@/lib/tree';

/**
 * Server-rendered tree: absolutely-positioned cards over an SVG edge
 * layer, inside a scroll container (native scrolling = panning that
 * works on every phone). Solid line = current partner, dashed = ended.
 */
export function FamilyTreeView({
  layout,
  avatarUrls
}: {
  layout: TreeLayout;
  avatarUrls: Map<string, string>;
}) {
  return (
    <div className="overflow-auto rounded-card border border-border bg-surface-raised p-6">
      <div
        className="relative mx-auto"
        style={{width: layout.width, height: layout.height}}
      >
        <svg
          className="absolute inset-0"
          width={layout.width}
          height={layout.height}
          aria-hidden
        >
          {layout.edges.map((edge, index) => (
            <polyline
              key={index}
              points={edge.points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth={2}
              strokeDasharray={edge.dashed ? '6 5' : undefined}
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {layout.nodes.map((node) => (
          <Link
            key={node.person.id}
            href={`/people/${node.person.id}`}
            className={`absolute flex flex-col items-center gap-1.5 rounded-xl border bg-surface-raised p-3 text-center shadow-sm transition-shadow hover:shadow-md ${
              node.isFocus ? 'border-amber ring-1 ring-amber' : 'border-border'
            }`}
            style={{left: node.x, top: node.y, width: CARD_W, height: CARD_H}}
          >
            <PersonAvatar
              name={personName(node.person)}
              src={node.person.avatar_url ? avatarUrls.get(node.person.avatar_url) : null}
              size="md"
              deceased={node.person.is_deceased}
            />
            <span className="font-heading line-clamp-2 text-sm leading-tight text-ink">
              {personName(node.person)}
            </span>
            <span className="text-xs text-ink-faint">
              {lifeSpan(
                {
                  year: node.person.birth_year,
                  month: node.person.birth_month,
                  day: node.person.birth_day
                },
                {
                  year: node.person.death_year,
                  month: node.person.death_month,
                  day: node.person.death_day
                },
                node.person.is_deceased
              )}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
