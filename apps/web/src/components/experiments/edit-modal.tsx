'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import type { Experiment } from './types';

interface EditModalProps {
  experiment: Experiment;
  onClose: () => void;
  onSaved: () => void;
}

export function EditModal({ experiment, onClose, onSaved }: EditModalProps): React.ReactElement {
  const [result, setResult] = useState(experiment.result ?? '');
  const [learnings, setLearnings] = useState(experiment.learnings ?? '');
  const [nextSteps, setNextSteps] = useState(experiment.nextSteps ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // A/B test fields
  const [showABSection, setShowABSection] = useState(experiment.controlSampleSize != null);
  const [controlName, setControlName] = useState(experiment.controlName ?? 'Control');
  const [variantName, setVariantName] = useState(experiment.variantName ?? 'Variant');
  const [controlSampleSize, setControlSampleSize] = useState(experiment.controlSampleSize?.toString() ?? '');
  const [variantSampleSize, setVariantSampleSize] = useState(experiment.variantSampleSize?.toString() ?? '');
  const [controlConversions, setControlConversions] = useState(experiment.controlConversions?.toString() ?? '');
  const [variantConversions, setVariantConversions] = useState(experiment.variantConversions?.toString() ?? '');

  // Live preview of A/B stats
  const abPreview = useMemo(() => {
    const nC = parseInt(controlSampleSize);
    const nV = parseInt(variantSampleSize);
    const xC = parseInt(controlConversions);
    const xV = parseInt(variantConversions);
    if (!nC || !nV || isNaN(xC) || isNaN(xV) || xC > nC || xV > nV || nC <= 0 || nV <= 0) return null;
    const pC = xC / nC;
    const pV = xV / nV;
    const lift = pV - pC;
    const relLift = pC > 0 ? lift / pC : 0;
    return { controlRate: pC, variantRate: pV, absoluteLift: lift, relativeLift: relLift };
  }, [controlSampleSize, variantSampleSize, controlConversions, variantConversions]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        result: result || null,
        learnings: learnings || null,
        nextSteps: nextSteps || null,
      };
      if (showABSection) {
        payload.controlName = controlName || 'Control';
        payload.variantName = variantName || 'Variant';
        const nC = parseInt(controlSampleSize);
        const nV = parseInt(variantSampleSize);
        const xC = parseInt(controlConversions);
        const xV = parseInt(variantConversions);
        if (nC > 0) payload.controlSampleSize = nC;
        if (nV > 0) payload.variantSampleSize = nV;
        if (!isNaN(xC)) payload.controlConversions = xC;
        if (!isNaN(xV)) payload.variantConversions = xV;
      }
      const res = await apiFetch(`/api/experiments/${experiment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFormError(body.error ?? 'Failed to save');
        setSubmitting(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setFormError('Network error');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="Edit Experiment" className="bg-[var(--glass-bg-elevated)] border border-[var(--card-border)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Record Results</h2>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{experiment.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Result</label>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={3}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="What happened? e.g., CTR increased by 25%, CPA decreased 12%"
            />
          </div>

          {/* A/B Test Data Section */}
          <div className="border border-[var(--glass-border)] rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowABSection(!showABSection)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-all ease-spring text-left"
            >
              <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> A/B Test Data
              </span>
              {showABSection
                ? <ChevronDown className="h-4 w-4 text-[var(--foreground-secondary)]" />
                : <ChevronRight className="h-4 w-4 text-[var(--foreground-secondary)]" />}
            </button>
            {showABSection && (
              <div className="p-4 space-y-3 border-t border-[var(--glass-border)]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Control Name</label>
                    <input value={controlName} onChange={(e) => setControlName(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="Control" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Variant Name</label>
                    <input value={variantName} onChange={(e) => setVariantName(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="Variant" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Control Sample Size</label>
                    <input type="number" min={0} value={controlSampleSize} onChange={(e) => setControlSampleSize(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="e.g., 10000" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Variant Sample Size</label>
                    <input type="number" min={0} value={variantSampleSize} onChange={(e) => setVariantSampleSize(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="e.g., 10000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Control Conversions</label>
                    <input type="number" min={0} value={controlConversions} onChange={(e) => setControlConversions(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="e.g., 320" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--foreground-secondary)] mb-1">Variant Conversions</label>
                    <input type="number" min={0} value={variantConversions} onChange={(e) => setVariantConversions(e.target.value)} className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none" placeholder="e.g., 410" />
                  </div>
                </div>

                {/* Live preview */}
                {abPreview && (
                  <div className="p-3 bg-white/[0.04] rounded-lg space-y-2">
                    <div className="text-[10px] text-[var(--foreground-secondary)] uppercase">Preview</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[var(--foreground-secondary)]">{controlName || 'Control'}: </span>
                        <strong className="text-[var(--foreground)]">{(abPreview.controlRate * 100).toFixed(2)}%</strong>
                      </div>
                      <div>
                        <span className="text-[var(--foreground-secondary)]">{variantName || 'Variant'}: </span>
                        <strong className="text-[var(--foreground)]">{(abPreview.variantRate * 100).toFixed(2)}%</strong>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-[var(--foreground-secondary)]">
                      <span>Abs. Lift: <strong className={clsx('text-[var(--foreground)]', abPreview.absoluteLift > 0 ? 'text-apple-green' : abPreview.absoluteLift < 0 ? 'text-apple-red' : '')}>{abPreview.absoluteLift > 0 ? '+' : ''}{(abPreview.absoluteLift * 100).toFixed(2)}pp</strong></span>
                      <span>Rel. Lift: <strong className={clsx('text-[var(--foreground)]', abPreview.relativeLift > 0 ? 'text-apple-green' : abPreview.relativeLift < 0 ? 'text-apple-red' : '')}>{abPreview.relativeLift > 0 ? '+' : ''}{(abPreview.relativeLift * 100).toFixed(1)}%</strong></span>
                    </div>
                    <p className="text-[10px] text-[var(--foreground-secondary)]/70">Full statistical analysis (p-value, CI, verdict) computed on save</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Learnings</label>
            <textarea
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
              rows={3}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="What did we learn? e.g., UGC video outperforms studio content for cold audiences"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--foreground-secondary)] mb-1">Next Steps</label>
            <textarea
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              rows={2}
              className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              placeholder="What should we do next? e.g., Scale budget to $500/day, test on Google"
            />
          </div>

          {formError && (
            <p className="text-sm text-apple-red bg-red-900/20 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] font-medium py-2.5 rounded-lg transition-all ease-spring"
          >
            {submitting ? 'Saving...' : 'Save Results'}
          </button>
        </form>
      </div>
    </div>
  );
}
