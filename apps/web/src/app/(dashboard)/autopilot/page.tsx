'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Zap, RefreshCw, Loader2, X, Eye, Lightbulb, CheckSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  type Diagnosis,
  type DiagnosisStats,
  type AutopilotStats,
  type AutopilotTab,
  type AutopilotMode,
  type MetaAdWithTrends,
  type HistoryItem,
  DiagnosisList,
  DiagnosisDetail,
  AutopilotTabBar,
  AutopilotSummaryCards,
  AdsTable,
  HistoryTable,
  ConfigPanel,
  BudgetView,
  CampaignHealthView,
  ImpactSummary,
  BulkActionsBar,
} from '@/components/autopilot';
import { AnimatePresence, motion } from 'motion/react';

type FilterStatus = 'ALL' | 'PENDING' | 'DISMISSED' | 'EXECUTED';
type FilterSeverity = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';

const MODE_BADGE: Record<AutopilotMode, { label: string; icon: typeof Eye; color: string; bg: string }> = {
  monitor: { label: 'Monitor', icon: Eye, color: 'text-[var(--foreground-secondary)]', bg: 'bg-glass-hover' },
  suggest: { label: 'Suggest', icon: Lightbulb, color: 'text-apple-blue', bg: 'bg-[var(--tint-blue)]' },
  auto: { label: 'Auto', icon: Zap, color: 'text-apple-purple', bg: 'bg-[var(--tint-purple)]' },
};

