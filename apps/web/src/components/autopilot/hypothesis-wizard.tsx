'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Brain, Check, Loader2,
  AlertTriangle, Sparkles, Target, ClipboardCheck, FlaskConical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';
import type {
  AwarenessLevel,
  EmotionalState,
  PsychTrigger,
  FunnelStage,
  PsychologyAudit,
  DiagnoseStateResponse,
  ProductPerformanceRow,
} from './types';
import { AWARENESS_LABELS, EMOTION_LABELS, TRIGGER_LABELS, FUNNEL_LABELS } from './psychology-labels';
import { ProductCombobox } from './product-combobox';
import { AudienceSelector } from './audience-selector';
import { ProductStatsCard } from './product-stats-card';

interface HypothesisWizardProps {
  onComplete: (hypothesisId: string) => void;
  onCancel: () => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_META: { label: string; icon: typeof Brain }[] = [
  { label: 'Audience', icon: Target },
  { label: 'Diagnosis', icon: Brain },
  { label: 'Trigger', icon: Sparkles },
  { label: 'Falsification', icon: FlaskConical },
  { label: 'Audit', icon: ClipboardCheck },
];

const FUNNEL_OPTIONS: FunnelStage[] = ['TOFU', 'MOFU', 'BOFU', 'RETENTION'];
const METRIC_OPTIONS = ['ctr', 'roas', 'cvr', 'cpc', 'frequency'] as const;

interface SegmentData {
  segment: string;
  count: number;
  totalRevenue: number;
}

export function HypothesisWizard({ onComplete, onCancel }: HypothesisWizardProps): JSX.Element {
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate data
  const [products, setProducts] = useState<ProductPerformanceRow[]>([]);
  const [segments, setSegments] = useState<SegmentData[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductPerformanceRow | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Step 1: Form inputs
  const [productTitle, setProductTitle] = useState('');
  const [productType, setProductType] = useState('');
  const [vertical, setVertical] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('TOFU');
  const [metric, setMetric] = useState('ctr');
  const [targetLift, setTargetLift] = useState(15);
  const [windowDays, setWindowDays] = useState(14);

  // Fetch products + segments on mount
  useEffect(() => {
    async function loadData(): Promise<void> {
      setDataLoading(true);
      try {
        const [prodRes, segRes] = await Promise.all([
          apiFetch('/api/metrics/products?limit=50&sortBy=adFitness'),
          apiFetch('/api/metrics/segments'),
        ]);
        if (prodRes.ok) {
          const data = await prodRes.json();
          setProducts(data.products ?? []);
        }
        if (segRes.ok) {
          const data = await segRes.json();
          setSegments(data.segments ?? []);
        }
      } catch {
        // Silently fall back to manual entry
      } finally {
        setDataLoading(false);
      }
    }
    void loadData();
  }, []);

  function handleProductSelect(product: ProductPerformanceRow | null, manualTitle?: string): void {
    if (product) {
      setSelectedProduct(product);
      setProductTitle(product.productTitle);
      setProductType(product.productType);
      // Derive vertical from collections (first one) or fallback to productType
      const collections = product.collections as string[] | null;
      const derivedVertical = collections?.[0] ?? product.productType;
      setVertical(derivedVertical);
    } else {
      setSelectedProduct(null);
      setProductTitle(manualTitle ?? '');
    }
  }

  // Steps 2-3: Diagnosis result
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnoseStateResponse | null>(null);

  // Step 4: Editable falsification (pre-filled from diagnosis)
  const [editMetric, setEditMetric] = useState('ctr');
  const [editTarget, setEditTarget] = useState(15);
  const [editWindow, setEditWindow] = useState(14);

  // Step 5: Audit
  const [audit, setAudit] = useState<PsychologyAudit | null>(null);
  const [hypothesisId, setHypothesisId] = useState<string | null>(null);

  // ── Step 1: Submit diagnosis ──────────────────────────────────
  async function handleDiagnose(): Promise<void> {
    if (!productTitle || !productType || !vertical || !targetAudience) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/autopilot/psychology/diagnose-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle,
          productType,
          vertical,
          targetAudience,
          funnelStage,
          metric,
          targetLift,
          windowDays,
        }),
      });
      if (!res.ok) throw new Error('Failed to diagnose audience state');
      const data = (await res.json()) as DiagnoseStateResponse;
      setDiagnosisResult(data);
      setHypothesisId(data.hypothesisId);

      // Pre-fill falsification from AI response
      setEditMetric(data.hypothesis.falsificationMetric);
      setEditTarget(data.hypothesis.falsificationTarget);
      setEditWindow(data.hypothesis.falsificationWindow);

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: Run audit ─────────────────────────────────────────
  async function handleRunAudit(): Promise<void> {
    if (!hypothesisId) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/autopilot/psychology/audit/${hypothesisId}`);
      if (!res.ok) throw new Error('Failed to run audit');
      const data = (await res.json()) as { hypothesisId: string; audit: PsychologyAudit };
      setAudit(data.audit);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 5: Approve ───────────────────────────────────────────
  function handleApprove(): void {
    if (hypothesisId) {
      onComplete(hypothesisId);
    }
  }

  const canProceedStep1 = productTitle && productType && vertical && targetAudience;

  return (
    <div className="card p-5 space-y-5">
      {/* ── Step indicator ──────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {STEP_META.map((s, i) => {
          const stepNum = (i + 1) as WizardStep;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          const Icon = s.icon;

          return (
            <div key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <div className={`w-6 h-px ${isDone ? 'bg-apple-green' : 'bg-white/10'}`} />
              )}
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-caption font-medium transition-colors ${
                  isActive
                    ? 'bg-[var(--tint-blue)] text-apple-blue'
                    : isDone
                      ? 'bg-[var(--tint-green)] text-apple-green'
                      : 'text-[var(--foreground-secondary)]'
                }`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Error banner ───────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--tint-red)] text-apple-red text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Step Content ───────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {/* ═══ STEP 1: Product & Audience Form ═══════════════ */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-3">Define Your Trade</h4>
                <p className="text-caption text-[var(--foreground-secondary)] mb-4">
                  Every campaign is a trade with a hypothesis. Start by defining the product and audience.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">
                    Product Title <span className="text-apple-red">*</span>
                  </label>
                  <ProductCombobox
                    products={products}
                    value={productTitle}
                    onChange={handleProductSelect}
                    loading={dataLoading}
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">
                    Product Type <span className="text-apple-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    placeholder={selectedProduct ? '' : 'e.g. premium_food'}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] border border-white/5 focus:border-apple-blue/50 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">
                    Vertical <span className="text-apple-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={vertical}
                    onChange={(e) => setVertical(e.target.value)}
                    placeholder={selectedProduct ? '' : 'e.g. pet_nutrition'}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] border border-white/5 focus:border-apple-blue/50 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">
                    Target Audience <span className="text-apple-red">*</span>
                  </label>
                  <AudienceSelector
                    value={targetAudience}
                    onChange={setTargetAudience}
                    segments={segments}
                    loading={dataLoading}
                  />
                </div>
              </div>

              {/* Product stats card (shown when a product is selected) */}
              <AnimatePresence>
                {selectedProduct && <ProductStatsCard product={selectedProduct} />}
              </AnimatePresence>

              {/* Optional fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Funnel Stage</label>
                  <select
                    value={funnelStage}
                    onChange={(e) => setFunnelStage(e.target.value as FunnelStage)}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  >
                    {FUNNEL_OPTIONS.map((f) => (
                      <option key={f} value={f}>{FUNNEL_LABELS[f]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Metric</label>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  >
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Target Lift %</label>
                  <input
                    type="number"
                    value={targetLift}
                    onChange={(e) => setTargetLift(Number(e.target.value))}
                    min={1}
                    max={200}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Window (days)</label>
                  <input
                    type="number"
                    value={windowDays}
                    onChange={(e) => setWindowDays(Number(e.target.value))}
                    min={3}
                    max={90}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Diagnosis Display ═══════════════════════ */}
          {step === 2 && diagnosisResult && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">State Diagnosis</h4>
                <p className="text-caption text-[var(--foreground-secondary)]">
                  AI-diagnosed audience state based on your inputs and ad performance data.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DiagnosisField
                  label="Awareness Level"
                  value={AWARENESS_LABELS[diagnosisResult.diagnosis.awarenessLevel as AwarenessLevel]?.label ?? diagnosisResult.diagnosis.awarenessLevel}
                  style={AWARENESS_LABELS[diagnosisResult.diagnosis.awarenessLevel as AwarenessLevel]}
                />
                <DiagnosisField
                  label="Emotional State"
                  value={EMOTION_LABELS[diagnosisResult.diagnosis.emotionalState as EmotionalState]?.label ?? diagnosisResult.diagnosis.emotionalState}
                  style={EMOTION_LABELS[diagnosisResult.diagnosis.emotionalState as EmotionalState]}
                />
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-glass-hover">
                  <span className="text-caption text-[var(--foreground-secondary)]">Primary Objection</span>
                  <p className="text-xs text-[var(--foreground)] mt-0.5">{diagnosisResult.diagnosis.primaryObjection}</p>
                </div>
                <div className="p-3 rounded-lg bg-glass-hover">
                  <span className="text-caption text-[var(--foreground-secondary)]">Minimum Viable Shift</span>
                  <p className="text-xs text-[var(--foreground)] mt-0.5">{diagnosisResult.diagnosis.minimumViableShift}</p>
                </div>
              </div>

              <div className="text-caption text-[var(--foreground-secondary)]">
                Source: <span className="text-[var(--foreground)]">{diagnosisResult.diagnosis.source}</span>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Trigger Recommendation ═══════════════════ */}
          {step === 3 && diagnosisResult && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Trigger Recommendation</h4>
                <p className="text-caption text-[var(--foreground-secondary)]">
                  Optimal psychological trigger selected from the trigger matrix and empirical performance data.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-glass-hover">
                  <span className="text-caption text-[var(--foreground-secondary)]">Primary Trigger</span>
                  <p className="text-sm font-semibold text-[var(--foreground)] mt-0.5">
                    {TRIGGER_LABELS[diagnosisResult.hypothesis.primaryTrigger as PsychTrigger]?.label ?? diagnosisResult.hypothesis.primaryTrigger}
                  </p>
                </div>
                {diagnosisResult.hypothesis.secondaryTrigger && (
                  <div className="p-3 rounded-lg bg-glass-hover">
                    <span className="text-caption text-[var(--foreground-secondary)]">Secondary Trigger</span>
                    <p className="text-sm font-semibold text-[var(--foreground)] mt-0.5">
                      {TRIGGER_LABELS[diagnosisResult.hypothesis.secondaryTrigger as PsychTrigger]?.label ?? diagnosisResult.hypothesis.secondaryTrigger}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-glass-hover">
                <span className="text-caption text-[var(--foreground-secondary)]">Rationale</span>
                <p className="text-xs text-[var(--foreground)] mt-0.5">{diagnosisResult.hypothesis.triggerRationale}</p>
              </div>

              <div className="p-3 rounded-lg bg-glass-hover">
                <span className="text-caption text-[var(--foreground-secondary)]">Hypothesis</span>
                <p className="text-xs text-[var(--foreground)] mt-0.5 italic">{diagnosisResult.hypothesis.hypothesisText}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-caption px-2 py-0.5 rounded-lg bg-[var(--tint-blue)] text-apple-blue">
                  {diagnosisResult.hypothesis.triggerSource}
                </span>
              </div>
            </div>
          )}

          {/* ═══ STEP 4: Editable Falsification ═══════════════════ */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-1">Falsification Conditions</h4>
                <p className="text-caption text-[var(--foreground-secondary)]">
                  Define the stop-loss. If the metric doesn&apos;t hit the target within the window, the trade is a loss.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Metric</label>
                  <select
                    value={editMetric}
                    onChange={(e) => setEditMetric(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  >
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Target Lift %</label>
                  <input
                    type="number"
                    value={editTarget}
                    onChange={(e) => setEditTarget(Number(e.target.value))}
                    min={1}
                    max={500}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--foreground-secondary)] mb-1 block">Window (days)</label>
                  <input
                    type="number"
                    value={editWindow}
                    onChange={(e) => setEditWindow(Number(e.target.value))}
                    min={3}
                    max={90}
                    className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-glass-hover text-xs text-[var(--foreground)]">
                <span className="font-semibold">Trade condition:</span>{' '}
                If <span className="text-apple-blue font-semibold">{editMetric.toUpperCase()}</span> does not improve by{' '}
                <span className="text-apple-green font-semibold">+{editTarget}%</span> within{' '}
                <span className="text-apple-orange font-semibold">{editWindow} days</span>, close as LOSS.
              </div>
            </div>
          )}

          {/* ═══ STEP 5: Audit Checklist ══════════════════════════ */}
          {step === 5 && audit && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Pre-Launch Audit</h4>
                <span className={`text-caption px-2 py-0.5 rounded-lg font-semibold ${
                  audit.overallPass
                    ? 'bg-[var(--tint-green)] text-apple-green'
                    : 'bg-[var(--tint-red)] text-apple-red'
                }`}>
                  {audit.passCount}/{audit.totalCount} passed
                </span>
              </div>

              <div className="space-y-1.5">
                {audit.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-glass-hover"
                  >
                    <div className={`shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center ${
                      item.passed ? 'bg-[var(--tint-green)]' : 'bg-[var(--tint-red)]'
                    }`}>
                      {item.passed ? (
                        <Check className="h-2.5 w-2.5 text-apple-green" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5 text-apple-red" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-[var(--foreground)]">{item.label}</span>
                      <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Navigation ─────────────────────────────────── */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <button
          onClick={step === 1 ? onCancel : () => setStep((step - 1) as WizardStep)}
          disabled={loading}
          className="flex items-center gap-1 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] press-scale px-3 py-1.5 rounded-lg"
        >
          <ArrowLeft className="h-3 w-3" />
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        <div>
          {step === 1 && (
            <button
              onClick={handleDiagnose}
              disabled={!canProceedStep1 || loading}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-apple-blue text-white press-scale disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              Diagnose
            </button>
          )}

          {(step === 2 || step === 3) && (
            <button
              onClick={() => setStep((step + 1) as WizardStep)}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-apple-blue text-white press-scale"
            >
              Next
              <ArrowRight className="h-3 w-3" />
            </button>
          )}

          {step === 4 && (
            <button
              onClick={handleRunAudit}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-apple-blue text-white press-scale disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
              Run Audit
            </button>
          )}

          {step === 5 && (
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-apple-green text-white press-scale disabled:opacity-40"
            >
              <Check className="h-3 w-3" />
              Approve Hypothesis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-component ──────────────────────────────────────

function DiagnosisField({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style?: { bg: string; text: string };
}): JSX.Element {
  return (
    <div className="p-3 rounded-lg bg-glass-hover">
      <span className="text-caption text-[var(--foreground-secondary)]">{label}</span>
      <p className="mt-0.5">
        {style ? (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.bg} ${style.text}`}>
            {value}
          </span>
        ) : (
          <span className="text-xs font-semibold text-[var(--foreground)]">{value}</span>
        )}
      </p>
    </div>
  );
}
