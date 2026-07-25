'use client';

import {useEffect, useRef, type ReactNode} from 'react';

/**
 * Scroll container for the tree. On mount it centers the focus card
 * (the viewer, or the person picked in "Center on") in the viewport —
 * layout math stays on the server, only the initial scroll is client-side.
 */
export function TreeScroller({
  focusX,
  focusY,
  className,
  children
}: {
  /** Center of the focus card, px (TreeLayout.focusCenter). */
  focusX: number;
  focusY: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, focusX - el.clientWidth / 2);
    el.scrollTop = Math.max(0, focusY - el.clientHeight / 2);
  }, [focusX, focusY]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
