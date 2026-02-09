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
} from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import type { ConnectorDef } from './types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SetupWizardProps {
  connector: ConnectorDef;
  onClose: () => void;
  onSaved: () => void;
}

type WizardStep = 'guide' | 'credentials' | 'test' | 'done';

export function SetupWizard({ connector, onClose, onSaved }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('guide');
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
      const res = await fetch(`${API}/api/connections`, {
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
      const res = await fetch(`${API}/api/connections/${connector.id}/test`, { method: 'POST' });
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
        await fetch(`${API}/api/connections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorType: connector.id, fields }),
        });
      } catch { /* continue to OAuth anyway */ }
      setSaving(false);
      window.location.href = `${API}/api/auth/google?source=${connector.id}`;
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <ConnectorIcon icon={connector.icon} color={connector.color} size="sm" />
            <div>
              <h2 className="text-white font-semibold text-lg">{connector.name}</h2>
              <p className="text-xs text-slate-400">
                {step === 'guide' && 'Setup Guide'}
                {step === 'credentials' && 'Enter Credentials'}
                {step === 'test' && 'Test Connection'}
                {step === 'done' && 'Connected!'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-700/50">
          {(['guide', 'credentials', 'test', 'done'] as WizardStep[]).map((s, i) => {
            const labels = ['Guide', 'Credentials', 'Test', 'Done'];
            const active = s === step;
            const completed = ['guide', 'credentials', 'test', 'done'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 text-xs font-medium ${active ? 'text-blue-400' : completed ? 'text-green-400' : 'text-slate-500'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${active ? 'bg-blue-500/20 ring-1 ring-blue-500' : completed ? 'bg-green-500/20 ring-1 ring-green-500' : 'bg-slate-700 ring-1 ring-slate-600'}`}>
                    {completed ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{labels[i]}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-px mx-2 ${completed ? 'bg-green-500/40' : 'bg-slate-700'}`} />}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-220px)]">
          {/* ── Step 1: Setup Guide ── */}
          {step === 'guide' && (
            <div className="space-y-5">
              <p className="text-slate-300 text-sm">{connector.description}</p>

              <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <h3 className="text-white font-medium text-sm mb-3">Setup Instructions</h3>
                <ol className="space-y-3">
                  {connector.setupGuide.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {connector.docsUrl && (
                <a
                  href={connector.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> View official documentation
                </a>
              )}
            </div>
          )}

          {/* ── Step 2: Credentials ── */}
          {step === 'credentials' && (
            <div className="space-y-5">
              {connector.authType === 'oauth2' && connector.fields.length > 0 && (
                <p className="text-sm text-slate-400">
                  Fill in the fields below, then click &quot;Connect with Google&quot; to authorize.
                </p>
              )}

              <div className="space-y-4">
                {connector.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        value={fields[field.key] ?? field.options?.[0]?.value ?? ''}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all pr-10"
                        />
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => togglePassword(field.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                          >
                            {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    )}

                    {field.help && (
                      <p className="text-xs text-slate-500 mt-1">{field.help}</p>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
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
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                  <h3 className="text-white font-medium text-sm mb-2">Your Webhook URL</h3>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-900 rounded-lg px-3 py-2 text-sm text-blue-300 font-mono break-all">
                      {webhookUrl}
                    </code>
                    <button onClick={handleCopyWebhook} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">POST JSON payloads to this URL to ingest data.</p>
                </div>
              )}

              <div className="text-center py-6">
                <p className="text-sm text-slate-300 mb-4">
                  Credentials saved securely. Test the connection to make sure everything is working.
                </p>

                {testResult && (
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm mb-4 ${
                    testResult.success
                      ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400'
                  }`}>
                    {testResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {testResult.message}
                  </div>
                )}

                <div>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2"
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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 ring-2 ring-green-500/30 mb-4">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{connector.name} Connected!</h3>
              <p className="text-sm text-slate-400 mb-6">
                Your connection is active and ready to sync data.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/30">
          <div>
            {step !== 'guide' && step !== 'done' && (
              <button
                onClick={() => setStep(step === 'test' ? 'credentials' : 'guide')}
                className="flex items-center gap-1 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === 'guide' && (
              <button
                onClick={() => setStep('credentials')}
                className="flex items-center gap-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === 'credentials' && connector.authType === 'oauth2' && (
              <button
                onClick={handleOAuth}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Connect with Google
              </button>
            )}

            {step === 'credentials' && connector.authType !== 'oauth2' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Save & Continue
              </button>
            )}

            {step === 'test' && !testResult?.success && (
              <button
                onClick={() => { setStep('done'); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Skip test
              </button>
            )}

            {step === 'done' && (
              <button
                onClick={() => { onSaved(); onClose(); }}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition-colors"
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
