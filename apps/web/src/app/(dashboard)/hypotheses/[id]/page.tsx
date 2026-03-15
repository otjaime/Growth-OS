'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  FlaskConical,
  AlertTriangle,
  Play,
  Pause,
  X,
  FileText,
  Rocket,
  RefreshCw,
  CheckCircle,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatMultiplier, formatPercent } from '@/lib/format';
import { useClient } from '@/contexts/client';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { Badge, getStatusVariant } from '@/components/ui/badge';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ConvictionDots } from '@/components/ui/conviction-dots';

/* ── Types ────────────────────────────────────────── */

interface CopyVariant {
  angle: string;
  headline: string;
  primaryText: string;
  description: string;
}

interface CreativeBrief {
  copyVariants?: CopyVariant[];
  targeting?: {
    countries?: string[];
    ageMin?: number;
    ageMax?: number;
    advantagePlus?: boolean;
  };
  budget?: {
    dailyBudget?: number;
    totalBudget?: number;
    duration?: number;
  };
}

interface StopLossEvent {
  id: string;
  rule: string;
  actionTaken: string;
  metricAtTrigger: Record<string, number> | null;
  executedAt: string;
}

interface Client {
  id: string;
  name: string;
}

interface HypothesisDetail {
  id: string;
  clientId: string;
  title: string;
  status: string;
  trigger: string;
  conviction: number;
  triggerMechanism: string | null;
  audience: string | null;
  funnelStage: string | null;
  creativeAngle: string | null;
  copyHook: string | null;
  primaryEmotion: string | null;
  primaryObjection: string | null;
  expectedROAS: number | null;
  expectedCTR: number | null;
  expectedCVR: number | null;
  budgetUSD: number | null;
  durationDays: number | null;
  falsificationCondition: string | null;
  creativeBrief: CreativeBrief | null;
  actualROAS: number | null;
  actualCTR: number | null;
  actualCVR: number | null;
  actualSpend: number | null;
  actualRevenue: number | null;
  verdict: string | null;
  lesson: string | null;
  triggerEffective: boolean | null;
  launchedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  client: Client;
  stopLossEvents: StopLossEvent[];
}

interface MetricsSnapshot {
  spend?: number;
  revenue?: number;
  roas?: number;
  ctr?: number;
  cvr?: number;
}

interface MetricsHistoryPoint {
  syncedAt: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cvr: number;
}

interface MetricsResponse {
  current: MetricsSnapshot | null;
  history: MetricsHistoryPoint[];
  lastSync: string | null;
  expected: MetricsSnapshot | null;
}

type Verdict = 'WIN' | 'LOSS' | 'INCONCLUSIVE';

const LIVE_STATUSES = new Set(['LIVE', 'PAUSED_BY_SYSTEM', 'PAUSED_BY_USER']);
const CLOSED_STATUSES = new Set(['WINNER', 'LOSER', 'INCONCLUSIVE']);

/* ── Helpers ──────────────────────────────────────── */

// ConvictionDots imported from shared component

