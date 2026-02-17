'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Rocket,
  X,
  Zap,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────

interface Signal {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}

interface Feedback {
  id: string;
  action: string;
  notes: string | null;
  promotedExperimentId: string | null;
  createdAt: string;
}

interface Suggestion {
  id: string;
  opportunityId: string;
  type: string;
  title: string;
  hypothesis: string;
  suggestedChannel: string | null;
  suggestedMetric: string | null;
  suggestedTargetLift: number | null;
  impactScore: number | null;
  confidenceScore: number | null;
  effortScore: number | null;
  riskScore: number | null;
  reasoning: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROMOTED';
  feedback: Feedback[];
  createdAt: string;
}

interface Opportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  status: 'NEW' | 'REVIEWED' | 'ACTED' | 'DISMISSED';
  signalsJson: Signal[];
  suggestions: Suggestion[];
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────

const STATUS_TABS = ['ALL', 'NEW', 'REVIEWED', 'ACTED', 'DISMISSED'] as const;

const OPP_TYPE_COLORS: Record<string, string> = {
  EFFICIENCY_DROP: 'bg-apple-orange/[0.18] text-apple-orange',
  CAC_SPIKE: 'bg-[var(--tint-red)] text-apple-red',
  RETENTION_DECLINE: 'bg-[var(--tint-purple)] text-apple-purple',
  FUNNEL_LEAK: 'bg-[var(--tint-yellow)] text-apple-yellow',
  GROWTH_PLATEAU: 'bg-white/[0.04] text-[var(--foreground)]/80',
  CHANNEL_IMBALANCE: 'bg-[var(--tint-blue)] text-apple-blue',
  QUICK_WIN: 'bg-[var(--tint-green)] text-apple-green',
};

const SEVERITY_ICONS: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-apple-red',
  warning: 'text-apple-yellow',
  info: 'text-apple-blue',
};

const SUGGESTION_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-white/[0.04] text-[var(--foreground)]/80',
  APPROVED: 'bg-[var(--tint-green)] text-apple-green',
  REJECTED: 'bg-[var(--tint-red)] text-apple-red',
  PROMOTED: 'bg-[var(--tint-blue)] text-apple-blue',
};

// ── Summary Cards ─────────────────────────────────────────────

