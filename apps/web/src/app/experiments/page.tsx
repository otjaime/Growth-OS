'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, FlaskConical, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';
import { KpiCardSkeleton, TableSkeleton, Skeleton } from '@/components/skeleton';
import {
  type Experiment,
  type ExperimentStatus,
  type SortKey,
  type SortDir,
  type ViewMode,
  STATUSES,
  STATUS_ORDER,
  getDurationDays,
  SummaryCards,
  CreateModal,
  EditModal,
  ExperimentRow,
  SearchBar,
  ViewToggle,
  KanbanBoard,
} from '@/components/experiments';

// ── CSV Export Columns ──────────────────────────────────────

const CSV_COLUMNS = [
  { key: 'name' as const, label: 'Name' },
  { key: 'hypothesis' as const, label: 'Hypothesis' },
  { key: 'status' as const, label: 'Status' },
  { key: 'channel' as const, label: 'Channel', format: (v: unknown) => (v as string | null)?.replace(/_/g, ' ') ?? '' },
  { key: 'primaryMetric' as const, label: 'Primary Metric', format: (v: unknown) => (v as string).replace(/_/g, ' ') },
  { key: 'iceScore' as const, label: 'ICE Score', format: (v: unknown) => v != null ? String(v) : '' },
  { key: 'impact' as const, label: 'Impact', format: (v: unknown) => v != null ? String(v) : '' },
  { key: 'confidence' as const, label: 'Confidence', format: (v: unknown) => v != null ? String(v) : '' },
  { key: 'ease' as const, label: 'Ease', format: (v: unknown) => v != null ? String(v) : '' },
  { key: 'targetLift' as const, label: 'Target Lift %', format: (v: unknown) => v != null ? String(v) : '' },
  { key: 'startDate' as const, label: 'Start Date', format: (v: unknown) => v ? new Date(v as string).toLocaleDateString() : '' },
  { key: 'endDate' as const, label: 'End Date', format: (v: unknown) => v ? new Date(v as string).toLocaleDateString() : '' },
  { key: 'result' as const, label: 'Result', format: (v: unknown) => (v as string | null) ?? '' },
  { key: 'learnings' as const, label: 'Learnings', format: (v: unknown) => (v as string | null) ?? '' },
  { key: 'verdict' as const, label: 'Verdict', format: (v: unknown) => (v as string | null) ?? '' },
];

// ── Sort Logic ──────────────────────────────────────────────

