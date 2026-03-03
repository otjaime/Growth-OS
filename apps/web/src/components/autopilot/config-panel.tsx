'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Shield, Bell, Save, Loader2, AlertTriangle, Eye, Lightbulb, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { GlassSurface } from '@/components/ui/glass-surface';
import { EmergencyStop } from './emergency-stop';
import { RuleHealth } from './rule-health';
import { MODE_LABELS } from './human-labels';
import type { AutopilotConfig, AutopilotMode } from './types';

const MODE_OPTIONS: { key: AutopilotMode; label: string; icon: typeof Eye; description: string }[] = [
  { key: 'monitor', label: MODE_LABELS.monitor.label, icon: Eye, description: MODE_LABELS.monitor.description },
  { key: 'suggest', label: MODE_LABELS.suggest.label, icon: Lightbulb, description: MODE_LABELS.suggest.description },
  { key: 'auto', label: MODE_LABELS.auto.label, icon: Zap, description: MODE_LABELS.auto.description },
];

const DEFAULT_CONFIG: AutopilotConfig = {
  mode: 'monitor',
  targetRoas: null,
  maxCpa: null,
  dailyBudgetCap: null,
  maxBudgetIncreasePct: 50,
  maxActionsPerDay: 10,
  minSpendBeforeAction: 100,
  minConfidence: 70,
  slackWebhookUrl: null,
  notifyOnCritical: true,
  notifyOnAutoAction: true,
};

