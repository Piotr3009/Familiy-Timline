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
    focus:
      'border-amber ring-1 ring-amber/60 bg-surface-raised/95 shadow-[0_10px_24px_rgba(86,58,26,0.16)]',
    partner: 'border-border bg-surface-raised/95 shadow-[0_7px_18px_rgba(86,58,26,0.11)]',
    sibling: 'border-border bg-surface-raised/90 shadow-[0_7px_18px_rgba(86,58,26,0.09)]',
    relative: 'border-border bg-surface-raised/95 shadow-[0_7px_18px_rgba(86,58,26,0.11)]'
  };
  return (
    <TreeScroller
      focusX={layout.focusCenter.x}
      focusY={layout.focusCenter.y}
      contentWidth={layout.width + 48}
      contentHeight={layout.height + 48}
      labels={zoomLabels}
      className="overflow-auto pb-14"
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
              strokeWidth={1.25}
              strokeDasharray={edge.dashed ? '6 5' : undefined}
              strokeLinecap="round"
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
            className={`absolute flex flex-col items-center gap-1 rounded-[15px] border px-2 pb-3 pt-3 text-center transition-shadow hover:shadow-lg ${cardClass[node.variant]}`}
            style={{left: node.x, top: node.y, width: CARD_W, height: CARD_H}}
          >
            {node.isFocus && youLabel ? (
              <span className="absolute -right-px -top-px rounded-bl-[10px] rounded-tr-[13px] bg-amber px-2 py-1 text-[11px] font-medium text-white">
                {youLabel}
              </span>
            ) : null}
            <span
              className={`overflow-hidden rounded-full ${
                node.isFocus ? 'border-2 border-amber' : 'border border-border'
              }`}
            >
              <PersonAvatar
                name={personName(node.person)}
                src={node.person.avatar_url ? avatarUrls.get(node.person.avatar_url) : null}
                size="tree"
                deceased={node.person.is_deceased}
              />
            </span>
            <span className="mt-1 text-[13px] leading-tight text-ink">
              {node.person.first_name}
            </span>
            <span className="font-heading line-clamp-1 text-[15px] leading-tight text-ink">
              {node.person.last_name}
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