function sortExperiments(list: Experiment[], key: SortKey, dir: SortDir): Experiment[] {
  const sorted = [...list].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name':
        cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        break;
      case 'channel':
        cmp = (a.channel ?? 'zzz').localeCompare(b.channel ?? 'zzz');
        break;
      case 'primaryMetric':
        cmp = a.primaryMetric.localeCompare(b.primaryMetric);
        break;
      case 'iceScore':
        cmp = (a.iceScore ?? 0) - (b.iceScore ?? 0);
        break;
      case 'status':
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        break;
      case 'duration':
        cmp = getDurationDays(a.startDate, a.endDate) - getDurationDays(b.startDate, b.endDate);
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

// ── Sortable Header ─────────────────────────────────────────

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, className }: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}): React.ReactElement {
  const active = currentKey === sortKey;
  return (
    <th
      className={clsx('px-4 py-3 font-medium cursor-pointer select-none hover:text-[var(--foreground)] transition-colors', className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          currentDir === 'asc' ? <ArrowUp className="h-3 w-3 text-apple-blue" /> : <ArrowDown className="h-3 w-3 text-apple-blue" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ── Main Page ───────────────────────────────────────────────

export default function ExperimentsPage() {
  const [allExperiments, setAllExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [editingExp, setEditingExp] = useState<Experiment | null>(null);

  // New state
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('iceScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchExperiments = useCallback(() => {
    setLoading(true);
    apiFetch('/api/experiments')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { experiments: Experiment[] } | null) => {
        if (!data) { setError(true); setLoading(false); return; }
        setAllExperiments(data.experiments);
        setLoading(false);
        setError(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  // Compute counts per status from full list
  const statusCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = { ALL: allExperiments.length };
    for (const s of ['IDEA', 'BACKLOG', 'RUNNING', 'COMPLETED', 'ARCHIVED']) {
      counts[s] = allExperiments.filter((e) => e.status === s).length;
    }
    return counts;
  }, [allExperiments]);

  // Data pipeline: status filter → search → sort
  const displayedExperiments = useMemo(() => {
    let list = statusFilter === 'ALL'
      ? allExperiments
      : allExperiments.filter((e) => e.status === statusFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.hypothesis.toLowerCase().includes(q) ||
        (e.learnings?.toLowerCase().includes(q) ?? false) ||
        (e.result?.toLowerCase().includes(q) ?? false)
      );
    }

    return sortExperiments(list, sortKey, sortDir);
  }, [allExperiments, statusFilter, searchQuery, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const handleStatusChange = useCallback(async (id: string, newStatus: ExperimentStatus) => {
    await apiFetch(`/api/experiments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchExperiments();
  }, [fetchExperiments]);

  const handleExportCSV = useCallback(() => {
    exportToCSV(displayedExperiments, 'experiments', CSV_COLUMNS);
  }, [displayedExperiments]);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Growth Experiments</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load experiments. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-apple-blue" />
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Growth Experiments</h1>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <button
            onClick={handleExportCSV}
            disabled={loading || displayedExperiments.length === 0}
            className="flex items-center gap-1.5 border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] text-xs font-medium px-3 py-1.5 rounded-lg transition-all ease-spring disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <ViewToggle view={viewMode} onChange={setViewMode} />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] text-sm font-medium px-4 py-2 rounded-lg transition-all ease-spring"
          >
            <Plus className="h-4 w-4" />
            New Experiment
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <KpiCardSkeleton key={i} />)}
        </div>
      ) : (
        <SummaryCards allExperiments={allExperiments} />
      )}

      {/* Status filter tabs with counts */}
      {loading ? (
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-20 rounded-md" />)}
        </div>
      ) : (
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all ease-spring flex items-center gap-1.5',
                statusFilter === s
                  ? 'bg-[var(--tint-blue)] text-apple-blue'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06]',
              )}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded-full',
                statusFilter === s ? 'bg-apple-blue/30 text-apple-blue' : 'bg-white/[0.06] text-[var(--foreground-secondary)]/70',
              )}>
                {statusCounts[s] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : displayedExperiments.length === 0 ? (
        <div className="card text-center py-16">
          <FlaskConical className="h-12 w-12 text-[var(--foreground-secondary)]/50 mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)] text-lg">
            {searchQuery
              ? `No experiments matching "${searchQuery}"`
              : statusFilter === 'ALL'
                ? 'No experiments yet. Start by adding your first growth hypothesis.'
                : `No ${statusFilter.toLowerCase()} experiments.`}
          </p>
          {statusFilter === 'ALL' && !searchQuery && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-apple-blue hover:text-apple-blue text-sm font-medium"
            >
              Create your first experiment
            </button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          experiments={displayedExperiments}
          onStatusChange={handleStatusChange}
          onEdit={setEditingExp}
        />
      ) : (
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                <SortHeader label="Experiment" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Channel" sortKey="channel" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Metric" sortKey="primaryMetric" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                <SortHeader label="ICE" sortKey="iceScore" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center" />
                <SortHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                <SortHeader label="Duration" sortKey="duration" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {displayedExperiments.map((exp) => (
                <ExperimentRow key={exp.id} exp={exp} onRefresh={fetchExperiments} onEdit={setEditingExp} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchExperiments} />
      )}
      {editingExp && (
        <EditModal experiment={editingExp} onClose={() => setEditingExp(null)} onSaved={fetchExperiments} />
      )}
    </div>
  );
}
