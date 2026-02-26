'use client';

import { useId, useEffect, useState, type ReactNode } from 'react';

interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  intensity?: 'subtle' | 'medium' | 'strong';
  chromatic?: boolean;
}

const INTENSITY_CONFIG = {
  subtle: { baseFreq: 0.03, octaves: 3, scale: 2, rOff: 1, gOff: 0.5, bOff: 1.5 },
  medium: { baseFreq: 0.04, octaves: 4, scale: 4, rOff: 2, gOff: 1, bOff: 3 },
  strong: { baseFreq: 0.05, octaves: 4, scale: 6, rOff: 3, gOff: 1.5, bOff: 4 },
} as const;

function useSupportsChromatic(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // SVG filters for backdrop don't work well in Safari/Firefox
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isFirefox = /firefox/i.test(ua);
    const isMobile = /Mobi|Android/i.test(ua);
    setSupported(!isSafari && !isFirefox && !isMobile);
  }, []);
  return supported;
}

/**
 * GlassSurface — Chromatic aberration glass effect.
 * Per-instance SVG filter with three-channel displacement.
 * Falls back to CSS-only backdrop-filter on Safari/Firefox/mobile.
 */
export function GlassSurface({
  children,
  className = '',
  style,
  intensity = 'subtle',
  chromatic,
}: GlassSurfaceProps) {
  const id = useId();
  const safeId = id.replace(/:/g, '_');
  const filterId = `glass-chroma-${safeId}`;
  const supportsChromatic = useSupportsChromatic();
  const useChromatic = chromatic ?? supportsChromatic;
  const config = INTENSITY_CONFIG[intensity];

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {useChromatic && (
        <>
          <svg
            aria-hidden
            style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
          >
            <defs>
              <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
                {/* Generate noise texture */}
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency={config.baseFreq}
                  numOctaves={config.octaves}
                  seed={1}
                  result="noise"
                />

                {/* Red channel displacement */}
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale={config.rOff}
                  xChannelSelector="R"
                  yChannelSelector="G"
                  result="dispR"
                />
                <feColorMatrix
                  in="dispR"
                  type="matrix"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="red"
                />

                {/* Green channel displacement */}
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale={config.gOff}
                  xChannelSelector="G"
                  yChannelSelector="B"
                  result="dispG"
                />
                <feColorMatrix
                  in="dispG"
                  type="matrix"
                  values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                  result="green"
                />

                {/* Blue channel displacement */}
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale={config.bOff}
                  xChannelSelector="B"
                  yChannelSelector="R"
                  result="dispB"
                />
                <feColorMatrix
                  in="dispB"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                  result="blue"
                />

                {/* Recombine channels */}
                <feBlend in="red" in2="green" mode="screen" result="rg" />
                <feBlend in="rg" in2="blue" mode="screen" result="final" />
              </filter>
            </defs>
          </svg>

          {/* Chromatic aberration overlay */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              filter: `url(#${filterId})`,
              opacity: 0.04,
              pointerEvents: 'none',
              zIndex: 1,
              mixBlendMode: 'screen',
            }}
          />
        </>
      )}

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * @deprecated — No longer needed. GlassSurface now uses per-instance filters via useId().
 * Kept for backward compatibility. Remove from layout when ready.
 */
export function GlassSurfaceFilter() {
  return null;
}
