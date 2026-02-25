'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, API } from '@/lib/api';
import { CheckCircle2, Circle, Loader2, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react';

type Step = 'connect' | 'sync' | 'diagnose' | 'done';

interface StepConfig {
  id: Step;
  title: string;
  description: string;
}

const STEPS: StepConfig[] = [
  { id: 'connect', title: 'Connect Meta Ads', description: 'Link your Meta ad account for campaign data' },
  { id: 'sync', title: 'First Sync', description: 'Pull ad-level creative and performance data' },
  { id: 'diagnose', title: 'First Diagnosis', description: 'Run the diagnosis engine on your ads' },
  { id: 'done', title: 'Ready!', description: 'Your autopilot is set up and ready to go' },
];

export default function SetupPage() {
  const [currentStep, setCurrentStep] = useState<Step>('connect');
  const [metaConnected, setMetaConnected] = useState(false);
  const [syncResult, setSyncResult] = useState<{ adsUpserted?: number } | null>(null);
  const [diagResult, setDiagResult] = useState<{ diagnosesCreated?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Meta is already connected
  useEffect(() => {
    apiFetch('/api/connections')
      .then((r) => r.json())
      .then((data: { connections?: Array<{ connectorType: string; status: string }> }) => {
        const meta = data.connections?.find((c) => c.connectorType === 'meta_ads');
        if (meta && meta.status !== 'error') {
          setMetaConnected(true);
          setCurrentStep('sync');
        }
      })
      .catch(() => {});
  }, []);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'meta_ads') {
      setMetaConnected(true);
      setCurrentStep('sync');
    }
    if (params.get('error')) {
      setError(params.get('error'));
    }
  }, []);

  const handleSync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/autopilot/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? data.detail ?? 'Sync failed');
      }
      setSyncResult(data);
      setCurrentStep('diagnose');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDiagnose = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/autopilot/run-diagnosis', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Diagnosis failed');
      }
      setDiagResult(data);
      setCurrentStep('done');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  function getStepStatus(step: Step): 'completed' | 'current' | 'upcoming' {
    const stepIdx = STEPS.findIndex((s) => s.id === step);
    const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'current';
    return 'upcoming';
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-zinc-100 mb-2">Set up your Autopilot</h1>
      <p className="text-zinc-400 mb-10">
        Connect Meta Ads, sync data, and run your first diagnosis in under 3 minutes.
      </p>

      {/* Progress steps */}
      <div className="mb-10 space-y-1">
        {STEPS.map((step, i) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                {status === 'completed' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : status === 'current' ? (
                  <Circle className="w-6 h-6 text-blue-400" />
                ) : (
                  <Circle className="w-6 h-6 text-zinc-600" />
                )}
                {i < STEPS.length - 1 && (
                  <div className={`w-0.5 h-8 ${status === 'completed' ? 'bg-emerald-400/40' : 'bg-zinc-700'}`} />
                )}
              </div>
              <div className="pb-6">
                <p className={`font-medium ${status === 'current' ? 'text-zinc-100' : status === 'completed' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {step.title}
                </p>
                <p className="text-sm text-zinc-500">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Step content */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        {currentStep === 'connect' && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">Connect your Meta Ads account</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Go to the Connections page to add your Meta Ads API credentials, then return here.
            </p>
            <div className="flex gap-3">
              <a
                href="/connections"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
              >
                Go to Connections <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => {
                  setMetaConnected(true);
                  setCurrentStep('sync');
                }}
                className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
              >
                Skip (I&apos;ll connect later)
              </button>
            </div>
          </div>
        )}

        {currentStep === 'sync' && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">Pull your ad data</h2>
            <p className="text-zinc-400 text-sm mb-6">
              {metaConnected
                ? 'Click below to sync your Meta Ads campaigns, ad sets, and ad-level creative data.'
                : 'Meta Ads not connected — using demo data for this step.'}
            </p>
            <button
              onClick={handleSync}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? 'Syncing...' : 'Start Sync'}
            </button>
          </div>
        )}

        {currentStep === 'diagnose' && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">Run first diagnosis</h2>
            <p className="text-zinc-400 text-sm mb-2">
              Sync complete! {syncResult?.adsUpserted ?? 0} ads loaded.
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              Now let&apos;s analyze your ads for creative fatigue, wasted spend, and scaling opportunities.
            </p>
            <button
              onClick={handleDiagnose}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? 'Analyzing...' : 'Run Diagnosis'}
            </button>
          </div>
        )}

        {currentStep === 'done' && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">You&apos;re all set!</h2>
            <p className="text-zinc-400 text-sm mb-2">
              {diagResult && diagResult.diagnosesCreated && diagResult.diagnosesCreated > 0
                ? `Found ${diagResult.diagnosesCreated} diagnosis actions for your ads.`
                : 'All clear — no issues detected. Your ads look healthy!'}
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              Head to the Autopilot inbox to review and action diagnoses.
            </p>
            <a
              href="/autopilot"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Open Autopilot <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
