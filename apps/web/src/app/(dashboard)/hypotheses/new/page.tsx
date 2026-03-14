'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { GlassSurface } from '@/components/ui/glass-surface';

const STEPS = [
  'Client + Context',
  'Audience State',
  'Trigger Selection',
  'Creative Brief',
  'Outcomes + Falsification',
  'Conviction + Budget',
];

const FUNNEL_STAGES = ['TOFU', 'MOFU', 'BOFU', 'RETENTION'] as const;

const AWARENESS_LEVELS = [
  { level: 1, name: 'Unaware', desc: 'Does not know they have a problem' },
  { level: 2, name: 'Problem Aware', desc: 'Knows the problem but not the solution' },
  { level: 3, name: 'Solution Aware', desc: 'Knows solutions exist but not your product' },
  { level: 4, name: 'Product Aware', desc: 'Knows your product but hasn\'t bought yet' },
  { level: 5, name: 'Most Aware', desc: 'Knows your product, just needs the right offer' },
] as const;

const CONVICTION_LABELS = ['Speculative', 'Low', 'Moderate', 'High', 'Very High'] as const;

const EMOTION_SUGGESTIONS = ['Fear of missing out', 'Frustration with status quo', 'Desire for status', 'Need for belonging', 'Health anxiety', 'Aspiration'];
const OBJECTION_SUGGESTIONS = ['Too expensive', 'Not sure it works', 'Already have a solution', 'Don\'t trust the brand', 'Bad timing', 'Need more info'];

interface ClientOption {
  id: string;
  name: string;
  vertical: string;
}

interface TriggerRecommendation {
  id: string;
  name: string;
  mechanism: string;
  winRate: number | null;
  confidence: string;
  bestFor: string[];
}

interface FormData {
  clientId: string;
  vertical: string;
  funnelStage: string;
  awarenessLevel: number;
  primaryEmotion: string;
  primaryObjection: string;
  triggerId: string;
  triggerMechanism: string;
  audience: string;
  creativeAngle: string;
  copyHook: string;
  expectedROAS: string;
  expectedCTR: string;
  expectedCVR: string;
  durationDays: string;
  falsificationCondition: string;
  conviction: number;
  budgetOverride: string;
}

const INITIAL_FORM: FormData = {
  clientId: '',
  vertical: '',
  funnelStage: '',
  awarenessLevel: 0,
  primaryEmotion: '',
  primaryObjection: '',
  triggerId: '',
  triggerMechanism: '',
  audience: '',
  creativeAngle: '',
  copyHook: '',
  expectedROAS: '',
  expectedCTR: '',
  expectedCVR: '',
  durationDays: '7',
  falsificationCondition: '',
  conviction: 3,
  budgetOverride: '',
};

