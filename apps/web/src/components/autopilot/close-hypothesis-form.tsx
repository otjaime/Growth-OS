'use client';

import { useState } from 'react';
import { Loader2, X, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { HypothesisOutcome } from './types';

interface CloseHypothesisFormProps {
  hypothesisId: string;
  onComplete: () => void;
  onCancel: () => void;
}

const OUTCOME_OPTIONS: { key: HypothesisOutcome; label: string; icon: typeof CheckCircle; color: string }[] = [
  { key: 'WIN', label: 'Win', icon: CheckCircle, color: 'text-apple-green bg-[var(--tint-green)]' },
  { key: 'LOSS', label: 'Loss', icon: XCircle, color: 'text-apple-red bg-[var(--tint-red)]' },
  { key: 'INCONCLUSIVE', label: 'Inconclusive', icon: HelpCircle, color: 'text-apple-yellow bg-[var(--tint-yellow)]' },
];

export function CloseHypothesisForm({ hypothesisId, onComplete, onCancel }: CloseHypothesisFormProps): JSX.Element {
  const [outcome, setOutcome] = useState<HypothesisOutcome | null>(null);
  const [roasDelta, setRoasDelta] = useState('');
  const [ctrDelta, setCtrDelta] = useState('');
  const [wasAwarenessCorrect, setWasAwarenessCorrect] = useState(true);
  const [didTriggerActivate, setDidTriggerActivate] = useState(true);
  const [whyWorkedOrFailed, setWhyWorkedOrFailed] = useState('');
  const [verticalLearning, setVerticalLearning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = outcome && whyWorkedOrFailed.trim().length > 0;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/autopilot/psychology/close-hypothesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hypothesisId,
          outcome,
          roasDelta: roasDelta ? Number(roasDelta) : undefined,
          ctrDelta: ctrDelta ? Number(ctrDelta) : undefined,
          postMortem: {
            wasAwarenessCorrect,
            didTriggerActivate,
            whyWorkedOrFailed: whyWorkedOrFailed.trim(),
            verticalLearning: verticalLearning.trim(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(typeof data.error === 'string' ? data.error : data.error?.message ?? 'Failed to close hypothesis');
        return;
      }

      onComplete();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-glass-elevated border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--foreground)]">Close Hypothesis</h4>
        <button onClick={onCancel} className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] press-scale">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Outcome selector */}
      <div>
        <label className="text-caption text-[var(--foreground-secondary)] mb-1.5 block">Outcome</label>
        <div className="flex gap-2">
          {OUTCOME_OPTIONS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => setOutcome(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all press-scale ${
                outcome === key
                  ? `${color} ring-1 ring-white/20`
                  : 'bg-glass-hover text-[var(--foreground-secondary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric deltas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">ROAS Delta %</label>
          <input
            type="number"
            step="0.1"
            value={roasDelta}
            onChange={(e) => setRoasDelta(e.target.value)}
            placeholder="e.g. 15.2"
            className="w-full text-xs bg-glass-muted border border-white/10 rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40"
          />
        </div>
        <div>
          <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">CTR Delta %</label>
          <input
            type="number"
            step="0.1"
            value={ctrDelta}
            onChange={(e) => setCtrDelta(e.target.value)}
            placeholder="e.g. 8.5"
            className="w-full text-xs bg-glass-muted border border-white/10 rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40"
          />
        </div>
      </div>

      {/* Post-mortem toggles */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={wasAwarenessCorrect}
            onChange={(e) => setWasAwarenessCorrect(e.target.checked)}
            className="rounded border-white/20 bg-glass-muted text-apple-blue focus:ring-apple-blue/30"
          />
          <span className="text-xs text-[var(--foreground)]">Awareness was correct</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={didTriggerActivate}
            onChange={(e) => setDidTriggerActivate(e.target.checked)}
            className="rounded border-white/20 bg-glass-muted text-apple-blue focus:ring-apple-blue/30"
          />
          <span className="text-xs text-[var(--foreground)]">Trigger activated</span>
        </label>
      </div>

      {/* Post-mortem text */}
      <div>
        <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">
          Why did it work or fail? <span className="text-apple-red">*</span>
        </label>
        <textarea
          value={whyWorkedOrFailed}
          onChange={(e) => setWhyWorkedOrFailed(e.target.value)}
          rows={2}
          placeholder="What specifically drove the outcome? Be concrete."
          className="w-full text-xs bg-glass-muted border border-white/10 rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 resize-none"
        />
      </div>

      <div>
        <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Vertical learning</label>
        <textarea
          value={verticalLearning}
          onChange={(e) => setVerticalLearning(e.target.value)}
          rows={2}
          placeholder="What did you learn about this vertical/audience that applies to future hypotheses?"
          className="w-full text-xs bg-glass-muted border border-white/10 rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 resize-none"
        />
      </div>

      {error && (
        <p className="text-xs text-apple-red">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] px-3 py-1.5 rounded-lg press-scale"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg bg-apple-blue text-white disabled:opacity-40 press-scale transition-opacity"
        >
          {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
          Close Hypothesis
        </button>
      </div>
    </div>
  );
}
