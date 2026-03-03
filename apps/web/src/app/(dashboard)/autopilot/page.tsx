'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Zap, RefreshCw, Loader2, X, Eye, Lightbulb, CheckSquare, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  type Diagnosis,
  type DiagnosisStats,
  type AutopilotStats,
  type AutopilotTab,
  type AutopilotMode,
  type MetaAdWithTrends,
  type HistoryItem,
  type CampaignHealthScore,
  DiagnosisList,
  DiagnosisDetail,
  AutopilotTabBar,
  AdsTable,
  HistoryTable,
  BudgetView,
  BulkActionsBar,
} from '@/components/autopilot';
import { HealthBanner, HealthBannerSkeleton } from '@/components/autopilot/health-banner';
import { SettingsSlideout } from '@/components/autopilot/settings-slideout';
import { AnimatePresence, motion } from 'motion/react';

type FilterStatus = 'ALL' | 'PENDING' | 'DISMISSED' | 'EXECUTED';
type FilterSeverity = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';

const MODE_OPTIONS: { key: AutopilotMode; label: string; icon: typeof Eye }[] = [
  { key: 'monitor', label: 'Monitor', icon: Eye },
  { key: 'suggest', label: 'Suggest', icon: Lightbulb },
  { key: 'auto', label: 'Auto', icon: Zap },
];

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

  // ── Mode state ────────────────────────────────────────────────
  const [autopilotMode, setAutopilotMode] = useState<AutopilotMode>('monitor');
  const [modeUpdating, setModeUpdating] = useState(false);

  // ── Tab state — default to ads ────────────────────────────────
  const [activeTab, setActiveTab] = useState<AutopilotTab>('ads');
  const hasAutoSwitched = useRef(false);

  // ── Settings slideout ─────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Budget view toggle (inside All Ads tab) ───────────────────
  const [budgetExpanded, setBudgetExpanded] = useState(false);

  // ── Diagnosis filters (scoped to diagnoses tab) ───────────────
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('PENDING');
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('ALL');

  // ── Bulk selection state ──────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Ads data (eager-loaded) ───────────────────────────────────
  const [allAds, setAllAds] = useState<MetaAdWithTrends[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsLoaded, setAdsLoaded] = useState(false);

  // ── Campaign health data ──────────────────────────────────────
  const [campaignHealth, setCampaignHealth] = useState<CampaignHealthScore[]>([]);

  // ── History data (lazy) ───────────────────────────────────────
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

      const fetchedDiagnoses: Diagnosis[] = diagData.diagnoses ?? [];
      setDiagnoses(fetchedDiagnoses);
      setStats(statsData);
      setAutopilotStats(apStatsData);
      setLoadError(null);

      // Smart default: auto-switch to diagnoses tab if there are issues (once)
      if (!hasAutoSwitched.current && statsData.total > 0) {
        setActiveTab('diagnoses');
        hasAutoSwitched.current = true;
      }
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

  // ── Eager-load ads + campaign health on mount ──────────────────
  useEffect(() => {
    if (!adsLoaded && !adsLoading) {
      setAdsLoading(true);
      Promise.all([
        apiFetch('/api/autopilot/ads?sortBy=spend').then((r) => (r.ok ? r.json() : null)),
        apiFetch('/api/autopilot/campaigns/health').then((r) => (r.ok ? r.json() : null)),
      ])
        .then(([adsData, healthData]: [{ ads: MetaAdWithTrends[] } | null, { campaigns: CampaignHealthScore[] } | null]) => {
          if (adsData) setAllAds(adsData.ads ?? []);
          if (healthData) setCampaignHealth(healthData.campaigns ?? []);
          setAdsLoaded(true);
        })
        .catch((err: unknown) => {
          console.error('[Autopilot] Failed to load ads:', err);
          setAdsLoaded(true);
        })
        .finally(() => setAdsLoading(false));
    }
  }, [adsLoaded, adsLoading]);

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
          setHistoryLoaded(true);
        })
        .finally(() => setHistoryLoading(false));
    }
  }, [activeTab, historyLoaded, historyLoading]);

  // ── Cross-reference diagnoses by ad ID ────────────────────────
  const diagnosisByAdId = useMemo(() => {
    const map = new Map<string, Diagnosis[]>();
    for (const d of diagnoses) {
      const existing = map.get(d.ad.id) ?? [];
      existing.push(d);
      map.set(d.ad.id, existing);
    }
    return map;
  }, [diagnoses]);

  // ── Campaign health map for AdsTable ──────────────────────────
  const healthByCampaignId = useMemo(() => {
    const map = new Map<string, CampaignHealthScore>();
    for (const c of campaignHealth) {
      map.set(c.campaignId, c);
    }
    return map;
  }, [campaignHealth]);

  // ── Mode change handler ───────────────────────────────────────
  const handleModeChange = async (mode: AutopilotMode) => {
    const prev = autopilotMode;
    setAutopilotMode(mode); // optimistic
    setModeUpdating(true);
    try {
      const res = await apiFetch('/api/autopilot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        setAutopilotMode(prev); // rollback
      }
    } catch {
      setAutopilotMode(prev); // rollback
    } finally {
      setModeUpdating(false);
    }
  };

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
        <HealthBannerSkeleton />
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
      {/* ═══ 1. Header ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--tint-purple)] flex items-center justify-center">
            <Zap className="h-5 w-5 text-apple-purple" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Meta Autopilot</h1>
            <p className="text-xs text-[var(--foreground-secondary)]">
              AI-powered ad diagnosis &amp; optimization
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode toggle — segmented control */}
          <div className="relative flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
            {MODE_OPTIONS.map(({ key, label, icon: Icon }) => {
              const isActive = autopilotMode === key;
              return (
                <button
                  key={key}
                  onClick={() => handleModeChange(key)}
                  disabled={modeUpdating}
                  className="relative z-10 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg press-scale transition-colors ease-spring disabled:opacity-50"
                  style={{ color: isActive ? 'var(--foreground)' : 'var(--foreground-secondary)' }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mode-toggle"
                      className="absolute inset-0 bg-glass-active rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1">
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Gear icon → Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl hover:bg-glass-hover transition-colors press-scale"
            title="Autopilot Settings"
          >
            <Settings className="h-4 w-4 text-[var(--foreground-secondary)]" />
          </button>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 px-4 py-2 rounded-xl press-scale transition-all ease-spring disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {syncing ? 'Syncing...' : 'Sync & Diagnose'}
          </button>
        </div>
      </div>

      {/* ═══ 2. Sync Error Banner ════════════════════════════════ */}
      {syncError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--tint-red)] border border-apple-red/30">
          <p className="text-xs text-apple-red flex-1">{syncError}</p>
          <button onClick={() => setSyncError(null)} className="text-apple-red/60 hover:text-apple-red">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ═══ 3. Health Banner ════════════════════════════════════ */}
      <HealthBanner
        autopilotStats={autopilotStats}
        diagnosisStats={stats}
        diagnoses={diagnoses}
      />

      {/* ═══ 4. Tab Bar ═════════════════════════════════════════ */}
      <AutopilotTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        diagnosisCount={stats?.total ?? 0}
      />

      {/* ═══ 5. Tab Content ═════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {/* ── All Ads Tab ──────────────────────────────────── */}
          {activeTab === 'ads' && (
            <div className="space-y-4">
              {/* Collapsible Budget Optimization */}
              <button
                onClick={() => setBudgetExpanded(!budgetExpanded)}
                className="flex items-center gap-2 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors press-scale"
              >
                {budgetExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Budget Optimization
              </button>
              {budgetExpanded && <BudgetView />}

              <AdsTable
                ads={allAds}
                loading={adsLoading}
                diagnosisByAdId={diagnosisByAdId}
                healthByCampaignId={healthByCampaignId}
              />
            </div>
          )}

          {/* ── Diagnoses Tab ────────────────────────────────── */}
          {activeTab === 'diagnoses' && (
            <>
              {diagnoses.length === 0 ? (
                /* Compact empty state */
                <div className="card px-6 py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--tint-green)] flex items-center justify-center mx-auto mb-3">
                    <span className="text-apple-green text-xl">&#10003;</span>
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">All Clear</p>
                  <p className="text-xs text-[var(--foreground-secondary)] mt-1">
                    No pending diagnoses — your ads are performing well
                  </p>
                </div>
              ) : (
                <>
                  {/* Filter Bar */}
                  <div className="flex items-center gap-3 flex-wrap">
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
            </>
          )}

          {/* ── History Tab ──────────────────────────────────── */}
          {activeTab === 'history' && (
            <HistoryTable
              items={historyItems}
              total={historyTotal}
              loading={historyLoading}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ═══ 6. Settings Slideout ═══════════════════════════════ */}
      <SettingsSlideout open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ═══ 7. Bulk Actions Bar ════════════════════════════════ */}
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