export default function AutopilotPage() {
  // ── Core state ────────────────────────────────────────────────
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [stats, setStats] = useState<DiagnosisStats | null>(null);
  const [autopilotStats, setAutopilotStats] = useState<AutopilotStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Mode state (loaded from config) ─────────────────────────
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>('monitor');

  // ── Tab state ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AutopilotTab>('diagnoses');

  // ── Diagnosis filters (scoped to diagnoses tab) ───────────────
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('PENDING');
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('ALL');

  // ── Bulk selection state ────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Lazy-loaded data for other tabs ───────────────────────────
  const [allAds, setAllAds] = useState<MetaAdWithTrends[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsLoaded, setAdsLoaded] = useState(false);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Fetch core diagnosis data ─────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterSeverity !== 'ALL') params.set('severity', filterSeverity);

      const [diagRes, statsRes, apStatsRes, configRes] = await Promise.all([
        apiFetch(`/api/autopilot/diagnoses?${params.toString()}`),
        apiFetch('/api/autopilot/diagnoses/stats'),
        apiFetch('/api/autopilot/stats'),
        apiFetch('/api/autopilot/config'),
      ]);

      if (!diagRes.ok || !statsRes.ok) {
        const failedRes = !diagRes.ok ? diagRes : statsRes;
        const body = await failedRes.text().catch(() => '');
        setLoadError(`API returned ${failedRes.status}: ${body || failedRes.statusText}`);
        setLoading(false);
        return;
      }

      const diagData = await diagRes.json();
      const statsData = await statsRes.json();
      const apStatsData = apStatsRes.ok ? await apStatsRes.json() : null;

      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.mode) setAutopilotMode(configData.mode);
      }

      setDiagnoses(diagData.diagnoses ?? []);
      setStats(statsData);
      setAutopilotStats(apStatsData);
      setLoadError(null);
    } catch (err) {
      setLoadError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // ── Lazy load ads when tab opens ──────────────────────────────
  useEffect(() => {
    if (activeTab === 'ads' && !adsLoaded && !adsLoading) {
      setAdsLoading(true);
      apiFetch('/api/autopilot/ads?sortBy=spend')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ads: MetaAdWithTrends[] } | null) => {
          if (data) setAllAds(data.ads ?? []);
          setAdsLoaded(true);
        })
        .catch((err: unknown) => {
          console.error('[Autopilot] Failed to load ads:', err);
          setAdsLoaded(true); // Mark loaded to avoid infinite retry
        })
        .finally(() => setAdsLoading(false));
    }
  }, [activeTab, adsLoaded, adsLoading]);

  // ── Lazy load history when tab opens ──────────────────────────
  useEffect(() => {
    if (activeTab === 'history' && !historyLoaded && !historyLoading) {
      setHistoryLoading(true);
      apiFetch('/api/autopilot/history?limit=50')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { items: HistoryItem[]; total: number } | null) => {
          if (data) {
            setHistoryItems(data.items ?? []);
            setHistoryTotal(data.total ?? 0);
          }
          setHistoryLoaded(true);
        })
        .catch((err: unknown) => {
          console.error('[Autopilot] Failed to load history:', err);
          setHistoryLoaded(true); // Mark loaded to avoid infinite retry
        })
        .finally(() => setHistoryLoading(false));
    }
  }, [activeTab, historyLoaded, historyLoading]);

  // ── Cross-reference diagnoses by ad ID for AdsTable ───────────
  const diagnosisByAdId = useMemo(() => {
    const map = new Map<string, Diagnosis[]>();
    for (const d of diagnoses) {
      const existing = map.get(d.ad.id) ?? [];
      existing.push(d);
      map.set(d.ad.id, existing);
    }
    return map;
  }, [diagnoses]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const syncRes = await apiFetch('/api/autopilot/sync', { method: 'POST' });
      if (!syncRes.ok) {
        const body = await syncRes.json().catch(() => ({ error: syncRes.statusText }));
        const msg = body.error ?? syncRes.statusText;
        const detail = body.detail ? ` — ${body.detail}` : '';
        setSyncError(`Sync failed: ${msg}${detail}`);
        setSyncing(false);
        return;
      }

      const diagRes = await apiFetch('/api/autopilot/run-diagnosis', { method: 'POST' });
      if (!diagRes.ok) {
        const body = await diagRes.json().catch(() => ({ error: diagRes.statusText }));
        setSyncError(`Diagnosis run failed: ${body.error ?? diagRes.statusText}`);
      }

      // Invalidate lazy-loaded tabs so they re-fetch
      setAdsLoaded(false);
      setHistoryLoaded(false);
      await fetchData();
    } catch (err) {
      setSyncError(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDismiss = (id: string) => {
    setDiagnoses((prev) => prev.filter((d) => d.id !== id));
    if (selectedId === id) setSelectedId(null);
    // Invalidate history since dismissal creates a new history entry
    setHistoryLoaded(false);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(diagnoses.map((d) => d.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkComplete = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setHistoryLoaded(false);
    fetchData();
  };

  const selected = diagnoses.find((d) => d.id === selectedId) ?? null;

  // ── Mode badge ──────────────────────────────────────────────
  const modeBadge = MODE_BADGE[autopilotMode];
  const ModeBadgeIcon = modeBadge.icon;

  // ── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl skeleton-shimmer" />
          <div className="space-y-2">
            <div className="h-6 w-48 skeleton-shimmer" />
            <div className="h-3 w-32 skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="h-4 w-24 skeleton-shimmer" />
              <div className="h-8 w-20 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Meta Autopilot</h1>
        <div className="card border-apple-red/50 flex flex-col items-center justify-center h-64 gap-2">
          <p className="text-apple-red">Failed to load autopilot data.</p>
          <p className="text-xs text-[var(--foreground-secondary)] max-w-md text-center">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--tint-purple)] flex items-center justify-center">
            <Zap className="h-5 w-5 text-apple-purple" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Meta Autopilot</h1>
              <span className={`inline-flex items-center gap-1 text-caption font-semibold px-2 py-0.5 rounded-full ${modeBadge.color} ${modeBadge.bg}`}>
                <ModeBadgeIcon className="h-3 w-3" />
                {modeBadge.label}
              </span>
            </div>
            <p className="text-xs text-[var(--foreground-secondary)]">
              AI-powered ad diagnosis &amp; optimization
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-medium text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 px-4 py-2 rounded-xl press-scale transition-all ease-spring disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? 'Syncing...' : 'Sync & Diagnose'}
        </button>
      </div>

      {/* Sync Error Banner */}
      {syncError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--tint-red)] border border-apple-red/30">
          <p className="text-xs text-apple-red flex-1">{syncError}</p>
          <button onClick={() => setSyncError(null)} className="text-apple-red/60 hover:text-apple-red">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <AutopilotSummaryCards
        stats={autopilotStats}
        diagnosisStats={stats}
        diagnoses={diagnoses}
      />

      {/* Impact Summary */}
      {activeTab !== 'settings' && <ImpactSummary />}

      {/* Tab Bar */}
      <AutopilotTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        diagnosisCount={stats?.total ?? 0}
        adsCount={autopilotStats?.totalAds ?? 0}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {/* ═══ Diagnoses Tab ═══════════════════════════════════════ */}
          {activeTab === 'diagnoses' && (
            <>
              {/* Filter Bar — segmented controls */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Status filter segment */}
                <div className="flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
                  {(['ALL', 'PENDING', 'DISMISSED', 'EXECUTED'] as FilterStatus[]).map((s) => {
                    const isActive = filterStatus === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium press-scale transition-colors ease-spring ${
                          isActive
                            ? 'bg-glass-active text-[var(--foreground)]'
                            : 'text-[var(--foreground-secondary)]'
                        }`}
                      >
                        {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>

                {/* Severity filter segment */}
                <div className="flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
                  {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as FilterSeverity[]).map((s) => {
                    const isActive = filterSeverity === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setFilterSeverity(s)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium press-scale transition-colors ease-spring ${
                          isActive
                            ? 'bg-glass-active text-[var(--foreground)]'
                            : 'text-[var(--foreground-secondary)]'
                        }`}
                      >
                        {s === 'ALL' ? 'All Severity' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>

                {/* Select toggle */}
                <button
                  onClick={() => {
                    setSelectionMode(!selectionMode);
                    if (selectionMode) setSelectedIds(new Set());
                  }}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl press-scale transition-all ease-spring ${
                    selectionMode
                      ? 'text-apple-blue bg-[var(--tint-blue)]'
                      : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] bg-glass-muted'
                  }`}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {selectionMode ? 'Cancel Select' : 'Select'}
                </button>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6" style={{ minHeight: '60vh' }}>
                {/* Left — Diagnosis List */}
                <div
                  className="col-span-full lg:col-span-4 card p-3 overflow-y-auto"
                  style={{ maxHeight: '70vh' }}
                >
                  <DiagnosisList
                    diagnoses={diagnoses}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    selectionMode={selectionMode}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                  />
                </div>

                {/* Right — Detail Panel */}
                <div
                  className="col-span-full lg:col-span-8 card p-6 overflow-y-auto"
                  style={{ maxHeight: '70vh' }}
                >
                  {selected ? (
                    <DiagnosisDetail
                      diagnosis={selected}
                      onDismiss={handleDismiss}
                      onRefresh={fetchData}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Zap className="h-12 w-12 text-[var(--foreground-secondary)]/20 mb-4" />
                      <p className="text-sm font-medium text-[var(--foreground-secondary)]">
                        Select a diagnosis to view details
                      </p>
                      <p className="text-xs text-[var(--foreground-secondary)]/60 mt-1">
                        Click any item in the list to see the full diagnosis and take action
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ═══ All Ads Tab ═════════════════════════════════════════ */}
          {activeTab === 'ads' && (
            <AdsTable
              ads={allAds}
              loading={adsLoading}
              diagnosisByAdId={diagnosisByAdId}
            />
          )}

          {/* ═══ Budget Tab ════════════════════════════════════════ */}
          {activeTab === 'budget' && (
            <BudgetView />
          )}

          {/* ═══ Health Tab ════════════════════════════════════════ */}
          {activeTab === 'health' && (
            <CampaignHealthView />
          )}

          {/* ═══ History Tab ═════════════════════════════════════════ */}
          {activeTab === 'history' && (
            <HistoryTable
              items={historyItems}
              total={historyTotal}
              loading={historyLoading}
            />
          )}

          {/* ═══ Settings Tab ═══════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <ConfigPanel />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Bulk Actions Floating Bar */}
      {selectionMode && selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          selectedIds={selectedIds}
          onComplete={handleBulkComplete}
          onCancel={() => {
            setSelectionMode(false);
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