function daysBetween(from: string, to?: string): number {
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function KeyValue({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--foreground-secondary)]">
        {label}
      </dt>
      <dd className="text-sm text-[var(--foreground)] mt-0.5">{value}</dd>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────── */

export default function HypothesisDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { selectedClientId } = useClient();
  const hypothesisId = params.id as string;
  const clientIdParam = searchParams.get('clientId') ?? selectedClientId;

  const [hypothesis, setHypothesis] = useState<HypothesisDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const clientId = hypothesis?.clientId ?? clientIdParam;

  const load = useCallback(() => {
    if (!clientIdParam) {
      setError('Missing client context. Select a client from the sidebar or navigate from the client page.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    apiFetch(`/api/clients/${clientIdParam}/hypotheses/${hypothesisId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.hypothesis) {
          setError('Hypothesis not found.');
          setLoading(false);
          return;
        }
        setHypothesis(data.hypothesis);
        setLoading(false);

        // Fetch metrics if live-ish
        if (LIVE_STATUSES.has(data.hypothesis.status)) {
          apiFetch(
            `/api/clients/${data.hypothesis.clientId}/hypotheses/${hypothesisId}/metrics`,
          )
            .then((r2) => (r2.ok ? r2.json() : null))
            .then((mData) => {
              if (mData) setMetrics(mData);
            })
            .catch(() => {
              /* metrics are optional */
            });
        }
      })
      .catch(() => {
        setError('Failed to load hypothesis.');
        setLoading(false);
      });
  }, [clientIdParam, hypothesisId]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Action handlers ────────────────────────────── */

  const doAction = async (
    endpoint: string,
    method = 'POST',
    body?: Record<string, unknown>,
  ) => {
    if (!clientId) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(
        `/api/clients/${clientId}/hypotheses/${hypothesisId}/${endpoint}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.hypothesis) setHypothesis(data.hypothesis);
      }
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Loading state ──────────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hypothesis"
          icon={FlaskConical}
          breadcrumb={{ label: 'Back', href: clientIdParam ? `/clients/${clientIdParam}` : '/clients' }}
        />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      </div>
    );
  }

  /* ── Error state ────────────────────────────────── */

  if (error || !hypothesis) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hypothesis"
          icon={FlaskConical}
          breadcrumb={{ label: 'Back', href: clientIdParam ? `/clients/${clientIdParam}` : '/clients' }}
        />
        <ErrorState message={error ?? 'Unknown error.'} onRetry={load} />
      </div>
    );
  }

  const h = hypothesis;
  const brief = h.creativeBrief;
  const isLive = LIVE_STATUSES.has(h.status);
  const isClosed = CLOSED_STATUSES.has(h.status);

  return (
    <div className="space-y-6 pb-24">
      {/* ── 1. Page Header ──────────────────────────── */}
      <PageHeader
        title={h.title}
        breadcrumb={{ label: `Back to ${h.client.name}`, href: `/clients/${h.clientId}` }}
      />

      {/* ── 2. Status Bar ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={getStatusVariant(h.status)} size="md">
          {h.status.replace(/_/g, ' ')}
        </Badge>
        <Badge variant="slate" size="md">
          {h.trigger}
        </Badge>
        <ConvictionDots level={h.conviction} />
        <span className="text-xs text-[var(--foreground-secondary)]">
          {h.client.name}
        </span>
        {h.launchedAt && !isClosed && (
          <span className="flex items-center gap-1 text-xs text-[var(--foreground-secondary)]">
            <Clock className="h-3 w-3" />
            {daysBetween(h.launchedAt)}d running
          </span>
        )}
      </div>

      {/* ── 3. Pre-Trade Card (Thesis) ──────────────── */}
      <GlassSurface className="card p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">
          Thesis
        </h2>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KeyValue label="Trigger" value={h.trigger} />
          <KeyValue label="Mechanism" value={h.triggerMechanism} />
          <KeyValue label="Audience" value={h.audience} />
          <KeyValue label="Funnel Stage" value={h.funnelStage} />
          <KeyValue label="Creative Angle" value={h.creativeAngle} />
          <KeyValue label="Copy Hook" value={h.copyHook} />
          <KeyValue label="Primary Emotion" value={h.primaryEmotion} />
          <KeyValue label="Primary Objection" value={h.primaryObjection} />
        </dl>

        {/* Expected metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {h.expectedROAS != null && (
            <KpiCard
              title="Expected ROAS"
              value={h.expectedROAS}
              format="multiplier"
            />
          )}
          {h.expectedCTR != null && (
            <KpiCard
              title="Expected CTR"
              value={h.expectedCTR / 100}
              format="percent"
            />
          )}
          {h.expectedCVR != null && (
            <KpiCard
              title="Expected CVR"
              value={h.expectedCVR / 100}
              format="percent"
            />
          )}
        </div>

        {/* Budget & Falsification */}
        <div className="flex flex-wrap gap-6 text-xs text-[var(--foreground-secondary)]">
          {h.budgetUSD != null && (
            <span>
              Budget:{' '}
              <span className="text-[var(--foreground)] font-mono">
                {formatCurrency(h.budgetUSD)}
              </span>
            </span>
          )}
          {h.durationDays != null && (
            <span>
              Duration:{' '}
              <span className="text-[var(--foreground)] font-mono">
                {h.durationDays}d
              </span>
            </span>
          )}
        </div>
        {h.falsificationCondition && (
          <p className="mt-3 text-xs text-red-400/80 italic">
            Falsification: {h.falsificationCondition}
          </p>
        )}
      </GlassSurface>

      {/* ── 4. Creative Brief Card ──────────────────── */}
      {brief && (
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            Creative Brief
          </h2>

          {/* Copy variants */}
          {brief.copyVariants && brief.copyVariants.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {brief.copyVariants.map((cv, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--glass-border)] p-4 space-y-2"
                >
                  <Badge variant="purple" size="sm">
                    {cv.angle}
                  </Badge>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {cv.headline}
                  </p>
                  <p className="text-xs text-[var(--foreground)]">
                    {cv.primaryText}
                  </p>
                  <p className="text-xs text-[var(--foreground-secondary)]">
                    {cv.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Targeting & Budget summary */}
          <div className="flex flex-wrap gap-6 text-xs text-[var(--foreground-secondary)]">
            {brief.targeting?.countries && brief.targeting.countries.length > 0 && (
              <span>
                Countries:{' '}
                <span className="text-[var(--foreground)]">
                  {brief.targeting.countries.join(', ')}
                </span>
              </span>
            )}
            {brief.targeting?.ageMin != null && brief.targeting?.ageMax != null && (
              <span>
                Age:{' '}
                <span className="text-[var(--foreground)]">
                  {brief.targeting.ageMin}&ndash;{brief.targeting.ageMax}
                </span>
              </span>
            )}
            {brief.targeting?.advantagePlus && (
              <Badge variant="blue" size="sm">
                Advantage+
              </Badge>
            )}
            {brief.budget?.dailyBudget != null && (
              <span>
                Daily:{' '}
                <span className="text-[var(--foreground)] font-mono">
                  {formatCurrency(brief.budget.dailyBudget)}
                </span>
              </span>
            )}
            {brief.budget?.totalBudget != null && (
              <span>
                Total:{' '}
                <span className="text-[var(--foreground)] font-mono">
                  {formatCurrency(brief.budget.totalBudget)}
                </span>
              </span>
            )}
            {brief.budget?.duration != null && (
              <span>
                Duration:{' '}
                <span className="text-[var(--foreground)] font-mono">
                  {brief.budget.duration}d
                </span>
              </span>
            )}
          </div>
        </GlassSurface>
      )}

      {/* ── 5. Live Metrics Section ─────────────────── */}
      {isLive && metrics && (
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">
            Live Performance
          </h2>

          {/* KPI row */}
          {metrics.current && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <KpiCard
                title="Spend"
                value={metrics.current.spend ?? 0}
                format="currency"
              />
              <KpiCard
                title="Revenue"
                value={metrics.current.revenue ?? 0}
                format="currency"
              />
              <KpiCard
                title="ROAS"
                value={metrics.current.roas ?? 0}
                format="multiplier"
              />
              <KpiCard
                title="CTR"
                value={(metrics.current.ctr ?? 0) / 100}
                format="percent"
              />
              <KpiCard
                title="CVR"
                value={(metrics.current.cvr ?? 0) / 100}
                format="percent"
              />
            </div>
          )}

          {/* History chart */}
          {metrics.history.length > 1 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={metrics.history.map((p) => ({
                    ...p,
                    date: new Date(p.syncedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }),
                  }))}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--glass-border)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--foreground-secondary)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--foreground-secondary)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--glass-bg)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="roas"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="ROAS"
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Spend"
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {metrics.lastSync && (
            <p className="text-[10px] text-[var(--foreground-secondary)] mt-2">
              Last sync: {new Date(metrics.lastSync).toLocaleString()}
            </p>
          )}
        </GlassSurface>
      )}

      {/* ── 6. Stop-Loss Events ─────────────────────── */}
      {h.stopLossEvents.length > 0 && (
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Stop-Loss Events
          </h2>
          <div className="space-y-3">
            {h.stopLossEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start justify-between text-xs border-b border-[var(--glass-border)]/30 pb-2 last:border-0"
              >
                <div className="space-y-1">
                  <p className="text-[var(--foreground)] font-medium">
                    {ev.rule}
                  </p>
                  <p className="text-[var(--foreground-secondary)]">
                    Action: {ev.actionTaken}
                  </p>
                  {ev.metricAtTrigger && (
                    <p className="text-[var(--foreground-secondary)] font-mono">
                      {Object.entries(ev.metricAtTrigger)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' | ')}
                    </p>
                  )}
                </div>
                <span className="text-[var(--foreground-secondary)] whitespace-nowrap ml-4">
                  {new Date(ev.executedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </GlassSurface>
      )}

      {/* ── 7. Closed Verdict ───────────────────────── */}
      {isClosed && (
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-[var(--foreground-secondary)]" />
            Result
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge
                variant={getStatusVariant(h.verdict ?? h.status)}
                size="md"
              >
                {h.verdict ?? h.status}
              </Badge>
              {h.triggerEffective != null && (
                <span className="text-xs text-[var(--foreground-secondary)]">
                  Trigger effective:{' '}
                  <span className="text-[var(--foreground)]">
                    {h.triggerEffective ? 'Yes' : 'No'}
                  </span>
                </span>
              )}
            </div>
            {h.lesson && (
              <p className="text-sm text-[var(--foreground)]">{h.lesson}</p>
            )}
            <div className="flex flex-wrap gap-6 text-xs text-[var(--foreground-secondary)]">
              {h.actualROAS != null && (
                <span>
                  Actual ROAS:{' '}
                  <span className="text-[var(--foreground)] font-mono">
                    {formatMultiplier(h.actualROAS)}
                  </span>
                </span>
              )}
              {h.actualCTR != null && (
                <span>
                  Actual CTR:{' '}
                  <span className="text-[var(--foreground)] font-mono">
                    {formatPercent(h.actualCTR / 100)}
                  </span>
                </span>
              )}
              {h.actualCVR != null && (
                <span>
                  Actual CVR:{' '}
                  <span className="text-[var(--foreground)] font-mono">
                    {formatPercent(h.actualCVR / 100)}
                  </span>
                </span>
              )}
              {h.actualSpend != null && (
                <span>
                  Actual Spend:{' '}
                  <span className="text-[var(--foreground)] font-mono">
                    {formatCurrency(h.actualSpend)}
                  </span>
                </span>
              )}
              {h.actualRevenue != null && (
                <span>
                  Actual Revenue:{' '}
                  <span className="text-[var(--foreground)] font-mono">
                    {formatCurrency(h.actualRevenue)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </GlassSurface>
      )}

      {/* ── 8. Actions Bar ──────────────────────────── */}
      {!isClosed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-end gap-3">
            {h.status === 'DRAFT' && (
              <button
                disabled={actionLoading}
                onClick={() => doAction('approve')}
                className="flex items-center gap-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </button>
            )}

            {h.status === 'APPROVED' && !brief && (
              <button
                disabled={actionLoading}
                onClick={() => doAction('generate-brief')}
                className="flex items-center gap-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
              >
                <FileText className="h-4 w-4" />
                Generate Brief
              </button>
            )}

            {h.status === 'APPROVED' && brief && (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('generate-brief')}
                  className="flex items-center gap-2 border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate Brief
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('execute')}
                  className="flex items-center gap-2 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <Rocket className="h-4 w-4" />
                  Launch on Meta
                </button>
              </>
            )}

            {h.status === 'LIVE' && (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('pause')}
                  className="flex items-center gap-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => setShowCloseModal(true)}
                  className="flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <X className="h-4 w-4" />
                  Close Hypothesis
                </button>
              </>
            )}

            {(h.status === 'PAUSED_BY_SYSTEM' || h.status === 'PAUSED_BY_USER') && (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('execute')}
                  className="flex items-center gap-2 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => setShowCloseModal(true)}
                  className="flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  <X className="h-4 w-4" />
                  Close Hypothesis
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 9. Close Modal ──────────────────────────── */}
      {showCloseModal && (
        <CloseModal
          hypothesis={h}
          metricsSnapshot={metrics?.current ?? null}
          onClose={() => setShowCloseModal(false)}
          onSubmit={async (body) => {
            await doAction('close', 'POST', body);
            setShowCloseModal(false);
          }}
        />
      )}
    </div>
  );
}

/* ── Close Modal Component ────────────────────────── */

interface CloseModalProps {
  hypothesis: HypothesisDetail;
  metricsSnapshot: MetricsSnapshot | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}

function CloseModal({ hypothesis, metricsSnapshot, onClose, onSubmit }: CloseModalProps) {
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const [lesson, setLesson] = useState('');

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [triggerEffective, setTriggerEffective] = useState(false);
  const [actualROAS, setActualROAS] = useState(
    metricsSnapshot?.roas?.toString() ?? hypothesis.actualROAS?.toString() ?? '',
  );
  const [actualCTR, setActualCTR] = useState(
    metricsSnapshot?.ctr?.toString() ?? hypothesis.actualCTR?.toString() ?? '',
  );
  const [actualCVR, setActualCVR] = useState(
    metricsSnapshot?.cvr?.toString() ?? hypothesis.actualCVR?.toString() ?? '',
  );
  const [actualSpend, setActualSpend] = useState(
    metricsSnapshot?.spend?.toString() ?? hypothesis.actualSpend?.toString() ?? '',
  );
  const [actualRevenue, setActualRevenue] = useState(
    metricsSnapshot?.revenue?.toString() ?? hypothesis.actualRevenue?.toString() ?? '',
  );
  const [submitting, setSubmitting] = useState(false);

  const needsLesson = verdict === 'WIN' || verdict === 'LOSS';
  const lessonValid = !needsLesson || lesson.length >= 50;
  const canSubmit = verdict !== '' && lessonValid && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const body: Record<string, unknown> = {
      verdict,
      lesson: lesson || null,
      triggerEffective: needsLesson ? triggerEffective : null,
    };
    if (actualROAS) body.actualROAS = parseFloat(actualROAS);
    if (actualCTR) body.actualCTR = parseFloat(actualCTR);
    if (actualCVR) body.actualCVR = parseFloat(actualCVR);
    if (actualSpend) body.actualSpend = parseFloat(actualSpend);
    if (actualRevenue) body.actualRevenue = parseFloat(actualRevenue);
    await onSubmit(body);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg mx-4 p-6 space-y-5">
        <h3 className="text-lg font-bold text-[var(--foreground)]">
          Close Hypothesis
        </h3>

        {/* Verdict */}
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-[var(--foreground-secondary)] uppercase tracking-wide">
            Verdict
          </legend>
          <div className="flex gap-3">
            {(['WIN', 'LOSS', 'INCONCLUSIVE'] as const).map((v) => (
              <label
                key={v}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  verdict === v
                    ? 'border-blue-500 bg-blue-500/10 text-[var(--foreground)]'
                    : 'border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="radio"
                  name="verdict"
                  value={v}
                  checked={verdict === v}
                  onChange={() => setVerdict(v)}
                  className="sr-only"
                />
                {v}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Actual metrics */}
        <div className="grid grid-cols-2 gap-3">
          <MetricInput label="Actual ROAS" value={actualROAS} onChange={setActualROAS} />
          <MetricInput label="Actual CTR (%)" value={actualCTR} onChange={setActualCTR} />
          <MetricInput label="Actual CVR (%)" value={actualCVR} onChange={setActualCVR} />
          <MetricInput label="Actual Spend" value={actualSpend} onChange={setActualSpend} />
          <MetricInput
            label="Actual Revenue"
            value={actualRevenue}
            onChange={setActualRevenue}
          />
        </div>

        {/* Trigger effective */}
        {needsLesson && (
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={triggerEffective}
              onChange={(e) => setTriggerEffective(e.target.checked)}
              className="rounded border-[var(--glass-border)]"
            />
            Trigger was effective
          </label>
        )}

        {/* Lesson */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--foreground-secondary)] uppercase tracking-wide">
            Lesson{needsLesson ? ' (required, min 50 chars)' : ' (optional)'}
          </label>
          <textarea
            value={lesson}
            onChange={(e) => setLesson(e.target.value)}
            rows={3}
            placeholder="What did we learn?"
            className="w-full rounded-lg border border-[var(--glass-border)] bg-white/[0.04] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {needsLesson && lesson.length > 0 && lesson.length < 50 && (
            <p className="text-[10px] text-red-400">
              {50 - lesson.length} more characters needed
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] transition-all"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 transition-all"
          >
            {submitting ? 'Closing...' : 'Close Hypothesis'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Metric Input ─────────────────────────────────── */

function MetricInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-[var(--foreground-secondary)] uppercase tracking-wide">
        {label}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--glass-border)] bg-white/[0.04] px-3 py-1.5 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}
