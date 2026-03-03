'use client';

interface ConfidenceBadgeProps {
  confidence: number | null;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence === null || confidence === undefined) return null;

  const color =
    confidence >= 80
      ? 'text-apple-green bg-[var(--tint-green)]'
      : confidence >= 50
        ? 'text-apple-yellow bg-[var(--tint-yellow)]'
        : 'text-apple-red bg-[var(--tint-red)]';

  const label =
    confidence >= 80 ? 'High' : confidence >= 50 ? 'Medium' : 'Low';

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full font-semibold ${color}`}
      >
        <span className="tabular-nums">{confidence}%</span>
        <span className="opacity-70">{label}</span>
      </span>
      {confidence < 50 && (
        <span className="text-caption text-[var(--foreground-secondary)]/60 italic">
          Limited data
        </span>
      )}
    </div>
  );
}
