'use client';

import { useRef, useCallback, type MouseEvent, type ReactNode } from 'react';

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
}

/**
 * SpotlightCard — Mouse-tracking radial gradient highlight.
 * Uses CSS custom properties for zero React re-renders on mouse move.
 */
export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(10, 132, 255, 0.08)',
  spotlightSize = 350,
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = divRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-opacity', '1');
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = divRef.current;
    if (!el) return;
    el.style.setProperty('--spot-opacity', '0');
  }, []);

  return (
    <div
      ref={divRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ['--spot-x' as string]: '0px',
        ['--spot-y' as string]: '0px',
        ['--spot-opacity' as string]: '0',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 'var(--spot-opacity)' as unknown as number,
          transition: 'opacity 300ms ease',
          background: `radial-gradient(${spotlightSize}px circle at var(--spot-x) var(--spot-y), ${spotlightColor}, transparent)`,
          borderRadius: 'inherit',
          zIndex: 1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}
