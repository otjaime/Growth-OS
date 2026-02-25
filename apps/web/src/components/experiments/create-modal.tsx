'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { CHANNELS, METRICS } from './types';
import type { ExperimentType } from './types';
import { EXPERIMENT_TEMPLATES } from './templates';

const TARGET_SEGMENTS = ['All Customers', 'New Customers', 'Returning Customers', 'High Margin', 'Low Margin', 'Champions', 'Loyal', 'At Risk', 'Dormant'] as const;

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
  prefill?: {
    name?: string;
    hypothesis?: string;
    primaryMetric?: string;
    channel?: string;
    experimentType?: ExperimentType;
    expectedImpactUsd?: number;
    targetSegment?: string;
  };
}

export function CreateModal({ onClose, onCreated, prefill }: CreateModalProps): React.ReactElement {
  const [selectedType, setSelectedType] = useState<ExperimentType | null>(prefill?.experimentType ?? null);
  const [name, setName] = useState(prefill?.name ?? '');
  const [hypothesis, setHypothesis] = useState(prefill?.hypothesis ?? '');
  const [primaryMetric, setPrimaryMetric] = useState(prefill?.primaryMetric ?? 'conversion_rate');
  const [channel, setChannel] = useState(prefill?.channel ?? '');
  const [targetLift, setTargetLift] = useState('');
  const [expectedImpactUsd, setExpectedImpactUsd] = useState(prefill?.expectedImpactUsd?.toString() ?? '');
  const [guardrailMetrics, setGuardrailMetrics] = useState<string[]>([]);
  const [targetSegment, setTargetSegment] = useState(prefill?.targetSegment ?? '');
  const [impact, setImpact] = useState(5);
  const [confidence, setConfidence] = useState(5);
  const [ease, setEase] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const iceScore = Math.round((impact * confidence * ease / 10) * 100) / 100;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const selectTemplate = (type: ExperimentType) => {
    const tmpl = EXPERIMENT_TEMPLATES.find((t) => t.type === type);
    if (!tmpl) return;
    setSelectedType(type);
    if (!hypothesis) setHypothesis(tmpl.defaultHypothesis);
    setPrimaryMetric(tmpl.defaultMetric);
    setGuardrailMetrics(tmpl.defaultGuardrails);
    if (tmpl.suggestedChannels.length === 1) setChannel(tmpl.suggestedChannels[0]);
  };

  const toggleGuardrail = (metric: string) => {
    setGuardrailMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric],
    );
  };

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
          impact, confidence, ease,
          experimentType: selectedType ?? null,
          expectedImpactUsd: expectedImpactUsd ? parseFloat(expectedImpactUsd) : null,
          guardrailMetrics: guardrailMetrics.length > 0 ? guardrailMetrics : null,
          targetSegment: targetSegment || null,
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="New Experiment" className="bg-[var(--glass-bg-elevated)] border border-[var(--card-border)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">New Experiment</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Template Selector */}
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-2">Experiment Type</label>
            <div className="grid grid-cols-3 gap-2">
              {EXPERIMENT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.type}
                  type="button"
                  onClick={() => selectTemplate(tmpl.type)}
                  className={`text-left p-2.5 rounded-lg border transition-all ease-spring ${
                    selectedType === tmpl.type
                      ? 'border-apple-blue bg-[var(--tint-blue)]'
                      : 'border-[var(--glass-border)] bg-white/[0.04] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="text-xs font-medium text-[var(--foreground)]">{tmpl.label}</div>
                  <div className="text-[10px] text-[var(--foreground-secondary)] mt-0.5 line-clamp-2">{tmpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="e.g., Test new Meta ad creative with UGC video"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Hypothesis *</label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={3}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="If we [change], then [metric] will [improve] because [reason]"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Primary Metric</label>
              <select
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value)}
                className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>{m.replace(/_/g, ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              >
                <option value="">All / None</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Target Segment</label>
            <select
              value={targetSegment}
              onChange={(e) => setTargetSegment(e.target.value)}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
            >
              <option value="">All Customers</option>
              {TARGET_SEGMENTS.filter((s) => s !== 'All Customers').map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Target Lift (%)</label>
              <input
                type="number"
                step="0.1"
                value={targetLift}
                onChange={(e) => setTargetLift(e.target.value)}
                className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
                placeholder="e.g., 15"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Expected Impact ($)</label>
              <input
                type="number"
                step="100"
                value={expectedImpactUsd}
                onChange={(e) => setExpectedImpactUsd(e.target.value)}
                className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
                placeholder="e.g., 15000"
              />
            </div>
          </div>

          {/* Guardrail Metrics */}
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1.5">Guardrail Metrics</label>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.filter((m) => m !== primaryMetric).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleGuardrail(m)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ease-spring ${
                    guardrailMetrics.includes(m)
                      ? 'border-apple-blue bg-[var(--tint-blue)] text-apple-blue'
                      : 'border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:border-[var(--glass-border-hover)]'
                  }`}
                >
                  {m.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* ICE Scoring */}
          <div className="border-t border-[var(--glass-border)] pt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">ICE Score</span>
              <span className="text-lg font-bold text-apple-blue">{iceScore}</span>
            </div>
            <p className="text-[11px] text-[var(--foreground-secondary)]/70 mb-3">Score = (Impact x Confidence x Ease) / 10</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Impact', value: impact, set: setImpact, hint: '1 = minimal, 10 = transformative' },
                { label: 'Confidence', value: confidence, set: setConfidence, hint: '1 = guessing, 10 = data-proven' },
                { label: 'Ease', value: ease, set: setEase, hint: '1 = very hard, 10 = trivial' },
              ].map(({ label, value, set, hint }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-xs text-[var(--foreground-secondary)]">{label}</label>
                    <span className="text-xs text-[var(--foreground)] font-medium">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={value}
                    onChange={(e) => set(parseInt(e.target.value))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <p className="text-[10px] text-[var(--foreground-secondary)]/50 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-apple-red bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !name || !hypothesis}
            className="w-full bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] font-medium py-2.5 rounded-lg transition-all ease-spring"
          >
            {submitting ? 'Creating...' : 'Create Experiment'}
          </button>
        </form>
      </div>
    </div>
  );
}
