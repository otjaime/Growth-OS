'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Loader2, Clock, Database, Server, Layers, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface PipelineRun {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorJson: unknown;
}

interface ConnectorFreshness {
  id: string;
  source: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

interface PipelineData {
  runs: PipelineRun[];
  freshness: ConnectorFreshness[];
  rowCounts: {
    raw: { events: number };
    staging: { orders: number; spend: number; traffic: number };
    facts: { orders: number; spend: number; traffic: number };
    dimensions: { customers: number; campaigns: number; cohorts: number };
  };
  stats: {
    avgDurationMs: number | null;
    successRate: number | null;
    totalRuns: number;
  };
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'SUCCESS') return <CheckCircle className="h-4 w-4 text-apple-green" />;
  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-apple-red" />;
  if (status === 'RUNNING') return <Loader2 className="h-4 w-4 text-apple-blue animate-spin" />;
  return <Clock className="h-4 w-4 text-[var(--foreground-secondary)]" />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUCCESS: 'bg-[var(--tint-green)] text-apple-green',
    FAILED: 'bg-[var(--tint-red)] text-apple-red',
    RUNNING: 'bg-[var(--tint-blue)] text-apple-blue',
    synced: 'bg-[var(--tint-green)] text-apple-green',
    error: 'bg-[var(--tint-red)] text-apple-red',
    syncing: 'bg-[var(--tint-blue)] text-apple-blue',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-white/[0.04] text-[var(--foreground-secondary)]'}`}>
      {status}
    </span>
  );
}

interface QualityCheck {
  check: string;
  passed: boolean;
  message: string;
}

