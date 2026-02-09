'use client';

import { useState } from 'react';
import {
  TestTube,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Clock,
  Zap,
} from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import type { SavedConnection } from './types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ConnectionCardProps {
  connection: SavedConnection;
  onRefresh: () => void;
}

export function ConnectionCard({ connection, onRefresh }: ConnectionCardProps) {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/connections/${connection.connectorType}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ success: data.success, message: data.message });
    } catch {
      setTestResult({ success: false, message: 'Network error' });
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${API}/api/connections/${connection.connectorType}/sync`, { method: 'POST' });
    } catch { /* ignore */ }
    setTimeout(() => {
      setSyncing(false);
      onRefresh();
    }, 3500);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`${API}/api/connections/${connection.connectorType}`, { method: 'DELETE' });
    setDeleting(false);
    setConfirmDelete(false);
    setShowMenu(false);
    onRefresh();
  };

  const statusDot = connection.status === 'active' || connection.status === 'pending'
    ? 'bg-green-500'
    : connection.status === 'syncing'
      ? 'bg-yellow-500 animate-pulse'
      : 'bg-red-500';

  const statusLabel = connection.status === 'active' || connection.status === 'pending'
    ? 'Active'
    : connection.status === 'syncing'
      ? 'Syncing...'
      : 'Error';

  const timeAgo = (date: string | null) => {
    if (!date) return 'Never synced';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5 hover:border-slate-500/50 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <ConnectorIcon icon={connection.icon} color={connection.color} />
          <div>
            <h3 className="text-white font-semibold">{connection.label}</h3>
            <p className="text-xs text-slate-400">{connection.name}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4 text-slate-400" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setShowMenu(false); setConfirmDelete(false); }} />
              <div className="absolute right-0 top-8 z-20 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                <button
                  onClick={() => { handleTest(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <TestTube className="h-4 w-4" /> Test Connection
                </button>
                <button
                  onClick={() => { handleSync(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Sync Now
                </button>
                <hr className="border-slate-700" />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                ) : (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors font-medium"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Confirm Remove
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-xs text-slate-400">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          {timeAgo(connection.lastSyncAt)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
          Test
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-50 text-blue-400 rounded-lg text-xs font-medium transition-colors"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Sync
        </button>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs ${
          testResult.success
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {testResult.success ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {testResult.message}
        </div>
      )}
    </div>
  );
}
