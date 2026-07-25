'use client';

import {useEffect, useRef, useState, type ReactNode} from 'react';

/**
 * Scroll + zoom container for the tree. Centers the focus card on mount
 * and exposes a small zoom bar (out / percent / in / fit) fixed to the
 * bottom edge of the container, like the approved design.
 */
export function TreeScroller({
  focusX,
  focusY,
  contentWidth,
  contentHeight,
  labels,
  className,
  children
}: {
  focusX: number;
  focusY: number;
  contentWidth: number;
  contentHeight: number;
  labels?: {zoomIn: string; zoomOut: string; fit: string};
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const center = (el: HTMLDivElement, scale: number) => {
    el.scrollLeft = Math.max(0, focusX * scale - el.clientWidth / 2);
    el.scrollTop = Math.max(0, focusY * scale - el.clientHeight / 2);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Auto-fit on mount: wide trees start scaled to the viewport width
    // ("automatic zoom for every screen"), never scaled up past 100%.
    const available = el.clientWidth - 48;
    const initial =
      contentWidth > available
        ? Math.max(0.4, Math.round((available / contentWidth) * 10) / 10)
        : 1;
    setZoom(initial);
    requestAnimationFrame(() => center(el, initial));
    // Re-center only when the focus moves, not on every zoom tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusX, focusY, contentWidth]);

  const applyZoom = (next: number) => {
    const clamped = Math.min(1.4, Math.max(0.4, Math.round(next * 10) / 10));
    setZoom(clamped);
    const el = ref.current;
    if (el) requestAnimationFrame(() => center(el, clamped));
  };

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    const available = el.clientWidth - 48;
    applyZoom(Math.min(1, available / contentWidth));
  };

  return (
    <div className="relative">
      <div ref={ref} className={className}>
        <div
          style={{
            width: contentWidth * zoom,
            height: contentHeight * zoom,
            margin: '0 auto'
          }}
        >
          <div
            style={{
              width: contentWidth,
              height: contentHeight,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {labels ? (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-[17px] border border-border bg-surface-raised/95 px-2 py-1 shadow-[0_7px_20px_rgba(85,57,26,0.12)] backdrop-blur">
          <button
            type="button"
            aria-label={labels.zoomOut}
            onClick={() => applyZoom(zoom - 0.1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-muted hover:bg-surface-sunken"
          >
            −
          </button>
          <span className="min-w-12 text-center text-xs tabular-nums text-ink-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label={labels.zoomIn}
            onClick={() => applyZoom(zoom + 0.1)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-ink-muted hover:bg-surface-sunken"
          >
            +
          </button>
          <button
            type="button"
            onClick={fit}
            className="ml-1 rounded-full bg-amber px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-strong"
          >
            {labels.fit}
          </button>
        </div>
      </div>
      ) : null}
    </div>
  );
}
