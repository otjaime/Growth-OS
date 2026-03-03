'use client';

import type { ReactNode, CSSProperties } from 'react';

/* ══════════════════════════════════════════════════════════════
   GlassSurface — Lightweight CSS-only glass wrapper.

   All callers already provide their own glass class via className
   (e.g. `card`, `glass-thin`, `glass-elevated`), so this
   component is a thin semantic wrapper — zero overhead, no SVG
   filters, no ResizeObservers, no displacement maps.
   ═══════════════════════════════════════════════════════════ */

interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Visual intensity preset (cosmetic — glass style is driven by className) */
  intensity?: 'subtle' | 'medium' | 'strong';
}

/**
 * GlassSurface — Semantic glass wrapper.
 *
 * Pass `className="card"` for standard glass cards, or
 * `className="glass-thin"` / `className="glass-elevated"` for variants.
 * The `intensity` prop is kept for API compatibility but the visual
 * style is fully controlled by the className.
 */
export function GlassSurface({
  children,
  className = '',
  style,
}: GlassSurfaceProps): JSX.Element {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * @deprecated — No longer needed. Kept for backward compatibility.
 */
export function GlassSurfaceFilter(): null {
  return null;
}
