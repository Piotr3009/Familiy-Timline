import Link from 'next/link';
import {PersonAvatar} from '@/components/ui';
import {personName} from '@/lib/persons/relations';
import {lifeSpan} from '@/lib/dates';
import {CARD_H, CARD_W, type TreeLayout, type TreeNodeVariant} from '@/lib/tree';

/**
 * Converts an elbow polyline into an SVG path with rounded corners
 * (radius r), matching the soft joins in the approved artwork.
 */
function roundedPath(points: {x: number; y: number}[], r = 9): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(r, inLen / 2, outLen / 2);
    if (radius < 1) {
      d += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const inX = corner.x - ((corner.x - prev.x) / inLen) * radius;
    const inY = corner.y - ((corner.y - prev.y) / inLen) * radius;
    const outX = corner.x + ((next.x - corner.x) / outLen) * radius;
    const outY = corner.y + ((next.y - corner.y) / outLen) * radius;
    d += ` L ${inX} ${inY} Q ${corner.x} ${corner.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x} ${last.y}`;
  return d;
}
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
      'border-[1.5px] border-amber bg-surface-raised shadow-[0_8px_20px_rgba(120,80,30,0.14)]',
    partner: 'border-border bg-surface-raised shadow-[0_5px_14px_rgba(120,80,30,0.08)]',
    sibling: 'border-border bg-surface-raised shadow-[0_5px_14px_rgba(120,80,30,0.08)]',
    relative: 'border-border bg-surface-raised shadow-[0_5px_14px_rgba(120,80,30,0.08)]'
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
              strokeWidth={1.5}
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
            className={`absolute flex flex-col items-center gap-0.5 rounded-2xl border px-2 pb-3 pt-3 text-center transition-shadow hover:shadow-lg ${cardClass[node.variant]}`}
            style={{left: node.x, top: node.y, width: CARD_W, height: CARD_H}}
          >
            {node.isFocus && youLabel ? (
              <span className="absolute -top-2 right-2 rounded-full bg-amber px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm">
                {youLabel}
              </span>
            ) : null}
            <span
              className={`relative overflow-visible rounded-full ${
                node.isFocus ? 'ring-2 ring-amber ring-offset-2 ring-offset-surface-raised' : ''
              }`}
            >
              <PersonAvatar
                name={personName(node.person)}
                src={node.person.avatar_url ? avatarUrls.get(node.person.avatar_url) : null}
                size="tree"
                deceased={node.person.is_deceased}
              />
            </span>
            <span className="mt-1.5 text-sm font-semibold leading-[1.15] tracking-tight text-ink">
              {node.person.first_name}
              <br />
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