interface QualityData {
  checks: QualityCheck[];
  summary: { total: number; passed: number; failed: number };
  score: number;
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qualityLoading, setQualityLoading] = useState(false);

  const fetchData = () => {
    setLoading(true);
    apiFetch('/api/pipeline/overview')
      .then((r) => {
        if (!r.ok) throw new Error(`Pipeline API error: ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  const fetchQuality = () => {
    setQualityLoading(true);
    apiFetch('/api/pipeline/quality')
      .then((r) => {
        if (!r.ok) throw new Error(`Quality API error: ${r.status}`);
        return r.json();
      })
      .then((d: QualityData) => setQuality(d))
      .catch(() => setQuality(null))
      .finally(() => setQualityLoading(false));
  };

  useEffect(() => {
    fetchData();
    fetchQuality();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Pipeline Health</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">ETL observability: runs, freshness, and data layer metrics</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-white/[0.06] text-[var(--foreground)]/80 rounded-lg hover:bg-white/[0.1] transition-all ease-spring disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
        </div>
      ) : !data ? (
        <div className="card text-center text-[var(--foreground-secondary)] py-12">
          Failed to load pipeline data. Is the API running?
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Avg Duration</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">{formatDuration(data.stats.avgDurationMs)}</p>
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">across last {data.stats.totalRuns} runs</p>
            </div>
            <div className="card">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Success Rate</p>
              <p className={`text-2xl font-bold ${data.stats.successRate !== null && data.stats.successRate >= 0.9 ? 'text-apple-green' : data.stats.successRate !== null && data.stats.successRate >= 0.7 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                {data.stats.successRate !== null ? `${Math.round(data.stats.successRate * 100)}%` : '-'}
              </p>
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">completed runs</p>
            </div>
            <div className="card">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Data Freshness</p>
              <p className="text-2xl font-bold text-[var(--foreground)]">
                {data.freshness.length > 0
                  ? formatRelativeTime(
                      data.freshness
                        .filter((c) => c.lastSyncAt)
                        .sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime())[0]?.lastSyncAt ?? null,
                    )
                  : 'No connectors'}
              </p>
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">most recent sync</p>
            </div>
          </div>

          {/* Data Quality */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-apple-blue" />
                Data Quality
              </h2>
              <button
                onClick={fetchQuality}
                disabled={qualityLoading}
                className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all ease-spring disabled:opacity-50"
              >
                {qualityLoading ? 'Running...' : 'Re-run checks'}
              </button>
            </div>
            {quality ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="card">
                    <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Quality Score</p>
                    <p className={`text-2xl font-bold ${quality.score >= 90 ? 'text-apple-green' : quality.score >= 70 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                      {quality.score}%
                    </p>
                  </div>
                  <div className="card">
                    <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Passed</p>
                    <p className="text-2xl font-bold text-apple-green">{quality.summary.passed}/{quality.summary.total}</p>
                  </div>
                  <div className="card">
                    <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Failed</p>
                    <p className={`text-2xl font-bold ${quality.summary.failed > 0 ? 'text-apple-red' : 'text-apple-green'}`}>
                      {quality.summary.failed}
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="space-y-2">
                    {quality.checks.map((check) => (
                      <div key={check.check} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                        {check.passed ? (
                          <CheckCircle className="h-4 w-4 text-apple-green flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-apple-red flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-[var(--foreground)] font-medium">{check.check.replace(/_/g, ' ')}</span>
                          <p className="text-xs text-[var(--foreground-secondary)] truncate">{check.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : qualityLoading ? (
              <div className="card flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-apple-blue animate-spin" />
              </div>
            ) : (
              <div className="card text-center text-[var(--foreground-secondary)]/70 py-8">Quality checks unavailable</div>
            )}
          </div>

          {/* Row Counts */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
              <Layers className="h-5 w-5 text-apple-blue" />
              Data Layer Metrics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-[var(--foreground-secondary)]" />
                  <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Raw Events</p>
                </div>
                <p className="text-xl font-bold text-[var(--foreground)]">{data.rowCounts.raw.events.toLocaleString()}</p>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-apple-yellow" />
                  <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Staging</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Orders</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.staging.orders.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Spend</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.staging.spend.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Traffic</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.staging.traffic.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-apple-green" />
                  <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Facts</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Orders</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.facts.orders.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Spend</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.facts.spend.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Traffic</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.facts.traffic.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-apple-purple" />
                  <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Dimensions</p>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Customers</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.dimensions.customers.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Campaigns</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.dimensions.campaigns.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--foreground-secondary)]">Cohorts</span>
                    <span className="text-[var(--foreground)] font-medium">{data.rowCounts.dimensions.cohorts.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connector Freshness */}
          {data.freshness.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                <Server className="h-5 w-5 text-apple-blue" />
                Connector Freshness
              </h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--foreground-secondary)] border-b border-[var(--glass-border)]">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium">Last Sync</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.freshness.map((c) => (
                      <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04]">
                        <td className="py-2 text-[var(--foreground)] font-medium">{c.source}</td>
                        <td className="py-2 text-[var(--foreground)]/80">{formatRelativeTime(c.lastSyncAt)}</td>
                        <td className="py-2">
                          {c.lastSyncStatus ? <StatusBadge status={c.lastSyncStatus} /> : <span className="text-[var(--foreground-secondary)]/70">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Run History */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-apple-blue" />
              Run History
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--foreground-secondary)] border-b border-[var(--glass-border)]">
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Job</th>
                    <th className="pb-2 font-medium">Started</th>
                    <th className="pb-2 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((run) => (
                    <tr key={run.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04]">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={run.status} />
                          <StatusBadge status={run.status} />
                        </div>
                      </td>
                      <td className="py-2 text-[var(--foreground)] font-medium">{run.jobName}</td>
                      <td className="py-2 text-[var(--foreground)]/80">{formatRelativeTime(run.startedAt)}</td>
                      <td className="py-2 text-[var(--foreground)]/80">{formatDuration(run.durationMs)}</td>
                    </tr>
                  ))}
                  {data.runs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--foreground-secondary)]/70">No pipeline runs yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
