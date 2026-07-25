import Link from 'next/link';
import {PersonAvatar} from '@/components/ui';
import {personName} from '@/lib/persons/relations';
import {lifeSpan} from '@/lib/dates';
import {CARD_H, CARD_W, type TreeLayout, type TreeNodeVariant} from '@/lib/tree';
import {TreeScroller} from '@/components/tree/TreeScroller';

/**
 * Server-rendered tree: absolutely-positioned cards over an SVG edge
 * layer, inside a scroll container (native scrolling = panning that
 * works on every phone). Solid line = current partner, dashed = ended.
 */
export function FamilyTreeView({
  layout,
  avatarUrls,
  endedYearLabel,
  youLabel,
  zoomLabels
}: {
  layout: TreeLayout;
  avatarUrls: Map<string, string>;
  /** Formats the end-year annotation on dashed partner lines. */
  endedYearLabel?: (year: number) => string;
  /** Badge text shown on the viewer's own card ("You"). */
  youLabel?: string;
  /** Omit to hide the zoom bar (e.g. the dashboard mini tree). */
  zoomLabels?: {zoomIn: string; zoomOut: string; fit: string};
}) {
  // Siblings render muted so the couple block reads as the visual core.
  const cardClass: Record<TreeNodeVariant, string> = {
    focus: 'border-amber ring-2 ring-amber/70 bg-surface-raised shadow-md',
    partner: 'border-border bg-surface-raised',
    sibling: 'border-border/70 bg-surface/90 opacity-90',
    relative: 'border-border bg-surface-raised'
  };
  return (
    <TreeScroller
      focusX={layout.focusCenter.x}
      focusY={layout.focusCenter.y}
      contentWidth={layout.width + 48}
      contentHeight={layout.height + 48}
      labels={zoomLabels}
      className="overflow-auto rounded-card border border-border bg-surface-raised/80 pb-14 backdrop-blur-sm"
    >
      <div className="p-6">
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
          {layout.edges.map((edge, index) =>
            edge.endYear && edge.labelAt ? (
              <text
                key={`label-${index}`}
                x={edge.labelAt.x}
                y={edge.labelAt.y}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-ink-faint)"
              >
                {endedYearLabel ? endedYearLabel(edge.endYear) : String(edge.endYear)}
              </text>
            ) : null
          )}
        </svg>
        {layout.nodes.map((node) => (
          <Link
            key={node.person.id}
            href={`/people/${node.person.id}`}
            className={`absolute flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center shadow-sm transition-shadow hover:shadow-md ${cardClass[node.variant]}`}
            style={{left: node.x, top: node.y, width: CARD_W, height: CARD_H}}
          >
            {node.isFocus && youLabel ? (
              <span className="absolute -top-2.5 rounded-full bg-amber px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm">
                {youLabel}
              </span>
            ) : null}
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
    </TreeScroller>
  );
}
