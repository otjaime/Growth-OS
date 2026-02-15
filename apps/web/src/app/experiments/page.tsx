'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, FlaskConical, ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';

interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: 'IDEA' | 'BACKLOG' | 'RUNNING' | 'COMPLETED' | 'ARCHIVED';
  channel: string | null;
  primaryMetric: string;
  targetLift: number | null;
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  riceScore: number | null;
  startDate: string | null;
  endDate: string | null;
  result: string | null;
  learnings: string | null;
  nextSteps: string | null;
  createdAt: string;
  _count?: { metrics: number };
}

const STATUSES = ['ALL', 'IDEA', 'BACKLOG', 'RUNNING', 'COMPLETED', 'ARCHIVED'] as const;

const STATUS_COLORS: Record<string, string> = {
  IDEA: 'bg-slate-500/20 text-slate-300',
  BACKLOG: 'bg-blue-500/20 text-blue-400',
  RUNNING: 'bg-green-500/20 text-green-400',
  COMPLETED: 'bg-purple-500/20 text-purple-400',
  ARCHIVED: 'bg-slate-600/20 text-slate-500',
};

const CHANNELS = ['meta', 'google_ads', 'email', 'organic', 'affiliate', 'direct', 'other'];
const METRICS = ['conversion_rate', 'aov', 'cac', 'ltv', 'mer', 'revenue', 'sessions', 'retention'];

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [primaryMetric, setPrimaryMetric] = useState('conversion_rate');
  const [channel, setChannel] = useState('');
  const [targetLift, setTargetLift] = useState('');
  const [reach, setReach] = useState(5);
  const [impact, setImpact] = useState(5);
  const [confidence, setConfidence] = useState(5);
  const [effort, setEffort] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const riceScore = effort > 0 ? Math.round(((reach * impact * confidence) / effort) * 100) / 100 : 0;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !hypothesis) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await apiFetch('/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          hypothesis,
          primaryMetric,
          channel: channel || null,
          targetLift: targetLift ? parseFloat(targetLift) : null,
          reach, impact, confidence, effort,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error ?? 'Failed to create experiment');
        setSubmitting(false);
        return;
      }
      onCreated();
      onClose();
    } catch {
      setFormError('Network error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="New Experiment" className="bg-[#0f1a2e] border border-[var(--card-border)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-white">New Experiment</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Test new Meta ad creative with UGC video"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hypothesis *</label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="If we [change], then [metric] will [improve] because [reason]"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Primary Metric</label>
              <select
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>{m.replace(/_/g, ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">All / None</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Target Lift (%)</label>
            <input
              type="number"
              step="0.1"
              value={targetLift}
              onChange={(e) => setTargetLift(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              placeholder="e.g., 15"
            />
          </div>

          {/* RICE Scoring */}
          <div className="border-t border-slate-700 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 uppercase tracking-wide">RICE Score</span>
              <span className="text-lg font-bold text-blue-400">{riceScore}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Reach', value: reach, set: setReach },
                { label: 'Impact', value: impact, set: setImpact },
                { label: 'Confidence', value: confidence, set: setConfidence },
                { label: 'Effort', value: effort, set: setEffort },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">{label}</label>
                    <span className="text-xs text-white font-medium">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={value}
                    onChange={(e) => set(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !hypothesis}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Experiment'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ExperimentRow({ exp, onRefresh }: { exp: Experiment; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const transitionStatus = async (newStatus: string) => {
    setTransitioning(true);
    try {
      const res = await apiFetch(`/api/experiments/${exp.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) onRefresh();
    } catch {
      // ignore
    } finally {
      setTransitioning(false);
    }
  };

  const deleteExperiment = async () => {
    if (!confirm(`Delete "${exp.name}"?`)) return;
    try {
      const res = await apiFetch(`/api/experiments/${exp.id}`, { method: 'DELETE' });
      if (res.ok) onRefresh();
    } catch {
      // ignore
    }
  };

  const transitions: Record<string, string[]> = {
    IDEA: ['BACKLOG', 'ARCHIVED'],
    BACKLOG: ['RUNNING', 'IDEA', 'ARCHIVED'],
    RUNNING: ['COMPLETED', 'ARCHIVED'],
    COMPLETED: ['ARCHIVED'],
    ARCHIVED: ['IDEA'],
  };

  const allowed = transitions[exp.status] ?? [];

  return (
    <>
      <tr
        className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="text-sm text-white font-medium">{exp.name}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{exp.hypothesis}</div>
        </td>
        <td className="px-4 py-3">
          {exp.channel
            ? <span className="text-xs text-slate-300">{exp.channel.replace(/_/g, ' ')}</span>
            : <span className="text-xs text-slate-600">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-slate-300">{exp.primaryMetric.replace(/_/g, ' ')}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {exp.riceScore != null
            ? <span className="text-sm font-semibold text-blue-400">{exp.riceScore}</span>
            : <span className="text-xs text-slate-600">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[exp.status]}`}>
            {exp.status}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {new Date(exp.createdAt).toLocaleDateString()}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/50">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-3">
              <div>
                <span className="text-xs text-slate-400 uppercase">Hypothesis</span>
                <p className="text-sm text-slate-200 mt-1">{exp.hypothesis}</p>
              </div>
              {exp.targetLift != null && (
                <div>
                  <span className="text-xs text-slate-400">Target Lift:</span>{' '}
                  <span className="text-sm text-white">{exp.targetLift}%</span>
                </div>
              )}
              {exp.reach != null && (
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>R: <strong className="text-white">{exp.reach}</strong></span>
                  <span>I: <strong className="text-white">{exp.impact}</strong></span>
                  <span>C: <strong className="text-white">{exp.confidence}</strong></span>
                  <span>E: <strong className="text-white">{exp.effort}</strong></span>
                </div>
              )}
              {exp.result && (
                <div>
                  <span className="text-xs text-slate-400 uppercase">Result</span>
                  <p className="text-sm text-slate-200 mt-1">{exp.result}</p>
                </div>
              )}
              {exp.learnings && (
                <div>
                  <span className="text-xs text-slate-400 uppercase">Learnings</span>
                  <p className="text-sm text-slate-200 mt-1">{exp.learnings}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                {allowed.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); transitionStatus(s); }}
                    disabled={transitioning}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Move to {s}
                  </button>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteExperiment(); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showCreate, setShowCreate] = useState(false);

  const fetchExperiments = useCallback(() => {
    setLoading(true);
    const query = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
    apiFetch(`/api/experiments${query}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { experiments: Experiment[] } | null) => {
        if (!data) { setError(true); setLoading(false); return; }
        setExperiments(data.experiments);
        setLoading(false);
        setError(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [statusFilter]);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Growth Experiments</h1>
        <div className="card border-red-500/50 flex items-center justify-center h-64">
          <p className="text-red-400">Failed to load experiments. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold text-white">Growth Experiments</h1>
          <span className="text-sm text-slate-400">
            {experiments.length} experiment{experiments.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Experiment
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              statusFilter === s
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800',
            )}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="card text-center py-16">
          <FlaskConical className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">
            {statusFilter === 'ALL'
              ? 'No experiments yet. Start by adding your first growth hypothesis.'
              : `No ${statusFilter.toLowerCase()} experiments.`}
          </p>
          {statusFilter === 'ALL' && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              Create your first experiment
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="px-4 py-3 font-medium">Experiment</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Metric</th>
                <th className="px-4 py-3 font-medium text-center">
                  <span className="inline-flex items-center gap-1">
                    RICE <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <ExperimentRow key={exp.id} exp={exp} onRefresh={fetchExperiments} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchExperiments} />
      )}
    </div>
  );
}
