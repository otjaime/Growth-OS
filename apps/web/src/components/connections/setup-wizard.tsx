'use client';

import { useState } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Check,
  Clock,
  ArrowUpRight,
  Lightbulb,
  Database,
} from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import type { ConnectorDef } from './types';
import { API, apiFetch } from '@/lib/api';

interface SetupWizardProps {
  connector: ConnectorDef;
  onClose: () => void;
  onSaved: () => void;
  initialStep?: WizardStep;
}

type WizardStep = 'guide' | 'credentials' | 'test' | 'done';

export function SetupWizard({ connector, onClose, onSaved, initialStep }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialStep ?? 'guide');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const togglePassword = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    // Validate required fields
    const missing = connector.fields.filter((f) => f.required && !fields[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorType: connector.id, fields }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? 'Failed to save connection');
        setSaving(false);
        return;
      }
      if (data.webhookUrl) {
        setWebhookUrl(data.webhookUrl);
      }
      setStep('test');
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`/api/connections/${connector.id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
      if (data.success) {
        setTimeout(() => setStep('done'), 1500);
      }
    } catch {
      setTestResult({ success: false, message: 'Network error — could not reach API' });
    }
    setTesting(false);
  };

  const handleOAuth = () => {
    // Save non-sensitive fields first, then redirect to OAuth
    const save = async () => {
      setSaving(true);
      try {
        await apiFetch(`/api/connections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorType: connector.id, fields }),
        });
      } catch { /* continue to OAuth anyway */ }
      setSaving(false);
      if (connector.id === 'shopify') {
        window.location.href = `${API}/api/auth/shopify`;
      } else {
        window.location.href = `${API}/api/auth/google?source=${connector.id}`;
      }
    };
    save();
  };

  const handleCopyWebhook = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[var(--glass-bg-elevated)] border border-[var(--glass-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-3">
            <ConnectorIcon icon={connector.icon} color={connector.color} size="sm" />
            <div>
              <h2 className="text-[var(--foreground)] font-semibold text-lg">{connector.name}</h2>
              <p className="text-xs text-[var(--foreground-secondary)]">
                {step === 'guide' && 'Setup Guide'}
                {step === 'credentials' && 'Enter Credentials'}
                {step === 'test' && 'Test Connection'}
                {step === 'done' && 'Connected!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/[0.1] rounded-lg transition-all ease-spring">
            <X className="h-5 w-5 text-[var(--foreground-secondary)]" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-[var(--glass-border)]/50">
          {(['guide', 'credentials', 'test', 'done'] as WizardStep[]).map((s, i) => {
            const labels = ['Guide', 'Credentials', 'Test', 'Done'];
            const active = s === step;
            const completed = ['guide', 'credentials', 'test', 'done'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 text-xs font-medium ${active ? 'text-apple-blue' : completed ? 'text-apple-green' : 'text-[var(--foreground-secondary)]/70'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${active ? 'bg-[var(--tint-blue)] ring-1 ring-apple-blue' : completed ? 'bg-[var(--tint-green)] ring-1 ring-green-500' : 'bg-white/[0.06] ring-1 ring-[var(--glass-border)]'}`}>
                    {completed ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{labels[i]}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-px mx-2 ${completed ? 'bg-apple-green/40' : 'bg-white/[0.06]'}`} />}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-220px)]">
          {/* ── Step 1: Setup Guide ── */}
          {step === 'guide' && (
            <div className="space-y-5">
              <p className="text-[var(--foreground)]/80 text-sm">{connector.description}</p>

              {/* Quick-info pills */}
              <div className="flex flex-wrap gap-2">
                {connector.setupTime && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[var(--tint-blue)] text-apple-blue px-3 py-1.5 rounded-full border border-apple-blue/20">
                    <Clock className="h-3 w-3" /> {connector.setupTime}
                  </span>
                )}
                {connector.quickFindPath && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-apple-yellow/10 text-apple-yellow px-3 py-1.5 rounded-full border border-apple-yellow/20">
                    <Lightbulb className="h-3 w-3" /> {connector.quickFindPath}
                  </span>
                )}
              </div>

              {/* Data synced preview */}
              {connector.dataSync && connector.dataSync.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[var(--foreground-secondary)]/70 flex items-center gap-1"><Database className="h-3 w-3" /> Data synced:</span>
                  {connector.dataSync.map((d) => (
                    <span key={d} className="text-[11px] bg-white/[0.04] text-[var(--foreground)]/80 px-2 py-0.5 rounded-md">{d}</span>
                  ))}
                </div>
              )}

              {/* Rich step-by-step guide */}
              <div className="space-y-3">
                {connector.setupGuide.map((guideStep, i) => {
                  const s = typeof guideStep === 'string' ? { text: guideStep } : guideStep;
                  return (
                    <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-[var(--glass-border)]/50 hover:border-[var(--glass-border-hover)]/70 transition-all ease-spring">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--tint-blue)] text-apple-blue flex items-center justify-center text-xs font-bold ring-1 ring-apple-blue/30">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--foreground)] leading-relaxed">{s.text}</p>
                          {s.tip && (
                            <p className="text-xs text-[var(--foreground-secondary)] mt-1.5 flex items-start gap-1.5">
                              <Lightbulb className="h-3 w-3 text-apple-yellow mt-0.5 flex-shrink-0" />
                              <span>{s.tip}</span>
                            </p>
                          )}
                          {s.url && s.urlLabel && (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-xs text-apple-blue hover:text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/90/20 px-3 py-1.5 rounded-lg transition-all ease-spring font-medium"
                            >
                              <ArrowUpRight className="h-3 w-3" /> {s.urlLabel}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {connector.docsUrl && (
                <a
                  href={connector.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-apple-blue hover:text-apple-blue transition-all ease-spring"
                >
                  <ExternalLink className="h-4 w-4" /> View official API documentation
                </a>
              )}
            </div>
          )}

          {/* ── Step 2: Credentials ── */}
          {step === 'credentials' && (
            <div className="space-y-5">
              {connector.authType === 'oauth2' && connector.fields.length > 0 && (
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Fill in the fields below, then click &quot;Connect with {connector.id === 'shopify' ? 'Shopify' : 'Google'}&quot; to authorize.
                </p>
              )}

              <div className="space-y-4">
                {connector.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-apple-red ml-1">*</span>}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        value={fields[field.key] ?? field.options?.[0]?.value ?? ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2.5 text-[var(--foreground)] text-sm focus:ring-2 focus:ring-apple-blue focus:border-apple-blue transition-all"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                          value={fields[field.key] ?? ''}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-3 py-2.5 text-[var(--foreground)] text-sm focus:ring-2 focus:ring-apple-blue focus:border-apple-blue transition-all pr-10"
                        />
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => togglePassword(field.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all ease-spring"
                          >
                            {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    )}

                    {field.help && (
                      <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">{field.help}</p>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-apple-red bg-[var(--tint-red)] border border-apple-red/20 rounded-lg px-4 py-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Test ── */}
          {step === 'test' && (
            <div className="space-y-5">
              {webhookUrl && (
                <div className="bg-white/[0.04] rounded-xl p-5 border border-[var(--glass-border)]/50">
                  <h3 className="text-[var(--foreground)] font-medium text-sm mb-2">Your Webhook URL</h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-apple-blue font-mono break-all">
                      {webhookUrl}
                    </code>
                    <button onClick={handleCopyWebhook} className="p-2 bg-white/[0.06] hover:bg-white/[0.08] rounded-lg transition-all ease-spring">
                      {copied ? <Check className="h-4 w-4 text-apple-green" /> : <Copy className="h-4 w-4 text-[var(--foreground-secondary)]" />}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--foreground-secondary)]/70 mt-2">POST JSON payloads to this URL to ingest data.</p>
                </div>
              )}

              <div className="text-center py-6">
                <p className="text-sm text-[var(--foreground)]/80 mb-4">
                  Credentials saved securely. Test the connection to make sure everything is working.
                </p>

                {testResult && (
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-4 ${
                    testResult.success
                      ? 'bg-[var(--tint-green)] border border-apple-green/20 text-apple-green'
                      : 'bg-[var(--tint-red)] border border-apple-red/20 text-apple-red'
                  }`}>
                    {testResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {testResult.message}
                  </div>
                )}

                <div>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="px-6 py-3 bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring inline-flex items-center gap-2"
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && (
            <div className="text-center py-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--tint-green)] ring-2 ring-green-500/30 mb-4">
                <CheckCircle className="h-8 w-8 text-apple-green" />
              </div>
              <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">{connector.name} Connected!</h3>
              <p className="text-sm text-[var(--foreground-secondary)] mb-6">
                Your connection is active and ready to sync data.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--glass-border)] bg-white/[0.03]">
          <div>
            {step !== 'guide' && step !== 'done' && (
              <button
                onClick={() => setStep(step === 'test' ? 'credentials' : 'guide')}
                className="flex items-center gap-1 px-4 py-2 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all ease-spring"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'guide' && (
              <button
                onClick={() => setStep('credentials')}
                className="flex items-center gap-1 px-5 py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === 'credentials' && connector.authType === 'oauth2' && (
              <button
                onClick={handleOAuth}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Connect with {connector.id === 'shopify' ? 'Shopify' : 'Google'}
              </button>
            )}

            {step === 'credentials' && connector.authType !== 'oauth2' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-apple-green hover:bg-apple-green disabled:opacity-50 text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Save & Continue
              </button>
            )}

            {step === 'test' && !testResult?.success && (
              <button
                onClick={() => { setStep('done'); }}
                className="px-4 py-2 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all ease-spring"
              >
                Skip test
              </button>
            )}

            {step === 'done' && (
              <button
                onClick={() => { onSaved(); onClose(); }}
                className="px-5 py-2.5 bg-apple-green hover:bg-apple-green text-[var(--foreground)] rounded-xl text-sm font-medium transition-all ease-spring"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
