'use client';

import { useState } from 'react';
import { Clock, Pencil } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Experiment, ExperimentStatus } from './types';
import { STATUS_COLORS, TRANSITIONS, formatDuration } from './types';
import { VerdictBadge, ABResultsCard } from './ab-results';
import { ExperimentMetricChart } from './experiment-metric-chart';

interface ExperimentRowProps {
  exp: Experiment;
  onRefresh: () => void;
  onEdit: (exp: Experiment) => void;
}

export function ExperimentRow({ exp, onRefresh, onEdit }: ExperimentRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const transitionStatus = async (newStatus: ExperimentStatus) => {
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

  const allowed = TRANSITIONS[exp.status] ?? [];
  const duration = formatDuration(exp.startDate, exp.endDate);
  const hasMetrics = (exp._count?.metrics ?? 0) > 0;

  return (
    <>
      <tr
        className="border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-all ease-spring"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="text-sm text-[var(--foreground)] font-medium">{exp.name}</div>
          <div className="text-xs text-[var(--foreground-secondary)]/70 mt-0.5 truncate max-w-xs">{exp.hypothesis}</div>
        </td>
        <td className="px-4 py-3">
          {exp.channel
            ? <span className="text-xs text-[var(--foreground)]/80">{exp.channel.replace(/_/g, ' ')}</span>
            : <span className="text-xs text-[var(--foreground-secondary)]/50">&mdash;</span>}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs text-[var(--foreground)]/80">{exp.primaryMetric.replace(/_/g, ' ')}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {exp.iceScore != null
            ? <span className="text-sm font-semibold text-apple-blue">{exp.iceScore}</span>
            : <span className="text-xs text-[var(--foreground-secondary)]/50">&mdash;</span>}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[exp.status]}`}>
              {exp.status}
            </span>
            {exp.verdict && <VerdictBadge verdict={exp.verdict} />}
          </div>
        </td>
        <td className="px-4 py-3">
          {duration ? (
            <div>
              <div className="text-xs text-[var(--foreground)]/80 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {duration}
              </div>
              {exp.status === 'RUNNING' && (
                <div className="text-[10px] text-apple-green mt-0.5">active</div>
              )}
            </div>
          ) : (
            <span className="text-xs text-[var(--foreground-secondary)]/70">{new Date(exp.createdAt).toLocaleDateString()}</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.03]">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-3">
              <div>
                <span className="text-xs text-[var(--foreground-secondary)] uppercase">Hypothesis</span>
                <p className="text-sm text-[var(--foreground)] mt-1">{exp.hypothesis}</p>
              </div>
              {exp.targetLift != null && (
                <div>
                  <span className="text-xs text-[var(--foreground-secondary)]">Target Lift:</span>{' '}
                  <span className="text-sm text-[var(--foreground)]">{exp.targetLift}%</span>
                </div>
              )}
              {exp.impact != null && (
                <div className="flex gap-4 text-xs text-[var(--foreground-secondary)]">
                  <span>I: <strong className="text-[var(--foreground)]">{exp.impact}</strong></span>
                  <span>C: <strong className="text-[var(--foreground)]">{exp.confidence}</strong></span>
                  <span>E: <strong className="text-[var(--foreground)]">{exp.ease}</strong></span>
                </div>
              )}

              {/* Metric chart for experiments with time-series data */}
              {hasMetrics && (
                <div className="p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)]">
                  <div className="text-xs text-[var(--foreground-secondary)] uppercase mb-2">
                    {exp.primaryMetric.replace(/_/g, ' ')} over time
                  </div>
                  <ExperimentMetricChart experimentId={exp.id} metricName={exp.primaryMetric} />
                </div>
              )}

              {exp.result && (
                <div className="p-3 bg-white/[0.04] rounded-lg">
                  <span className="text-xs text-[var(--foreground-secondary)] uppercase">Result</span>
                  <p className="text-sm text-[var(--foreground)] mt-1">{exp.result}</p>
                </div>
              )}
              <ABResultsCard exp={exp} />
              {exp.learnings && (
                <div className="p-3 bg-white/[0.04] rounded-lg">
                  <span className="text-xs text-[var(--foreground-secondary)] uppercase">Learnings</span>
                  <p className="text-sm text-[var(--foreground)] mt-1">{exp.learnings}</p>
                </div>
              )}
              {exp.nextSteps && (
                <div className="p-3 bg-blue-900/20 border border-apple-blue/20 rounded-lg">
                  <span className="text-xs text-apple-blue uppercase">Next Steps</span>
                  <p className="text-sm text-blue-200 mt-1">{exp.nextSteps}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                {allowed.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); transitionStatus(s); }}
                    disabled={transitioning}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-[var(--foreground)]/80 hover:bg-white/[0.1] hover:text-[var(--foreground)] transition-all ease-spring disabled:opacity-50"
                  >
                    Move to {s}
                  </button>
                ))}
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(exp); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-[var(--foreground)]/80 hover:bg-white/[0.1] hover:text-[var(--foreground)] transition-all ease-spring flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Edit Results
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteExperiment(); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 text-apple-red hover:bg-red-900/50 hover:text-apple-red transition-all ease-spring ml-auto"
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
