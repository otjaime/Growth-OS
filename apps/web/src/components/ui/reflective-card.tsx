'use client';

import { useRef, useId, type MouseEvent, type ReactNode } from 'react';

interface ReflectiveCardProps {
  children: ReactNode;
  className?: string;
  intensity?: 'subtle' | 'medium' | 'strong';
}

const INTENSITY_CONFIG = {
  subtle: { noiseOpacity: 0.04, sheenOpacity: 0.12, borderOpacity: 0.15 },
  medium: { noiseOpacity: 0.06, sheenOpacity: 0.20, borderOpacity: 0.22 },
  strong: { noiseOpacity: 0.08, sheenOpacity: 0.28, borderOpacity: 0.30 },
} as const;

/**
 * ReflectiveCard — Mouse-tracking specular light card.
 * Adapted from ReactBits ReflectiveCard (no webcam).
 * 4 layers: noise texture, specular sheen, gradient border, content.
 */
export function ReflectiveCard({
  children,
  className = '',
  intensity = 'medium',
}: ReflectiveCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filterId = useId();
  const config = INTENSITY_CONFIG[intensity];

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mouse-x', `${x}%`);
    el.style.setProperty('--mouse-y', `${y}%`);
  };

  const handleMouseLeave = () => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty('--mouse-x', '50%');
    el.style.setProperty('--mouse-y', '-20%');
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
        ['--mouse-x' as string]: '50%',
        ['--mouse-y' as string]: '-20%',
      }}
    >
      {/* Layer 1: SVG noise texture */}
      <svg
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <defs>
          <filter id={filterId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
        </defs>
      </svg>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          filter: `url(#${filterId})`,
          opacity: config.noiseOpacity,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Layer 2: Specular sheen — follows mouse */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: `radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, ${config.sheenOpacity}), transparent 60%)`,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
          zIndex: 2,
          transition: 'opacity 300ms ease',
        }}
      />

      {/* Layer 3: Gradient border */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          padding: '1px',
          background: `linear-gradient(135deg, rgba(255, 255, 255, ${config.borderOpacity}), rgba(255, 255, 255, 0.02) 40%, rgba(255, 255, 255, 0.02) 60%, rgba(255, 255, 255, ${config.borderOpacity * 0.5}))`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />

      {/* Layer 4: Content */}
      <div style={{ position: 'relative', zIndex: 4 }}>
        {children}
      </div>
    </div>
  );
}
