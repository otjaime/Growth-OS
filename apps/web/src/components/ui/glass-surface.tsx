'use client';

import { type ReactNode } from 'react';

interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  intensity?: 'subtle' | 'medium';
}

/** Hidden SVG filter definitions — place once in the dashboard layout */
export function GlassSurfaceFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        <filter id="glass-surface-subtle">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="glass-surface-medium">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

export function GlassSurface({ children, className = '', intensity = 'subtle' }: GlassSurfaceProps) {
  const filterId = intensity === 'medium' ? 'glass-surface-medium' : 'glass-surface-subtle';
  return (
    <div className={className} style={{ filter: `url(#${filterId})` }}>
      {children}
    </div>
  );
}
