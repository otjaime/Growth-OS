'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, ArrowLeft, Check, X, AlertTriangle, Timer } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { SeverityBadge } from '@/components/autopilot';

interface HistoryVariant {
  id: string;
  angle: string;
  headline: string;
  status: string;
}

interface HistoryItem {
  id: string;
  ruleId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  actionType: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  ad: {
    id: string;
    adId: string;
    name: string;
    status: string;
    spend7d: number;
    roas7d: number | null;
    ctr7d: number | null;
    campaign: { id: string; name: string };
  };
  variants: HistoryVariant[];
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'EXECUTED':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-semibold">
          <Check className="h-3 w-3" /> Executed
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--tint-blue)] text-apple-blue font-semibold">
          <Check className="h-3 w-3" /> Approved
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-[var(--foreground-secondary)] font-semibold">
          <X className="h-3 w-3" /> Dismissed
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--tint-yellow)] text-apple-yellow font-semibold">
          <Timer className="h-3 w-3" /> Expired
        </span>
      );
    default:
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-[var(--foreground-secondary)] font-semibold">
          {status}
        </span>
      );
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AutopilotHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/api/autopilot/history')
      .then((r) => r.ok ? r.json() : null)
      .then((data: { items: HistoryItem[]; total: number } | null) => {
        if (!data) { setError(true); setLoading(false); return; }
        setItems(data.items);
        setTotal(data.total);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Action History</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load history. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/autopilot"
            className="flex items-center gap-1.5 text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Autopilot
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--tint-blue)] flex items-center justify-center">
          <Clock className="h-5 w-5 text-apple-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Action History</h1>
          <p className="text-xs text-[var(--foreground-secondary)]">
            {total} total action{total !== 1 ? 's' : ''} taken
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card text-center py-16">
          <Clock className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">No History Yet</h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Actions taken on diagnoses will appear here.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Date</th>
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Diagnosis</th>
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Ad</th>
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Severity</th>
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Status</th>
                <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Variants</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--glass-border)] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs text-[var(--foreground-secondary)]">{formatDate(item.updatedAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
                    <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 truncate max-w-xs">{item.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-[var(--foreground)]">{item.ad.name}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)]">{item.ad.campaign.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={item.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    {item.variants.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {item.variants.map((v) => (
                          <span
                            key={v.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              v.status === 'APPROVED' ? 'text-apple-green bg-[var(--tint-green)]' :
                              v.status === 'REJECTED' ? 'text-apple-red bg-[var(--tint-red)]' :
                              'text-[var(--foreground-secondary)] bg-white/[0.06]'
                            }`}
                            title={v.headline}
                          >
                            {v.angle === 'pain_point' ? 'Pain' : v.angle === 'benefit' ? 'Benefit' : 'Urgency'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--foreground-secondary)]/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
