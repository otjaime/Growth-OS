'use client';

import { Clock, Check, X, Timer } from 'lucide-react';
import { GlassSurface } from '@/components/ui/glass-surface';
import { SeverityBadge } from './severity-badge';
import { AdThumbnail } from './ad-thumbnail';
import type { HistoryItem } from './types';

interface HistoryTableProps {
  items: HistoryItem[];
  total: number;
  loading: boolean;
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

export function HistoryTable({ items, total, loading }: HistoryTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="card text-center py-16">
        <Clock className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">No History Yet</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Actions taken on diagnoses will appear here.
        </p>
      </div>
    );
  }

  return (
    <GlassSurface className="card overflow-hidden" intensity="subtle">
      <div className="px-4 py-3 border-b border-[var(--glass-border)]">
        <p className="text-xs text-[var(--foreground-secondary)]">{total} total action{total !== 1 ? 's' : ''}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Date</th>
              <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3 w-10" />
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
                  <AdThumbnail
                    thumbnailUrl={item.ad.thumbnailUrl ?? null}
                    imageUrl={null}
                    name={item.ad.name}
                    size="sm"
                  />
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
    </GlassSurface>
  );
}
