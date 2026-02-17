'use client';

import type { Experiment, ExperimentStatus } from './types';
import { STATUS_COLORS, TRANSITIONS } from './types';
import { VerdictBadge } from './ab-results';

interface KanbanCardProps {
  exp: Experiment;
  onEdit: (exp: Experiment) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStatusChange: (id: string, newStatus: ExperimentStatus) => Promise<void>;
}

export function KanbanCard({ exp, onEdit, onDragStart, onDragEnd, onStatusChange }: KanbanCardProps): React.ReactElement {
  const allowed = TRANSITIONS[exp.status] ?? [];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(exp)}
      className="card !p-3 cursor-grab active:cursor-grabbing hover:bg-white/[0.06] transition-all ease-spring"
    >
      <div className="text-sm text-[var(--foreground)] font-medium line-clamp-2 mb-1.5">
        {exp.name}
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        {exp.channel && (
          <span className="text-[10px] text-[var(--foreground-secondary)] bg-white/[0.06] px-1.5 py-0.5 rounded">
            {exp.channel.replace(/_/g, ' ')}
          </span>
        )}
        <span className="text-[10px] text-[var(--foreground-secondary)]">
          {exp.primaryMetric.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center justify-between">
        {exp.iceScore != null ? (
          <span className="text-xs font-semibold text-apple-blue">ICE {exp.iceScore}</span>
        ) : (
          <span />
        )}
        {exp.verdict && <VerdictBadge verdict={exp.verdict} />}
      </div>

      {/* Mobile fallback: status transition buttons */}
      <div className="flex flex-wrap gap-1 mt-2 md:hidden">
        {allowed.map((s) => (
          <button
            key={s}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(exp.id, s);
            }}
            className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[s]}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
