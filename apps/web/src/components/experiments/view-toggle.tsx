'use client';

import { List, Columns3 } from 'lucide-react';
import clsx from 'clsx';
import type { ViewMode } from './types';

interface ViewToggleProps {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps): React.ReactElement {
  return (
    <div className="flex bg-white/[0.03] rounded-lg p-1">
      <button
        onClick={() => onChange('table')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ease-spring',
          view === 'table'
            ? 'bg-[var(--tint-blue)] text-apple-blue'
            : 'text-[var(--foreground-secondary)] hover:bg-white/[0.06]',
        )}
      >
        <List className="h-3.5 w-3.5" />
        Table
      </button>
      <button
        onClick={() => onChange('kanban')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ease-spring',
          view === 'kanban'
            ? 'bg-[var(--tint-blue)] text-apple-blue'
            : 'text-[var(--foreground-secondary)] hover:bg-white/[0.06]',
        )}
      >
        <Columns3 className="h-3.5 w-3.5" />
        Board
      </button>
    </div>
  );
}
