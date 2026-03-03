'use client';

import { useEffect, useState, useRef, useId, type ReactNode, type CSSProperties } from 'react';

/* ══════════════════════════════════════════════════════════════
   GlassSurface — Liquid Glass (ReactBits-inspired)
   SVG displacement-map backdrop-filter for real glass refraction.
   Falls back to CSS backdrop-filter on Safari/Firefox/mobile.
   ═══════════════════════════════════════════════════════════ */

interface GlassSurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Visual intensity preset */
  intensity?: 'subtle' | 'medium' | 'strong';
  /** Override: border edge width (0–1). Auto-set by intensity. */
  borderWidth?: number;
  /** Override: inner brightness 0–100. Auto-set by intensity. */
  brightness?: number;
  /** Override: inner fill opacity 0–1. Auto-set by intensity. */
  opacity?: number;
  /** Override: inner blur px. Auto-set by intensity. */
  blur?: number;
  /** Override: distortion scale. Auto-set by intensity. */
  distortionScale?: number;
  /** Override: gaussian post-blur. Auto-set by intensity. */
  displace?: number;
  /** Override: saturation multiplier. */
  saturation?: number;
  /** Whether to force the chromatic SVG path even on fallback browsers */
  chromatic?: boolean;
}

/* ── Presets ──────────────────────────────────────────────── */
const INTENSITY = {
  subtle: {
    borderWidth: 0.05,
    brightness: 28,
    opacity: 0.88,
    blur: 8,
    displace: 0,
    distortionScale: -120,
    rOff: 0,
    gOff: 6,
    bOff: 12,
  },
  medium: {
    borderWidth: 0.07,
    brightness: 32,
    opacity: 0.92,
    blur: 11,
    displace: 0,
    distortionScale: -160,
    rOff: 0,
    gOff: 10,
    bOff: 20,
  },
  strong: {
    borderWidth: 0.10,
    brightness: 38,
    opacity: 0.95,
    blur: 14,
    displace: 0.5,
    distortionScale: -200,
    rOff: 0,
    gOff: 14,
    bOff: 28,
  },
} as const;

/* ── Browser detection ───────────────────────────────────── */
function useSupportsSVGBackdrop(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isFirefox = /firefox/i.test(ua);
    const isMobile = /Mobi|Android/i.test(ua);
    if (isSafari || isFirefox || isMobile) {
      setSupported(false);
      return;
    }
    // Verify backdrop-filter with url() actually works
    const div = document.createElement('div');
    div.style.backdropFilter = 'url(#test)';
    setSupported(div.style.backdropFilter !== '');
  }, []);
  return supported;
}

/**
 * GlassSurface — Liquid Glass with SVG displacement refraction.
 * Adapted from ReactBits GlassSurface for the Growth OS design system.
 *
 * How it works:
 *  1. Generates an SVG displacement map (gradient edge + inner fill)
 *  2. Uses feDisplacementMap per-channel (R/G/B) for chromatic refraction
 *  3. Applies the SVG filter via `backdrop-filter: url(#filter)`
 *  4. Falls back to CSS `backdrop-filter: blur()` on unsupported browsers
 */
export function GlassSurface({
  children,
  className = '',
  style,
  intensity = 'subtle',
  borderWidth: bwOverride,
  brightness: brOverride,
  opacity: opOverride,
  blur: blurOverride,
  distortionScale: dsOverride,
  displace: dispOverride,
  saturation: satOverride,
  chromatic,
}: GlassSurfaceProps) {
  const preset = INTENSITY[intensity];
  const borderWidth = bwOverride ?? preset.borderWidth;
  const brightness = brOverride ?? preset.brightness;
  const opVal = opOverride ?? preset.opacity;
  const blurVal = blurOverride ?? preset.blur;
  const distortionScale = dsOverride ?? preset.distortionScale;
  const displaceVal = dispOverride ?? preset.displace;
  const saturation = satOverride ?? 1;
  const { rOff, gOff, bOff } = preset;

  const uniqueId = useId().replace(/:/g, '-');
  const filterId = `lg-filter-${uniqueId}`;
  const redGradId = `lg-rg-${uniqueId}`;
  const blueGradId = `lg-bg-${uniqueId}`;

  const supportsSVG = useSupportsSVGBackdrop();
  const useSVG = chromatic ?? supportsSVG;

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);

  /* ── Generate displacement map SVG as data-URI ────────── */
  const generateDisplacementMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || 400;
    const h = rect?.height || 200;
    const edgeSize = Math.min(w, h) * (borderWidth * 0.5);
    const br = 22; // match --radius-xl

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
        <rect x="0" y="0" width="${w}" height="${h}" rx="${br}" fill="url(#${redGradId})"/>
        <rect x="0" y="0" width="${w}" height="${h}" rx="${br}" fill="url(#${blueGradId})" style="mix-blend-mode:difference"/>
        <rect x="${edgeSize}" y="${edgeSize}" width="${w - edgeSize * 2}" height="${h - edgeSize * 2}" rx="${br}" fill="hsl(0 0% ${brightness}% / ${opVal})" style="filter:blur(${blurVal}px)"/>
      </svg>
    `)}`;
  };

  const updateMap = () => {
    feImageRef.current?.setAttribute('href', generateDisplacementMap());
  };

  /* ── Sync filter params on prop changes ────────────── */
  useEffect(() => {
    if (!useSVG) return;
    updateMap();
    [
      { ref: redChannelRef, offset: rOff },
      { ref: greenChannelRef, offset: gOff },
      { ref: blueChannelRef, offset: bOff },
    ].forEach(({ ref, offset }) => {
      if (ref.current) {
        ref.current.setAttribute('scale', (distortionScale + offset).toString());
        ref.current.setAttribute('xChannelSelector', 'R');
        ref.current.setAttribute('yChannelSelector', 'G');
      }
    });
    gaussianBlurRef.current?.setAttribute('stdDeviation', displaceVal.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSVG, borderWidth, brightness, opVal, blurVal, distortionScale, displaceVal, rOff, gOff, bOff]);

  /* ── ResizeObserver — regenerate map on dimension change ── */
  useEffect(() => {
    if (!useSVG || !containerRef.current) return;
    const ro = new ResizeObserver(() => setTimeout(updateMap, 0));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSVG]);

  const containerStyle: CSSProperties = {
    ...style,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-xl)',
    ['--glass-frost' as string]: 0,
    ['--glass-saturation' as string]: saturation,
    ['--filter-id' as string]: `url(#${filterId})`,
  };

  return (
    <div
      ref={containerRef}
      className={`liquid-glass ${useSVG ? 'liquid-glass--svg' : 'liquid-glass--fallback'} ${className}`}
      style={containerStyle}
    >
      {/* Hidden SVG filter definition */}
      {useSVG && (
        <svg
          aria-hidden
          className="liquid-glass__filter"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
            >
              <feImage
                ref={feImageRef}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />

              {/* Red channel */}
              <feDisplacementMap
                ref={redChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispRed"
              />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="red"
              />

              {/* Green channel */}
              <feDisplacementMap
                ref={greenChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispGreen"
              />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="green"
              />

              {/* Blue channel */}
              <feDisplacementMap
                ref={blueChannelRef}
                in="SourceGraphic"
                in2="map"
                result="dispBlue"
              />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />

              {/* Recombine */}
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="output" />
              <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
            </filter>
          </defs>
        </svg>
      )}

      {/* Content */}
      <div className="liquid-glass__content">
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
