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
  Settings2,
} from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import type { SavedConnection } from './types';
import { apiFetch } from '@/lib/api';

interface ConnectionCardProps {
  connection: SavedConnection;
  onRefresh: () => void;
  onEdit?: () => void;
}

export function ConnectionCard({ connection, onRefresh, onEdit }: ConnectionCardProps) {
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
      const res = await apiFetch(`/api/connections/${connection.connectorType}/test`, { method: 'POST' });
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
      await apiFetch(`/api/connections/${connection.connectorType}/sync`, { method: 'POST' });
    } catch { /* ignore */ }
    setTimeout(() => {
      setSyncing(false);
      onRefresh();
    }, 3500);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await apiFetch(`/api/connections/${connection.connectorType}`, { method: 'DELETE' });
    setDeleting(false);
    setConfirmDelete(false);
    setShowMenu(false);
    onRefresh();
  };

  const statusDot = connection.status === 'active' || connection.status === 'pending'
    ? 'bg-apple-green'
    : connection.status === 'syncing'
      ? 'bg-apple-yellow animate-pulse'
      : 'bg-apple-red';

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
    <div className="card glass-interactive p-5 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <ConnectorIcon icon={connection.icon} color={connection.color} />
          <div>
            <h3 className="text-[var(--foreground)] font-semibold">{connection.label}</h3>
            <p className="text-xs text-[var(--foreground-secondary)]">{connection.name}</p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-white/[0.1] rounded-lg transition-all ease-spring opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4 text-[var(--foreground-secondary)]" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setShowMenu(false); setConfirmDelete(false); }} />
              <div className="absolute right-0 top-8 z-20 w-48 bg-white/[0.06] border border-[var(--glass-border)] rounded-lg shadow-xl overflow-hidden">
                <button
                  onClick={() => { onEdit?.(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)]/80 hover:bg-white/[0.1] transition-all ease-spring"
                >
                  <Settings2 className="h-4 w-4" /> Edit Keys
                </button>
                <button
                  onClick={() => { handleTest(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)]/80 hover:bg-white/[0.1] transition-all ease-spring"
                >
                  <TestTube className="h-4 w-4" /> Test Connection
                </button>
                <button
                  onClick={() => { handleSync(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--foreground)]/80 hover:bg-white/[0.1] transition-all ease-spring"
                >
                  <RefreshCw className="h-4 w-4" /> Sync Now
                </button>
                <hr className="border-[var(--glass-border)]" />
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-apple-red hover:bg-[var(--tint-red)] transition-all ease-spring"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                ) : (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-apple-red hover:bg-[var(--tint-red)] transition-all ease-spring font-medium"
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
          <span className="text-xs text-[var(--foreground-secondary)]">{statusLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--foreground-secondary)]/70">
          <Clock className="h-3 w-3" />
          {timeAgo(connection.lastSyncAt)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] disabled:opacity-50 text-[var(--foreground)] rounded-lg text-xs font-medium transition-all ease-spring"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
          Test
        </button>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--tint-blue)] hover:bg-[var(--tint-blue)]/80 disabled:opacity-50 text-apple-blue rounded-lg text-xs font-medium transition-all ease-spring"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Sync
        </button>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs ${
          testResult.success
            ? 'bg-[var(--tint-green)] border border-apple-green/20 text-apple-green'
            : 'bg-[var(--tint-red)] border border-apple-red/20 text-apple-red'
        }`}>
          {testResult.success ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {testResult.message}
        </div>
      )}
    </div>
  );
}
