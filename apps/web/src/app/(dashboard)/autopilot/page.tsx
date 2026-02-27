'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw, Loader2, BarChart3, Activity, Target, Eye, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  type Diagnosis,
  type DiagnosisStats,
  type AutopilotStats,
  DiagnosisList,
  DiagnosisDetail,
  SeverityBadge,
} from '@/components/autopilot';
import { CounterTicker } from '@/components/ui/counter-ticker';
import { ReflectiveCard } from '@/components/ui/reflective-card';
import { GlassSurface } from '@/components/ui/glass-surface';

type FilterStatus = 'ALL' | 'PENDING' | 'DISMISSED' | 'EXECUTED';
type FilterSeverity = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';

export default function AutopilotPage() {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [stats, setStats] = useState<DiagnosisStats | null>(null);
  const [autopilotStats, setAutopilotStats] = useState<AutopilotStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('PENDING');
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>('ALL');

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (filterSeverity !== 'ALL') params.set('severity', filterSeverity);

      const [diagRes, statsRes, apStatsRes] = await Promise.all([
        apiFetch(`/api/autopilot/diagnoses?${params.toString()}`),
        apiFetch('/api/autopilot/diagnoses/stats'),
        apiFetch('/api/autopilot/stats'),
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

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const syncRes = await apiFetch('/api/autopilot/sync', { method: 'POST' });
      if (!syncRes.ok) {
        const body = await syncRes.json().catch(() => ({ error: syncRes.statusText }));
        setSyncError(`Sync failed: ${body.error ?? body.detail ?? syncRes.statusText}`);
        setSyncing(false);
        return;
      }

      const diagRes = await apiFetch('/api/autopilot/run-diagnosis', { method: 'POST' });
      if (!diagRes.ok) {
        const body = await diagRes.json().catch(() => ({ error: diagRes.statusText }));
        setSyncError(`Diagnosis run failed: ${body.error ?? diagRes.statusText}`);
      }

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
  };

  const selected = diagnoses.find((d) => d.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Meta Autopilot</h1>
            <p className="text-xs text-[var(--foreground-secondary)]">
              AI-powered ad diagnosis &amp; optimization
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs font-medium text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 px-4 py-2 rounded-lg transition-all ease-spring disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? 'Syncing...' : 'Sync & Diagnose'}
        </button>
      </div>

      {/* Sync Error Banner (inline — doesn't hide dashboard) */}
      {syncError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--tint-red)] border border-apple-red/30">
          <p className="text-xs text-apple-red flex-1">{syncError}</p>
          <button onClick={() => setSyncError(null)} className="text-apple-red/60 hover:text-apple-red">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {autopilotStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ReflectiveCard className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-apple-blue" />
              <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Active Ads</p>
            </div>
            <CounterTicker value={autopilotStats.activeAds} className="text-2xl font-bold text-[var(--foreground)]" />
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{autopilotStats.totalAds} total</p>
          </ReflectiveCard>
          <ReflectiveCard className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-apple-green" />
              <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Spend (7d)</p>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">${autopilotStats.metrics7d.totalSpend.toLocaleString()}</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              {autopilotStats.metrics7d.blendedRoas ? `${autopilotStats.metrics7d.blendedRoas.toFixed(2)}x ROAS` : 'No ROAS data'}
            </p>
          </ReflectiveCard>
          <ReflectiveCard className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-apple-purple" />
              <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Diagnoses</p>
            </div>
            <CounterTicker value={stats?.total ?? 0} className="text-2xl font-bold text-[var(--foreground)]" />
            <div className="flex items-center gap-2 mt-1">
              {(stats?.critical ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tint-red)] text-apple-red font-medium">{stats!.critical} critical</span>
              )}
              {(stats?.warning ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tint-yellow)] text-apple-yellow font-medium">{stats!.warning} warning</span>
              )}
            </div>
          </ReflectiveCard>
          <ReflectiveCard className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-apple-yellow" />
              <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Revenue (7d)</p>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">${autopilotStats.metrics7d.totalRevenue.toLocaleString()}</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              {autopilotStats.metrics7d.totalConversions} conversions
            </p>
          </ReflectiveCard>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1">
          {(['ALL', 'PENDING', 'DISMISSED', 'EXECUTED'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ease-spring ${
                filterStatus === s
                  ? 'bg-[var(--tint-blue)] text-apple-blue'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1">
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as FilterSeverity[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ease-spring ${
                filterSeverity === s
                  ? 'bg-[var(--tint-blue)] text-apple-blue'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {s === 'ALL' ? 'All Severity' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '60vh' }}>
        {/* Left — Diagnosis List */}
        <GlassSurface className="col-span-full lg:col-span-4 card p-3 overflow-y-auto" intensity="subtle" style={{ maxHeight: '70vh' }}>
          <DiagnosisList
            diagnoses={diagnoses}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </GlassSurface>

        {/* Right — Detail Panel */}
        <GlassSurface className="col-span-full lg:col-span-8 card p-6 overflow-y-auto" intensity="subtle" style={{ maxHeight: '70vh' }}>
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
        </GlassSurface>
      </div>
    </div>
  );
}
