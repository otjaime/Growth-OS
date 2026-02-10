'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Database, Beaker, Trash2, RefreshCw,
  AlertTriangle, CheckCircle, Loader2, BarChart3,
  ArrowRight, Shield, Radio,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ModeInfo {
  mode: 'demo' | 'live';
  data: {
    hasRealData: boolean;
    hasDemoData: boolean;
    realEvents: number;
    demoEvents: number;
    marts: { orders: number; spend: number; traffic: number };
  };
}

export default function SettingsPage() {
  const [modeInfo, setModeInfo] = useState<ModeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/settings/mode`);
      if (res.ok) setModeInfo(await res.json());
    } catch {
      setMessage({ type: 'error', text: 'Failed to connect to API' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMode(); }, [fetchMode]);

  const switchMode = async (mode: 'demo' | 'live') => {
    setSwitching(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/settings/mode`, {
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

  const clearDemoData = async () => {
    if (!confirm('Delete all demo data from the database?')) return;
    setClearing(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/settings/clear-demo`, { method: 'POST' });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) await fetchMode();
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear demo data' });
    } finally {
      setClearing(false);
    }
  };

  const rebuildMarts = async () => {
    if (!confirm('Rebuild all analytics tables? This may take a minute.')) return;
    setRebuilding(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/api/settings/rebuild-marts`, { method: 'POST' });
      const data = await res.json();
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
      if (data.success) await fetchMode();
    } catch {
      setMessage({ type: 'error', text: 'Failed to rebuild' });
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const isDemo = modeInfo?.mode === 'demo';
  const hasReal = modeInfo?.data.hasRealData ?? false;
  const hasDemo = modeInfo?.data.hasDemoData ?? false;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-400 mt-1">Configure data mode, manage demo data, and rebuild analytics.</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${
          message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          message.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
          'bg-red-500/10 border-red-500/30 text-red-400'
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
          <Radio className="h-5 w-5 text-blue-400" />
          Data Mode
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Demo */}
          <button
            onClick={() => switchMode('demo')}
            disabled={switching || isDemo}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              isDemo
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-[var(--card-border)] hover:border-purple-500/50 hover:bg-purple-500/5'
            } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Beaker className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Demo Mode</h3>
                  <p className="text-xs text-slate-400">Sample data for testing</p>
                </div>
              </div>
              {isDemo && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs font-medium rounded-full">Active</span>
              )}
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Uses deterministic sample data (7,200+ orders, 2,400 customers) to showcase all dashboard features.
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>📦 7,200+ orders</span>
              <span>👥 2,400 customers</span>
              <span>📊 90 days</span>
            </div>
          </button>

          {/* Live */}
          <button
            onClick={() => switchMode('live')}
            disabled={switching || !isDemo}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              !isDemo
                ? 'border-green-500 bg-green-500/10'
                : 'border-[var(--card-border)] hover:border-green-500/50 hover:bg-green-500/5'
            } ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Database className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Live Mode</h3>
                  <p className="text-xs text-slate-400">Real data from your sources</p>
                </div>
              </div>
              {!isDemo && (
                <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs font-medium rounded-full">Active</span>
              )}
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Shows real data from connected sources (Shopify, Meta Ads, Google Ads, GA4). Connect your data sources first.
            </p>
            {hasReal ? (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle className="h-3 w-3" />
                <span>{modeInfo?.data.realEvents.toLocaleString()} real events</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-yellow-400">
                <AlertTriangle className="h-3 w-3" />
                <span>No real data yet — connect sources first</span>
              </div>
            )}
          </button>
        </div>

        {switching && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Switching mode…
          </div>
        )}
      </div>

      {/* ── Data Overview ────────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          Data Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Demo Events', value: modeInfo?.data.demoEvents, color: 'text-purple-400' },
            { label: 'Real Events', value: modeInfo?.data.realEvents, color: 'text-green-400' },
            { label: 'Orders (Mart)', value: modeInfo?.data.marts.orders, color: 'text-white' },
            { label: 'Spend Records', value: modeInfo?.data.marts.spend, color: 'text-white' },
            { label: 'Traffic Records', value: modeInfo?.data.marts.traffic, color: 'text-white' },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value?.toLocaleString() ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Management ──────────────────────────────────── */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-400" />
          Data Management
        </h2>

        <div className="space-y-4">
          {/* Clear Demo */}
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-400" /> Clear Demo Data
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Remove all sample data. Only real synced data will remain.
              </p>
            </div>
            <button
              onClick={clearDemoData}
              disabled={clearing || !hasDemo}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                hasDemo
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {clearing ? 'Clearing…' : hasDemo ? 'Clear Demo' : 'No demo data'}
            </button>
          </div>

          {/* Rebuild */}
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-400" /> Rebuild Analytics
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Re-process all raw events through staging → marts. Use after clearing demo data.
              </p>
            </div>
            <button
              onClick={rebuildMarts}
              disabled={rebuilding}
              className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              {rebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {rebuilding ? 'Rebuilding…' : 'Rebuild'}
            </button>
          </div>

          {/* No real data warning */}
          {!isDemo && !hasReal && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-medium text-yellow-400">No real data available</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    You&apos;re in live mode but haven&apos;t synced any data yet.
                    Connect your sources and sync, or switch to demo mode.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <a href="/connections" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg flex items-center gap-1 transition-colors">
                      Connect Sources <ArrowRight className="h-3 w-3" />
                    </a>
                    <button onClick={() => switchMode('demo')} className="px-3 py-1.5 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-sm rounded-lg flex items-center gap-1 transition-colors">
                      <Beaker className="h-3 w-3" /> Use Demo
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
