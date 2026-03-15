/**
 * Conviction level indicator — 5 dots, filled based on level (1-5).
 * Used in hypothesis pipeline tables and detail pages.
 */
export function ConvictionDots({ level }: { level: number }) {
  return (
    <span className="font-mono text-xs tracking-wider">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={
            i < level
              ? 'text-amber-400'
              : 'text-[var(--foreground-secondary)]/30'
          }
        >
          {'\u25CF'}
        </span>
      ))}
    </span>
  );
}