export default function NewHypothesisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get('clientId') ?? '';

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM, clientId: initialClientId });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [triggers, setTriggers] = useState<TriggerRecommendation[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingTriggers, setLoadingTriggers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Load clients
  useEffect(() => {
    apiFetch('/api/clients')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          const list = data.clients ?? data;
          setClients(list);
          // Auto-fill vertical if clientId is pre-selected
          if (initialClientId) {
            const found = list.find((c: ClientOption) => c.id === initialClientId);
            if (found) {
              setForm((f) => ({ ...f, vertical: found.vertical }));
            }
          }
        }
        setLoadingClients(false);
      })
      .catch(() => setLoadingClients(false));
  }, [initialClientId]);

  // Load trigger recommendations when reaching step 3
  useEffect(() => {
    if (step === 2 && triggers.length === 0) {
      setLoadingTriggers(true);
      apiFetch('/api/portfolio/trigger-recommend')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) setTriggers(data.triggers ?? data);
          setLoadingTriggers(false);
        })
        .catch(() => setLoadingTriggers(false));
    }
  }, [step, triggers.length]);

  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setValidationError('');
  }, []);

  // Kelly criterion budget estimate
  const kellyBudget = (() => {
    const winProb = form.conviction / 5;
    const expRoas = parseFloat(form.expectedROAS) || 2;
    const b = expRoas - 1;
    if (b <= 0) return 0;
    const kelly = Math.max(0, (winProb * b - (1 - winProb)) / b);
    return Math.round(kelly * 10000); // scale to reasonable ad spend
  })();

  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        if (!form.clientId) { setValidationError('Select a client'); return false; }
        if (!form.funnelStage) { setValidationError('Select a funnel stage'); return false; }
        return true;
      case 1:
        if (!form.awarenessLevel) { setValidationError('Select an awareness level'); return false; }
        if (!form.primaryEmotion.trim()) { setValidationError('Enter primary emotion'); return false; }
        if (!form.primaryObjection.trim()) { setValidationError('Enter primary objection'); return false; }
        return true;
      case 2:
        if (!form.triggerId) { setValidationError('Select a trigger'); return false; }
        if (!form.triggerMechanism.trim()) { setValidationError('Explain why this trigger applies'); return false; }
        return true;
      case 3:
        if (!form.audience.trim()) { setValidationError('Describe the audience'); return false; }
        if (!form.creativeAngle.trim()) { setValidationError('Describe the creative angle'); return false; }
        if (!form.copyHook.trim()) { setValidationError('Write a copy hook'); return false; }
        return true;
      case 4:
        if (!form.expectedROAS) { setValidationError('Enter expected ROAS'); return false; }
        if (form.falsificationCondition.trim().length < 30) {
          setValidationError('Falsification condition must be at least 30 characters');
          return false;
        }
        return true;
      case 5:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
    setValidationError('');
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const body = {
        clientId: form.clientId,
        funnelStage: form.funnelStage,
        awarenessLevel: form.awarenessLevel,
        primaryEmotion: form.primaryEmotion,
        primaryObjection: form.primaryObjection,
        triggerId: form.triggerId,
        triggerMechanism: form.triggerMechanism,
        audience: form.audience,
        creativeAngle: form.creativeAngle,
        copyHook: form.copyHook,
        expectedROAS: parseFloat(form.expectedROAS) || 0,
        expectedCTR: parseFloat(form.expectedCTR) || 0,
        expectedCVR: parseFloat(form.expectedCVR) || 0,
        durationDays: parseInt(form.durationDays, 10) || 7,
        falsificationCondition: form.falsificationCondition,
        conviction: form.conviction,
        budget: form.budgetOverride ? parseFloat(form.budgetOverride) : kellyBudget,
      };

      const res = await apiFetch(`/api/clients/${form.clientId}/hypotheses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push(`/clients/${form.clientId}`);
      } else {
        setValidationError('Failed to create hypothesis. Please try again.');
        setSubmitting(false);
      }
    } catch {
      setValidationError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === form.clientId);
  const selectedTrigger = triggers.find((t) => t.id === form.triggerId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors mb-1">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">New Hypothesis</h1>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1">
            <div
              className={clsx(
                'h-1 rounded-full transition-all',
                i < step ? 'bg-apple-blue' : i === step ? 'bg-apple-blue/60' : 'bg-white/[0.06]',
              )}
            />
            <p className={clsx(
              'text-[10px] mt-1 truncate',
              i <= step ? 'text-apple-blue' : 'text-[var(--foreground-secondary)]/50',
            )}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <GlassSurface className="card p-6">
        {/* Step 1: Client + Context */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Client + Context</h2>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Client</label>
              {loadingClients ? (
                <Loader2 className="h-4 w-4 animate-spin text-apple-blue" />
              ) : (
                <select
                  value={form.clientId}
                  onChange={(e) => {
                    const c = clients.find((cl) => cl.id === e.target.value);
                    updateField('clientId', e.target.value);
                    if (c) updateField('vertical', c.vertical);
                  }}
                  className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {selectedClient && (
              <div>
                <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Vertical</label>
                <p className="text-sm text-[var(--foreground)]">{form.vertical}</p>
              </div>
            )}

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-2 block">Funnel Stage</label>
              <div className="grid grid-cols-4 gap-2">
                {FUNNEL_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => updateField('funnelStage', stage)}
                    className={clsx(
                      'px-3 py-2 text-xs font-medium rounded-lg border transition-all ease-spring',
                      form.funnelStage === stage
                        ? 'border-apple-blue bg-[var(--tint-blue)] text-apple-blue'
                        : 'border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06]',
                    )}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Audience State */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Audience State</h2>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-2 block">Awareness Level</label>
              <div className="space-y-2">
                {AWARENESS_LEVELS.map((al) => (
                  <button
                    key={al.level}
                    onClick={() => updateField('awarenessLevel', al.level)}
                    className={clsx(
                      'w-full text-left px-4 py-3 rounded-lg border transition-all ease-spring',
                      form.awarenessLevel === al.level
                        ? 'border-apple-blue bg-[var(--tint-blue)]'
                        : 'border-[var(--glass-border)] hover:bg-white/[0.06]',
                    )}
                  >
                    <span className={clsx(
                      'text-sm font-medium',
                      form.awarenessLevel === al.level ? 'text-apple-blue' : 'text-[var(--foreground)]',
                    )}>
                      {al.level}. {al.name}
                    </span>
                    <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{al.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Primary Emotion</label>
              <input
                type="text"
                value={form.primaryEmotion}
                onChange={(e) => updateField('primaryEmotion', e.target.value)}
                placeholder="What emotion drives their decision?"
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {EMOTION_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateField('primaryEmotion', s)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.1] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Primary Objection</label>
              <input
                type="text"
                value={form.primaryObjection}
                onChange={(e) => updateField('primaryObjection', e.target.value)}
                placeholder="What is their main reason not to buy?"
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {OBJECTION_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateField('primaryObjection', s)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.1] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Trigger Selection */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Trigger Selection</h2>

            {loadingTriggers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-apple-blue" />
              </div>
            ) : (
              <div className="space-y-3">
                {triggers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateField('triggerId', t.id)}
                    className={clsx(
                      'w-full text-left px-4 py-4 rounded-lg border transition-all ease-spring',
                      form.triggerId === t.id
                        ? 'border-apple-blue bg-[var(--tint-blue)]'
                        : 'border-[var(--glass-border)] hover:bg-white/[0.06]',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={clsx(
                        'text-sm font-semibold',
                        form.triggerId === t.id ? 'text-apple-blue' : 'text-[var(--foreground)]',
                      )}>
                        {t.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {t.winRate != null && (
                          <span className="text-[10px] font-mono text-green-400">
                            {(t.winRate * 100).toFixed(0)}% win
                          </span>
                        )}
                        <span className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                          t.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                          t.confidence === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-gray-500/20 text-gray-400',
                        )}>
                          {t.confidence}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2">{t.mechanism}</p>
                    {t.bestFor.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.bestFor.map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--foreground-secondary)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {form.triggerId && (
              <div>
                <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">
                  Why does this trigger apply? (your reasoning)
                </label>
                <textarea
                  value={form.triggerMechanism}
                  onChange={(e) => updateField('triggerMechanism', e.target.value)}
                  rows={3}
                  placeholder="Explain why this psychological trigger is relevant for this audience..."
                  className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none resize-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 4: Creative Brief */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Creative Brief</h2>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Audience</label>
              <textarea
                value={form.audience}
                onChange={(e) => updateField('audience', e.target.value)}
                rows={3}
                placeholder="Describe the target audience in detail..."
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Creative Angle</label>
              <textarea
                value={form.creativeAngle}
                onChange={(e) => updateField('creativeAngle', e.target.value)}
                rows={3}
                placeholder="What is the creative angle or hook concept?"
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">
                Copy Hook
                <span className="ml-2 text-[var(--foreground-secondary)]/50 normal-case">
                  {form.copyHook.length} chars
                </span>
              </label>
              <textarea
                value={form.copyHook}
                onChange={(e) => updateField('copyHook', e.target.value)}
                rows={2}
                placeholder="The headline or hook that grabs attention..."
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 5: Expected Outcomes + Falsification */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Expected Outcomes + Falsification</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Expected ROAS</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.expectedROAS}
                  onChange={(e) => updateField('expectedROAS', e.target.value)}
                  placeholder="2.5"
                  className="w-full px-3 py-2 text-sm font-mono bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Expected CTR %</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.expectedCTR}
                  onChange={(e) => updateField('expectedCTR', e.target.value)}
                  placeholder="1.5"
                  className="w-full px-3 py-2 text-sm font-mono bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Expected CVR %</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.expectedCVR}
                  onChange={(e) => updateField('expectedCVR', e.target.value)}
                  placeholder="3.0"
                  className="w-full px-3 py-2 text-sm font-mono bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">Duration (days)</label>
              <input
                type="number"
                value={form.durationDays}
                onChange={(e) => updateField('durationDays', e.target.value)}
                className="w-32 px-3 py-2 text-sm font-mono bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">
                Falsification Condition
                <span className="ml-2 text-[var(--foreground-secondary)]/50 normal-case">
                  (min 30 chars — {form.falsificationCondition.length}/30)
                </span>
              </label>
              <textarea
                value={form.falsificationCondition}
                onChange={(e) => updateField('falsificationCondition', e.target.value)}
                rows={3}
                placeholder="Under what measurable conditions would you consider this hypothesis disproven? e.g. 'If ROAS < 1.5x after 7 days with >$500 spend'"
                className="w-full px-3 py-2 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none resize-none"
              />
              <p className="text-[10px] text-[var(--foreground-secondary)]/50 mt-1">
                A falsification condition makes your hypothesis testable. Without it, you cannot objectively judge results.
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Conviction + Budget */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Conviction + Budget</h2>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-3 block">
                Conviction Level: <span className="text-[var(--foreground)]">{form.conviction}/5 — {CONVICTION_LABELS[form.conviction - 1]}</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={form.conviction}
                onChange={(e) => updateField('conviction', parseInt(e.target.value, 10))}
                className="w-full accent-apple-blue"
              />
              <div className="flex justify-between text-[10px] text-[var(--foreground-secondary)]/50 mt-1">
                {CONVICTION_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>

            <GlassSurface className="card p-4 bg-white/[0.03]">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">Kelly-Calculated Budget</p>
              <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
                {formatCurrency(kellyBudget)}
              </p>
              <p className="text-[10px] text-[var(--foreground-secondary)]/50 mt-1">
                Based on conviction ({form.conviction}/5) and expected ROAS ({form.expectedROAS || '?'}x)
              </p>
            </GlassSurface>

            <div>
              <label className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1 block">
                Budget Override (optional)
              </label>
              <input
                type="number"
                value={form.budgetOverride}
                onChange={(e) => updateField('budgetOverride', e.target.value)}
                placeholder={`${kellyBudget}`}
                className="w-48 px-3 py-2 text-sm font-mono bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:border-apple-blue focus:outline-none"
              />
              {form.budgetOverride && parseFloat(form.budgetOverride) > kellyBudget * 1.5 && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Warning: Override is significantly above Kelly recommendation. Higher risk of drawdown.
                </p>
              )}
            </div>

            {/* Review Summary */}
            <GlassSurface className="card p-4 bg-white/[0.03] space-y-2">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">Review Summary</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                <span className="text-[var(--foreground-secondary)]">Client</span>
                <span className="text-[var(--foreground)]">{selectedClient?.name ?? '--'}</span>
                <span className="text-[var(--foreground-secondary)]">Funnel</span>
                <span className="text-[var(--foreground)]">{form.funnelStage || '--'}</span>
                <span className="text-[var(--foreground-secondary)]">Awareness</span>
                <span className="text-[var(--foreground)]">{AWARENESS_LEVELS.find((a) => a.level === form.awarenessLevel)?.name ?? '--'}</span>
                <span className="text-[var(--foreground-secondary)]">Trigger</span>
                <span className="text-[var(--foreground)]">{selectedTrigger?.name ?? '--'}</span>
                <span className="text-[var(--foreground-secondary)]">Expected ROAS</span>
                <span className="text-[var(--foreground)] font-mono">{form.expectedROAS ? `${form.expectedROAS}x` : '--'}</span>
                <span className="text-[var(--foreground-secondary)]">Duration</span>
                <span className="text-[var(--foreground)] font-mono">{form.durationDays}d</span>
                <span className="text-[var(--foreground-secondary)]">Conviction</span>
                <span className="text-[var(--foreground)]">{form.conviction}/5</span>
                <span className="text-[var(--foreground-secondary)]">Budget</span>
                <span className="text-[var(--foreground)] font-mono">
                  {formatCurrency(form.budgetOverride ? parseFloat(form.budgetOverride) : kellyBudget)}
                </span>
              </div>
            </GlassSurface>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <p className="text-xs text-red-400 mt-3">{validationError}</p>
        )}
      </GlassSurface>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className={clsx(
            'flex items-center gap-1 text-sm font-medium px-4 py-2 rounded-lg transition-all ease-spring',
            step === 0
              ? 'text-[var(--foreground-secondary)]/30 cursor-not-allowed'
              : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06]',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="flex items-center gap-1 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] text-sm font-medium px-4 py-2 rounded-lg transition-all ease-spring"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-6 py-2 rounded-lg transition-all ease-spring disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Submit Hypothesis
          </button>
        )}
      </div>
    </div>
  );
}
