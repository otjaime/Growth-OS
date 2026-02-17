'use client';

import { useState, useCallback } from 'react';
import clsx from 'clsx';
import type { Experiment, ExperimentStatus } from './types';
import { KANBAN_STATUSES, STATUS_COLORS, TRANSITIONS } from './types';
import { KanbanCard } from './kanban-card';

interface KanbanBoardProps {
  experiments: Experiment[];
  onStatusChange: (id: string, newStatus: ExperimentStatus) => Promise<void>;
  onEdit: (exp: Experiment) => void;
}

export function KanbanBoard({ experiments, onStatusChange, onEdit }: KanbanBoardProps): React.ReactElement {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ExperimentStatus | null>(null);
  const [invalidDrop, setInvalidDrop] = useState<ExperimentStatus | null>(null);

  const draggedExp = draggedId ? experiments.find((e) => e.id === draggedId) : null;

  const isValidDrop = useCallback((targetStatus: ExperimentStatus): boolean => {
    if (!draggedExp) return false;
    if (draggedExp.status === targetStatus) return false;
    return (TRANSITIONS[draggedExp.status] ?? []).includes(targetStatus);
  }, [draggedExp]);

  const handleDragOver = useCallback((e: React.DragEvent, status: ExperimentStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = isValidDrop(status) ? 'move' : 'none';
    setDragOverColumn(status);
  }, [isValidDrop]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStatus: ExperimentStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedId || !draggedExp) return;

    if (!isValidDrop(targetStatus)) {
      setInvalidDrop(targetStatus);
      setTimeout(() => setInvalidDrop(null), 400);
      return;
    }

    await onStatusChange(draggedId, targetStatus);
    setDraggedId(null);
  }, [draggedId, draggedExp, isValidDrop, onStatusChange]);

  // Group by status, sorted by ICE desc within each column
  const columns = KANBAN_STATUSES.map((status) => {
    const items = experiments
      .filter((e) => e.status === status)
      .sort((a, b) => (b.iceScore ?? 0) - (a.iceScore ?? 0));
    return { status, items };
  });

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map(({ status, items }) => {
        const isOver = dragOverColumn === status;
        const valid = isOver && isValidDrop(status);
        const invalid = invalidDrop === status;

        return (
          <div
            key={status}
            className={clsx(
              'min-w-[240px] flex-1 rounded-xl border transition-all ease-spring',
              isOver && valid && 'border-apple-blue/50 bg-[var(--tint-blue)]',
              isOver && !valid && 'border-apple-red/30',
              invalid && 'border-apple-red/50 bg-red-900/10',
              !isOver && !invalid && 'border-[var(--glass-border)] bg-white/[0.02]',
            )}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, status)}
          >
            {/* Column header */}
            <div className="px-3 py-2.5 border-b border-[var(--glass-border)]">
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                  {status}
                </span>
                <span className="text-xs text-[var(--foreground-secondary)]">{items.length}</span>
              </div>
            </div>

            {/* Column body */}
            <div className="p-2 space-y-2 min-h-[100px] max-h-[calc(100vh-320px)] overflow-y-auto">
              {items.map((exp) => (
                <KanbanCard
                  key={exp.id}
                  exp={exp}
                  onEdit={onEdit}
                  onDragStart={() => setDraggedId(exp.id)}
                  onDragEnd={() => { setDraggedId(null); setDragOverColumn(null); }}
                  onStatusChange={onStatusChange}
                />
              ))}
              {items.length === 0 && (
                <div className="text-xs text-[var(--foreground-secondary)]/50 text-center py-6">
                  No experiments
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