export function ConfigPanel() {
  const [config, setConfig] = useState<AutopilotConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether the user has modified the webhook field (to distinguish from masked value)
  const [webhookModified, setWebhookModified] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/autopilot/config');
      if (res.ok) {
        const data = await res.json();
        // The API returns a masked slackWebhookUrl — replace with empty for the input
        setConfig({
          ...DEFAULT_CONFIG,
          ...data,
          slackWebhookUrl: data.hasSlackWebhook ? '' : null,
        });
        setWebhookModified(false);
      }
    } catch (err) {
      setError(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Clean up the saved timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Only include slackWebhookUrl in the payload if the user actually changed it
      const payload = { ...config };
      if (!webhookModified) {
        delete (payload as Record<string, unknown>).slackWebhookUrl;
      }
      const res = await apiFetch('/api/autopilot/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error ?? 'Failed to save');
        return;
      }
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      setWebhookModified(false);
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AutopilotConfig>(key: K, value: AutopilotConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const parseOptionalNumber = (val: string): number | null => {
    if (val === '') return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Auto mode warning */}
      {config.mode === 'auto' && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-[var(--tint-yellow)] border border-apple-yellow/30">
          <AlertTriangle className="h-4 w-4 text-apple-yellow mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-apple-yellow">Auto-Apply is active</p>
            <p className="text-xs text-apple-yellow/80 mt-0.5">
              Copilot will automatically apply budget changes, stop underperforming ads, and restart paused ads without asking you first.
            </p>
          </div>
        </div>
      )}

      {/* Mode selector */}
      <GlassSurface className="card p-5" intensity="subtle">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-apple-purple" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Operating Mode</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODE_OPTIONS.map(({ key, label, icon: Icon, description }) => {
            const isActive = config.mode === key;
            return (
              <button
                key={key}
                onClick={() => updateField('mode', key)}
                className={`text-left p-3 rounded-lg border transition-all ease-spring ${
                  isActive
                    ? 'border-apple-blue bg-[var(--tint-blue)]'
                    : 'border-[var(--glass-border)] bg-[var(--glass-bg-thin)] hover:bg-[var(--glass-bg)]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className={`h-4 w-4 ${isActive ? 'text-apple-blue' : 'text-[var(--foreground-secondary)]'}`} />
                  <span className={`text-sm font-semibold ${isActive ? 'text-apple-blue' : 'text-[var(--foreground)]'}`}>
                    {label}
                  </span>
                </div>
                <p className="text-label leading-relaxed text-[var(--foreground-secondary)]">{description}</p>
              </button>
            );
          })}
        </div>
      </GlassSurface>

      {/* Target thresholds */}
      <GlassSurface className="card p-5" intensity="subtle">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-apple-blue" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Thresholds &amp; Limits</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Target ROAS */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Target Return
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 2.5"
              value={config.targetRoas ?? ''}
              onChange={(e) => updateField('targetRoas', parseOptionalNumber(e.target.value))}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Max CPA */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Max Cost per Sale ($)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              placeholder="e.g. 50"
              value={config.maxCpa ?? ''}
              onChange={(e) => updateField('maxCpa', parseOptionalNumber(e.target.value))}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Daily Budget Cap */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Daily Budget Cap ($)
            </label>
            <input
              type="number"
              step="10"
              min="0"
              placeholder="e.g. 5000"
              value={config.dailyBudgetCap ?? ''}
              onChange={(e) => updateField('dailyBudgetCap', parseOptionalNumber(e.target.value))}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Max Budget Increase % */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Max Budget Increase %
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={config.maxBudgetIncreasePct}
                onChange={(e) => updateField('maxBudgetIncreasePct', Number(e.target.value))}
                className="flex-1 accent-apple-blue"
              />
              <span className="text-sm font-medium text-[var(--foreground)] w-12 text-right">
                {config.maxBudgetIncreasePct}%
              </span>
            </div>
          </div>

          {/* Max Actions Per Day */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Max Actions Per Day
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="50"
              value={config.maxActionsPerDay}
              onChange={(e) => updateField('maxActionsPerDay', Number(e.target.value) || 10)}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Min Spend Before Action */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Min Spend Before Action ($)
            </label>
            <input
              type="number"
              step="10"
              min="0"
              placeholder="e.g. 100"
              value={config.minSpendBeforeAction}
              onChange={(e) => updateField('minSpendBeforeAction', Number(e.target.value) || 0)}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Min Confidence for Auto-Execute */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Min Confidence for Auto-Execute
            </label>
            <p className="text-caption text-[var(--foreground-secondary)]/60 mt-0.5 mb-1.5">
              Only auto-execute diagnoses above this confidence level (0-100)
            </p>
            <input
              type="number"
              min={0}
              max={100}
              value={config.minConfidence}
              onChange={(e) => updateField('minConfidence', parseInt(e.target.value) || 0)}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>
        </div>
      </GlassSurface>

      {/* Notifications */}
      <GlassSurface className="card p-5" intensity="subtle">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-apple-green" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h3>
        </div>
        <div className="space-y-4">
          {/* Slack Webhook */}
          <div>
            <label className="block text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1.5">
              Slack Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={config.slackWebhookUrl ?? ''}
              onChange={(e) => {
                updateField('slackWebhookUrl', e.target.value || null);
                setWebhookModified(true);
              }}
              className="w-full text-sm bg-[var(--glass-bg-thin)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/40 focus:outline-none focus:border-apple-blue transition-colors"
            />
          </div>

          {/* Toggle: Notify on Critical */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground)]">Alert me on urgent issues</p>
              <p className="text-xs text-[var(--foreground-secondary)]">Get a Slack message when something needs attention now</p>
            </div>
            <button
              role="switch"
              aria-checked={config.notifyOnCritical}
              aria-label="Notify on critical diagnoses"
              onClick={() => updateField('notifyOnCritical', !config.notifyOnCritical)}
              className={`relative w-10 h-6 rounded-full transition-colors ease-spring ${
                config.notifyOnCritical ? 'bg-apple-green' : 'bg-[var(--glass-bg)]'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ease-spring ${
                  config.notifyOnCritical ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggle: Notify on Auto Action */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground)]">Alert me on auto actions</p>
              <p className="text-xs text-[var(--foreground-secondary)]">Get notified when Copilot makes a change automatically</p>
            </div>
            <button
              role="switch"
              aria-checked={config.notifyOnAutoAction}
              aria-label="Notify on auto actions"
              onClick={() => updateField('notifyOnAutoAction', !config.notifyOnAutoAction)}
              className={`relative w-10 h-6 rounded-full transition-colors ease-spring ${
                config.notifyOnAutoAction ? 'bg-apple-green' : 'bg-[var(--glass-bg)]'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ease-spring ${
                  config.notifyOnAutoAction ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </GlassSurface>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--tint-red)] border border-apple-red/30">
          <AlertTriangle className="h-3.5 w-3.5 text-apple-red shrink-0" />
          <p className="text-xs text-apple-red">{error}</p>
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-apple-blue hover:bg-apple-blue/90 px-5 py-2.5 rounded-lg transition-all ease-spring disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {saved && (
          <span className="text-xs text-apple-green font-medium">Saved successfully</span>
        )}
      </div>

      {/* Rule Effectiveness */}
      <div className="pt-4 border-t border-[var(--glass-border)]">
        <RuleHealth />
      </div>

      {/* Emergency Stop — visible only in auto or suggest modes */}
      {(config.mode === 'auto' || config.mode === 'suggest') && (
        <div className="pt-2 border-t border-[var(--glass-border)]">
          <EmergencyStop onStopped={() => {
            setConfig(prev => ({ ...prev, mode: 'monitor' }));
          }} />
        </div>
      )}
    </div>
  );
}
