'use client';

import { Clock, Check, X, Timer } from 'lucide-react';
import { motion } from 'motion/react';
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
        <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-semibold">
          <Check className="h-3 w-3" /> Executed
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-blue)] text-apple-blue font-semibold">
          <Check className="h-3 w-3" /> Approved
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-glass-active text-[var(--foreground-secondary)] font-semibold">
          <X className="h-3 w-3" /> Dismissed
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-yellow)] text-apple-yellow font-semibold">
          <Timer className="h-3 w-3" /> Expired
        </span>
      );
    default:
      return (
        <span className="text-caption px-2 py-0.5 rounded-full bg-glass-hover text-[var(--foreground-secondary)] font-semibold">
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
      <div className="card space-y-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 table-separator">
            <div className="h-3 w-16 skeleton-shimmer" />
            <div className="h-8 w-8 rounded-lg skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-48 skeleton-shimmer" />
              <div className="h-2 w-32 skeleton-shimmer" />
            </div>
            <div className="h-5 w-16 skeleton-shimmer" />
          </div>
        ))}
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
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Date</th>
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3 w-10" />
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Diagnosis</th>
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Ad</th>
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Severity</th>
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Status</th>
              <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Variants</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <motion.tr
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, delay: index * 0.03 }}
                className="table-separator last:bg-none hover:bg-glass-muted transition-colors">
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
                  <p className="text-caption text-[var(--foreground-secondary)]">{item.ad.campaign.name}</p>
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
                          className={`text-caption px-1.5 py-0.5 rounded font-medium ${
                            v.status === 'APPROVED' ? 'text-apple-green bg-[var(--tint-green)]' :
                            v.status === 'REJECTED' ? 'text-apple-red bg-[var(--tint-red)]' :
                            'text-[var(--foreground-secondary)] bg-glass-hover'
                          }`}
                          title={v.headline}
                        >
                          {v.angle === 'pain_point' ? 'Pain' : v.angle === 'benefit' ? 'Benefit' : v.angle === 'social_proof' ? 'Social' : v.angle === 'value' ? 'Value' : 'Urgency'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--foreground-secondary)]/40">—</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassSurface>
  );
}