function SummaryCards({ opportunities }: { opportunities: Opportunity[] }) {
  const totalOpps = opportunities.length;
  const allSuggestions = opportunities.flatMap((o) => o.suggestions);
  const pending = allSuggestions.filter((s) => s.status === 'PENDING').length;
  const promoted = allSuggestions.filter((s) => s.status === 'PROMOTED').length;
  const decided = allSuggestions.filter((s) => s.status === 'APPROVED' || s.status === 'REJECTED' || s.status === 'PROMOTED');
  const approvalRate = decided.length > 0
    ? Math.round((decided.filter((s) => s.status === 'APPROVED' || s.status === 'PROMOTED').length / decided.length) * 100)
    : null;

  const cards = [
    { label: 'Opportunities', value: totalOpps, color: 'text-apple-blue' },
    { label: 'Pending Review', value: pending, color: 'text-apple-yellow' },
    { label: 'Promoted', value: promoted, color: 'text-apple-green' },
    { label: 'Approval Rate', value: approvalRate != null ? `${approvalRate}%` : '\u2014', color: 'text-apple-purple' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">{c.label}</span>
          <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Demo Banner ───────────────────────────────────────────────

function DemoBanner() {
  return (
    <div className="bg-[var(--tint-purple)] border border-apple-purple/30 rounded-lg px-4 py-3 flex items-center gap-3">
      <Info className="h-4 w-4 text-apple-purple flex-shrink-0" />
      <p className="text-sm text-apple-purple">
        <strong>Demo mode:</strong> AI suggestions are rule-based. Connect your OpenAI API key in settings for AI-generated suggestions.
      </p>
    </div>
  );
}

// ── Promote Modal ─────────────────────────────────────────────

function PromoteModal({
  suggestion,
  onClose,
  onPromoted,
}: {
  suggestion: Suggestion;
  onClose: () => void;
  onPromoted: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // No reach score on suggestions — RICE will be computed after user sets reach
  const riceScore = null;

  const handlePromote = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/suggestions/${suggestion.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to promote');
        setSubmitting(false);
        return;
      }
      onPromoted();
      onClose();
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Promote to Experiment"
        className="bg-[var(--glass-bg-elevated)] border border-[var(--card-border)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Promote to Experiment</h2>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">This will create a new experiment in IDEA status</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preview */}
          <div className="space-y-3">
            <div>
              <span className="text-xs text-[var(--foreground-secondary)] uppercase">Experiment Name</span>
              <p className="text-sm text-[var(--foreground)] mt-0.5">{suggestion.title}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--foreground-secondary)] uppercase">Hypothesis</span>
              <p className="text-sm text-[var(--foreground)] mt-0.5">{suggestion.hypothesis}</p>
            </div>
            <div className="flex gap-4 text-xs">
              {suggestion.suggestedChannel && (
                <span className="text-[var(--foreground-secondary)]">
                  Channel: <strong className="text-[var(--foreground)]">{suggestion.suggestedChannel.replace(/_/g, ' ')}</strong>
                </span>
              )}
              {suggestion.suggestedMetric && (
                <span className="text-[var(--foreground-secondary)]">
                  Metric: <strong className="text-[var(--foreground)]">{suggestion.suggestedMetric.replace(/_/g, ' ')}</strong>
                </span>
              )}
              {suggestion.suggestedTargetLift != null && (
                <span className="text-[var(--foreground-secondary)]">
                  Target: <strong className="text-[var(--foreground)]">{suggestion.suggestedTargetLift}%</strong>
                </span>
              )}
            </div>
            {/* RICE preview */}
            <div className="flex gap-4 text-xs text-[var(--foreground-secondary)]">
              <span>Reach: <strong className="text-[var(--foreground-secondary)]/70">set after promote</strong></span>
              {suggestion.impactScore != null && <span>Impact: <strong className="text-[var(--foreground)]">{suggestion.impactScore}</strong></span>}
              {suggestion.confidenceScore != null && <span>Confidence: <strong className="text-[var(--foreground)]">{suggestion.confidenceScore}</strong></span>}
              {suggestion.effortScore != null && <span>Effort: <strong className="text-[var(--foreground)]">{suggestion.effortScore}</strong></span>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="Any additional context for this experiment..."
            />
          </div>

          {error && (
            <p className="text-sm text-apple-red bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handlePromote}
            disabled={submitting}
            className="w-full bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] font-medium py-2.5 rounded-lg transition-all ease-spring flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Promoting...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Create Experiment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Suggestion Row ────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  onRefresh,
  onPromote,
}: {
  suggestion: Suggestion;
  onRefresh: () => void;
  onPromote: (s: Suggestion) => void;
}) {
  const [acting, setActing] = useState(false);

  const sendFeedback = async (action: string) => {
    setActing(true);
    try {
      const res = await apiFetch(`/api/suggestions/${suggestion.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) onRefresh();
    } catch {
      // ignore
    } finally {
      setActing(false);
    }
  };

  const isPending = suggestion.status === 'PENDING';

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--foreground)] font-medium">{suggestion.title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SUGGESTION_STATUS_COLORS[suggestion.status]}`}>
            {suggestion.status}
          </span>
        </div>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1 line-clamp-2">{suggestion.hypothesis}</p>
        <div className="flex gap-3 mt-1.5 text-xs text-[var(--foreground-secondary)]/70">
          {suggestion.suggestedChannel && <span>{suggestion.suggestedChannel.replace(/_/g, ' ')}</span>}
          {suggestion.suggestedMetric && <span>{suggestion.suggestedMetric.replace(/_/g, ' ')}</span>}
          {suggestion.suggestedTargetLift != null && <span>+{suggestion.suggestedTargetLift}%</span>}
          {suggestion.impactScore != null && <span>Impact: {suggestion.impactScore}</span>}
          {suggestion.effortScore != null && <span>Effort: {suggestion.effortScore}</span>}
        </div>
        {suggestion.reasoning && (
          <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1.5 italic">{suggestion.reasoning}</p>
        )}
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          <button
            onClick={() => sendFeedback('approve')}
            disabled={acting}
            title="Approve"
            className="p-1.5 rounded-lg bg-green-900/30 text-apple-green hover:bg-green-900/50 transition-all ease-spring disabled:opacity-50"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => sendFeedback('reject')}
            disabled={acting}
            title="Reject"
            className="p-1.5 rounded-lg bg-red-900/30 text-apple-red hover:bg-red-900/50 transition-all ease-spring disabled:opacity-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onPromote(suggestion)}
            disabled={acting}
            title="Promote to Experiment"
            className="p-1.5 rounded-lg bg-blue-900/30 text-apple-blue hover:bg-blue-900/50 transition-all ease-spring disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Opportunity Card ──────────────────────────────────────────

function OpportunityCard({
  opportunity,
  onRefresh,
  onPromote,
}: {
  opportunity: Opportunity;
  onRefresh: () => void;
  onPromote: (s: Suggestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const signals = (opportunity.signalsJson ?? []) as Signal[];
  const typeColor = OPP_TYPE_COLORS[opportunity.type] ?? 'bg-white/[0.04] text-[var(--foreground)]/80';
  const pendingCount = opportunity.suggestions.filter((s) => s.status === 'PENDING').length;

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06]/30 transition-all ease-spring"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-[var(--foreground-secondary)] flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[var(--foreground-secondary)] flex-shrink-0" />
        )}
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeColor}`}>
          {opportunity.type.replace(/_/g, ' ')}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-[var(--foreground)] font-medium">{opportunity.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--tint-yellow)] text-apple-yellow font-medium">
              {pendingCount} pending
            </span>
          )}
          <span className="text-xs text-[var(--foreground-secondary)]/70">
            {signals.length} signal{signals.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-[var(--foreground-secondary)]/70">
            {opportunity.suggestions.length} suggestion{opportunity.suggestions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/[0.04]">
          {/* Description */}
          <div className="px-4 py-3 border-b border-white/[0.04]">
            <p className="text-sm text-[var(--foreground)]/80">{opportunity.description}</p>
          </div>

          {/* Signals */}
          {signals.length > 0 && (
            <div className="px-4 py-3 border-b border-white/[0.04]">
              <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">Detected Signals</span>
              <div className="mt-2 space-y-1.5">
                {signals.map((signal) => {
                  const SevIcon = SEVERITY_ICONS[signal.severity] ?? Info;
                  const sevColor = SEVERITY_COLORS[signal.severity] ?? 'text-[var(--foreground-secondary)]';
                  return (
                    <div key={signal.id} className="flex items-start gap-2 text-xs">
                      <SevIcon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${sevColor}`} />
                      <div>
                        <span className="text-[var(--foreground)] font-medium">{signal.title}</span>
                        <span className="text-[var(--foreground-secondary)]/70 ml-1">{signal.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div className="px-4 py-3">
            <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">Suggestions</span>
            {opportunity.suggestions.length > 0 ? (
              <div className="mt-2">
                {opportunity.suggestions.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} onRefresh={onRefresh} onPromote={onPromote} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-2">No suggestions generated yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function SuggestionsPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [promotingSuggestion, setPromotingSuggestion] = useState<Suggestion | null>(null);

  const fetchOpportunities = useCallback(() => {
    setLoading(true);
    apiFetch('/api/opportunities')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { opportunities: Opportunity[] } | null) => {
        if (!data) {
          setError(true);
          setLoading(false);
          return;
        }
        setOpportunities(data.opportunities);
        // Detect demo mode: if any suggestion is RULE_BASED, we're in demo mode
        const hasRuleBased = data.opportunities.some((o: Opportunity) =>
          o.suggestions.some((s: Suggestion) => s.type === 'RULE_BASED'),
        );
        if (hasRuleBased) setDemoMode(true);
        setLoading(false);
        setError(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/opportunities/generate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDemoMode(!data.aiEnabled);
      }
      fetchOpportunities();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  // Compute counts per status
  const statusCounts: Record<string, number> = { ALL: opportunities.length };
  for (const s of ['NEW', 'REVIEWED', 'ACTED', 'DISMISSED']) {
    statusCounts[s] = opportunities.filter((o) => o.status === s).length;
  }

  // Filter displayed opportunities
  const filtered =
    statusFilter === 'ALL'
      ? opportunities
      : opportunities.filter((o) => o.status === statusFilter);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">AI Suggestions</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load opportunities. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-6 w-6 text-apple-yellow" />
          <h1 className="text-2xl font-bold text-[var(--foreground)]">AI Suggestions</h1>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] text-sm font-medium px-4 py-2 rounded-lg transition-all ease-spring"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" />
              Detect &amp; Generate
            </>
          )}
        </button>
      </div>

      {/* Demo banner */}
      {demoMode && <DemoBanner />}

      {/* Summary cards */}
      {!loading && <SummaryCards opportunities={opportunities} />}

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
        {STATUS_TABS.map((s) => (
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
            {!loading && (
              <span
                className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded-full',
                  statusFilter === s ? 'bg-apple-blue/30 text-apple-blue' : 'bg-white/[0.06] text-[var(--foreground-secondary)]/70',
                )}
              >
                {statusCounts[s] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <Lightbulb className="h-12 w-12 text-[var(--foreground-secondary)]/50 mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)] text-lg">
            {opportunities.length === 0
              ? 'No opportunities detected yet. Click "Detect & Generate" to analyze your metrics.'
              : `No ${statusFilter.toLowerCase()} opportunities.`}
          </p>
          {opportunities.length === 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-4 text-apple-blue hover:text-apple-blue text-sm font-medium"
            >
              Run signal detection
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              onRefresh={fetchOpportunities}
              onPromote={setPromotingSuggestion}
            />
          ))}
        </div>
      )}

      {/* Promote modal */}
      {promotingSuggestion && (
        <PromoteModal
          suggestion={promotingSuggestion}
          onClose={() => setPromotingSuggestion(null)}
          onPromoted={fetchOpportunities}
        />
      )}
    </div>
  );
}
