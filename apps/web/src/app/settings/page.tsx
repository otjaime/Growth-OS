'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database, Beaker, Trash2,
  AlertTriangle, CheckCircle, Loader2, BarChart3,
  ArrowRight, Shield, Radio, Key, Eye, EyeOff, Save,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ModeInfo {
  mode: 'demo' | 'live';
  data: {
    hasDemoData: boolean;
    totalEvents: number;
    marts: { orders: number; spend: number; traffic: number };
  };
}

interface GoogleOAuthInfo {
  configured: boolean;
  clientId: string;
  hasSecret: boolean;
  redirectUri: string;
}

export default function SettingsPage() {
  const [modeInfo, setModeInfo] = useState<ModeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Google OAuth state
  const [googleOAuth, setGoogleOAuth] = useState<GoogleOAuthInfo | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [googleRedirectUri, setGoogleRedirectUri] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);

  const fetchMode = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/settings/mode`);
      if (res.ok) setModeInfo(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to connect to API' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGoogleOAuth = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/settings/google-oauth`);
      if (res.ok) {
        const data: GoogleOAuthInfo = await res.json();
        setGoogleOAuth(data);
        setGoogleClientId(data.clientId);
        setGoogleRedirectUri(data.redirectUri);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchMode(); fetchGoogleOAuth(); }, [fetchMode, fetchGoogleOAuth]);

  const switchMode = async (mode: 'demo' | 'live') => {
    setSwitching(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/settings/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) await fetchMode();
    } catch {
      setMessage({ type: 'error', text: 'Failed to switch mode' });
    } finally {
      setSwitching(false);
    }
  };

  const clearAllData = async () => {
    if (!confirm('This will delete ALL data (demo + real) from the database. Are you sure?')) return;
    setClearing(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/settings/clear-data`, { method: 'POST' });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) await fetchMode();
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear data' });
    } finally {
      setClearing(false);
    }
  };

  const seedDemo = async () => {
    if (!confirm('Seed demo data? This may take 2-3 minutes.')) return;
    setSeeding(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/settings/seed-demo`, { method: 'POST' });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) await fetchMode();
    } catch {
      setMessage({ type: 'error', text: 'Failed to seed demo data' });
    } finally {
      setSeeding(false);
    }
  };

  const saveGoogleOAuth = async () => {
    if (!googleClientId || !googleClientSecret) {
      setMessage({ type: 'error', text: 'Client ID and Client Secret are required.' });
      return;
    }
    setSavingGoogle(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/settings/google-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          redirectUri: googleRedirectUri || undefined,
        }),
      });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) {
        setGoogleClientSecret('');
        await fetchGoogleOAuth();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save Google OAuth credentials' });
    } finally {
      setSavingGoogle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-apple-blue" />
      </div>
    );
  }

  const isDemo = modeInfo?.mode === 'demo';
  const hasData = (modeInfo?.data.totalEvents ?? 0) > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--foreground-secondary)] mt-1">Configure data mode, manage demo data, and rebuild analytics.</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${
          message.type === 'success' ? 'bg-[var(--tint-green)] border-apple-green/30 text-apple-green' :
          message.type === 'warning' ? 'bg-yellow-500/10 border-apple-yellow/30 text-apple-yellow' :
          'bg-[var(--tint-red)] border-apple-red/30 text-apple-red'
        }`}>
          {message.type === 'success'
            ? <CheckCircle className="h-5 w-5 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* ── Mode Toggle ─────────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Radio className="h-5 w-5 text-apple-blue" />
          Data Mode
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Demo */}
          <button
            onClick={() => switchMode('demo')}
            disabled={switching || isDemo}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              isDemo
                ? 'border-apple-purple bg-[var(--tint-purple)]'
                : 'border-[var(--card-border)] hover:border-apple-purple/50 hover:bg-apple-purple/5'
            } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--tint-purple)]">
                  <Beaker className="h-6 w-6 text-apple-purple" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Demo Mode</h3>
                  <p className="text-xs text-[var(--foreground-secondary)]">Sample data for testing</p>
                </div>
              </div>
              {isDemo && (
                <span className="px-2 py-1 bg-[var(--tint-purple)] text-apple-purple text-xs font-medium rounded-full">Active</span>
              )}
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] mb-3">
              Uses deterministic sample data (7,200+ orders, 2,400 customers) to showcase all dashboard features.
            </p>
            <div className="flex items-center gap-4 text-xs text-[var(--foreground-secondary)]/70">
              <span>📦 ~7,200 orders</span>
              <span>👥 ~2,400 customers</span>
              <span>📊 90 days</span>
            </div>
          </button>

          {/* Live */}
          <button
            onClick={() => switchMode('live')}
            disabled={switching || !isDemo}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              !isDemo
                ? 'border-apple-green bg-[var(--tint-green)]'
                : 'border-[var(--card-border)] hover:border-apple-green/50 hover:bg-apple-green/5'
            } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--tint-green)]">
                  <Database className="h-6 w-6 text-apple-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Live Mode</h3>
                  <p className="text-xs text-[var(--foreground-secondary)]">Real data from your sources</p>
                </div>
              </div>
              {!isDemo && (
                <span className="px-2 py-1 bg-[var(--tint-green)] text-apple-green text-xs font-medium rounded-full">Active</span>
              )}
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] mb-3">
              Shows real data from connected sources (Shopify, Meta Ads, Google Ads, GA4). Connect your data sources first.
            </p>
            {hasData ? (
              <div className="flex items-center gap-2 text-xs text-apple-green">
                <CheckCircle className="h-3 w-3" />
                <span>{modeInfo?.data.totalEvents.toLocaleString()} events in database</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-apple-yellow">
                <AlertTriangle className="h-3 w-3" />
                <span>No data yet — connect sources and sync</span>
              </div>
            )}
          </button>
        </div>

        {switching && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Switching mode…
          </div>
        )}
      </div>

      {/* ── Google OAuth Configuration ─────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Key className="h-5 w-5 text-apple-blue" />
          Google OAuth
        </h2>
        <p className="text-sm text-[var(--foreground-secondary)] mb-4">
          Required for Google Ads and GA4 connections. Get credentials from the{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-apple-blue hover:underline">
            Google Cloud Console
          </a>.
        </p>

        {googleOAuth?.configured && (
          <div className="mb-4 p-3 bg-[var(--tint-green)] border border-apple-green/20 rounded-lg flex items-center gap-2 text-sm text-apple-green">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Google OAuth is configured. You can update the credentials below.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">Client ID</label>
            <input
              type="text"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="123456789-xxxxxxx.apps.googleusercontent.com"
              className="w-full px-3 py-2 bg-white/[0.04] border border-[var(--glass-border)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)]/50 focus:outline-none focus:border-apple-blue transition-all ease-spring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder={googleOAuth?.hasSecret ? '(saved — enter new value to update)' : 'GOCSPX-xxxxxxx'}
                className="w-full px-3 py-2 pr-10 bg-white/[0.04] border border-[var(--glass-border)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)]/50 focus:outline-none focus:border-apple-blue transition-all ease-spring"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
              Redirect URI <span className="text-[var(--foreground-secondary)]/70 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={googleRedirectUri}
              onChange={(e) => setGoogleRedirectUri(e.target.value)}
              placeholder="http://localhost:4000/api/auth/google/callback"
              className="w-full px-3 py-2 bg-white/[0.04] border border-[var(--glass-border)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)]/50 focus:outline-none focus:border-apple-blue transition-all ease-spring"
            />
            <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">
              Must match the authorized redirect URI in your Google Cloud Console.
            </p>
          </div>

          <button
            onClick={saveGoogleOAuth}
            disabled={savingGoogle || (!googleClientId && !googleClientSecret)}
            className="px-4 py-2 bg-apple-blue hover:bg-apple-blue/90 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--foreground)] rounded-lg text-sm font-medium flex items-center gap-2 transition-all ease-spring"
          >
            {savingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingGoogle ? 'Saving…' : 'Save Google Credentials'}
          </button>
        </div>
      </div>

      {/* ── Data Overview ────────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-apple-blue" />
          Data Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Raw Events', value: modeInfo?.data.totalEvents, color: 'text-apple-blue' },
            { label: 'Orders (Mart)', value: modeInfo?.data.marts.orders, color: 'text-[var(--foreground)]' },
            { label: 'Spend Records', value: modeInfo?.data.marts.spend, color: 'text-[var(--foreground)]' },
            { label: 'Traffic Records', value: modeInfo?.data.marts.traffic, color: 'text-[var(--foreground)]' },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.04] rounded-lg p-4">
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value?.toLocaleString() ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Management ──────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-apple-blue" />
          Data Management
        </h2>

        <div className="space-y-4">
          {/* Seed Demo */}
          <div className="flex items-center justify-between p-4 bg-white/[0.04] rounded-lg">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Beaker className="h-4 w-4 text-apple-purple" /> Seed Demo Data
              </h3>
              <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                Generate ~12,000 sample records (orders, ads, traffic) to explore the dashboard.
              </p>
            </div>
            <button
              onClick={seedDemo}
              disabled={seeding}
              className="px-4 py-2 bg-[var(--tint-purple)] text-apple-purple hover:bg-apple-purple/30 border border-apple-purple/30 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ease-spring"
            >
              {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />}
              {seeding ? 'Seeding…' : 'Seed Demo'}
            </button>
          </div>

          {/* Clear All Data */}
          <div className="flex items-center justify-between p-4 bg-white/[0.04] rounded-lg">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-apple-red" /> Clear All Data
              </h3>
              <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                Delete all raw events, marts, and job history. Use before switching from demo to real data.
              </p>
            </div>
            <button
              onClick={clearAllData}
              disabled={clearing || !hasData}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ease-spring ${
                hasData
                  ? 'bg-[var(--tint-red)] text-apple-red hover:bg-apple-red/30 border border-apple-red/30'
                  : 'bg-white/[0.06] text-[var(--foreground-secondary)]/70 cursor-not-allowed'
              }`}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {clearing ? 'Clearing…' : hasData ? 'Clear All' : 'No data'}
            </button>
          </div>

          {/* No data + live mode warning */}
          {!isDemo && !hasData && (
            <div className="p-4 bg-yellow-500/10 border border-apple-yellow/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-apple-yellow mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-medium text-apple-yellow">No data available</h3>
                  <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                    Connect your data sources and run a sync, or seed demo data to explore the dashboard.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <a href="/connections" className="px-3 py-1.5 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] text-sm rounded-lg flex items-center gap-1 transition-all ease-spring">
                      Connect Sources <ArrowRight className="h-3 w-3" />
                    </a>
                    <button onClick={() => seedDemo()} className="px-3 py-1.5 bg-[var(--tint-purple)] text-apple-purple hover:bg-apple-purple/30 text-sm rounded-lg flex items-center gap-1 transition-all ease-spring">
                      <Beaker className="h-3 w-3" /> Seed Demo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
