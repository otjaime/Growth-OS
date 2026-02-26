'use client';

/**
 * MeshGradientBg — Ambient animated background for the dashboard.
 * Pure CSS: 3 overlapping radial-gradient blobs that slowly drift.
 * GPU-composited via will-change: transform. Zero JS animation.
 */
export function MeshGradientBg() {
  return (
    <div
      aria-hidden
      className="mesh-gradient-bg"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Blue blob — top-left drift */}
      <div
        style={{
          position: 'absolute',
          width: '60vw',
          height: '60vh',
          top: '-10%',
          left: '-10%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(10, 132, 255, 0.04) 0%, transparent 70%)',
          animation: 'meshDrift1 30s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Purple blob — center-right drift */}
      <div
        style={{
          position: 'absolute',
          width: '50vw',
          height: '50vh',
          top: '30%',
          right: '-5%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(191, 90, 242, 0.03) 0%, transparent 70%)',
          animation: 'meshDrift2 35s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
      {/* Teal blob — bottom-center drift */}
      <div
        style={{
          position: 'absolute',
          width: '55vw',
          height: '55vh',
          bottom: '-15%',
          left: '20%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(48, 209, 88, 0.025) 0%, transparent 70%)',
          animation: 'meshDrift3 40s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
