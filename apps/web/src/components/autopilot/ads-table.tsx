'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, AlertTriangle } from 'lucide-react';
import { GlassSurface } from '@/components/ui/glass-surface';
import { AdThumbnail } from './ad-thumbnail';
import { TrendArrow } from './trend-arrow';
import type { MetaAdWithTrends, Diagnosis } from './types';

interface AdsTableProps {
  ads: MetaAdWithTrends[];
  loading: boolean;
  diagnosisByAdId: Map<string, Diagnosis[]>;
  onAdClick?: (adId: string) => void;
}

type SortKey = 'name' | 'spend7d' | 'revenue7d' | 'roas7d' | 'ctr7d' | 'cpc7d' | 'frequency7d' | 'conversions7d';
type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      className={`text-${align} text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-3 py-3 cursor-pointer hover:text-[var(--foreground-secondary)] transition-colors select-none whitespace-nowrap`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive && (currentDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function roasColor(roas: number | null): string {
  if (roas === null) return 'text-[var(--foreground-secondary)]';
  if (roas >= 2) return 'text-apple-green';
  if (roas >= 1) return 'text-apple-yellow';
  return 'text-apple-red';
}

function statusBadge(status: string): string {
  if (status === 'ACTIVE') return 'text-apple-green bg-[var(--tint-green)]';
  if (status === 'PAUSED') return 'text-[var(--foreground-secondary)] bg-white/[0.06]';
  return 'text-[var(--foreground-secondary)] bg-white/[0.06]';
}

export function AdsTable({ ads, loading, diagnosisByAdId, onAdClick }: AdsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('spend7d');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...ads].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [ads, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="card text-center py-16">
        <p className="text-sm font-medium text-[var(--foreground)]">No ads found</p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1">Sync your Meta Ads account to see ads here</p>
      </div>
    );
  }

  return (
    <GlassSurface className="card overflow-hidden" intensity="subtle">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-3 py-3 w-10" />
              <SortHeader label="Ad" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="left" />
              <th className="text-left text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-3 py-3">Status</th>
              <SortHeader label="Spend 7d" sortKey="spend7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Revenue" sortKey="revenue7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="ROAS" sortKey="roas7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="CTR" sortKey="ctr7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="CPC" sortKey="cpc7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Freq" sortKey="frequency7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortHeader label="Conv" sortKey="conversions7d" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th className="text-center text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium px-3 py-3">Health</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ad) => {
              const diags = diagnosisByAdId.get(ad.id) ?? [];
              const hasCritical = diags.some((d) => d.severity === 'CRITICAL');
              const hasWarning = diags.some((d) => d.severity === 'WARNING');
              const borderClass = hasCritical
                ? 'border-l-2 border-apple-red'
                : hasWarning
                  ? 'border-l-2 border-apple-yellow'
                  : 'border-l-2 border-transparent';

              return (
                <tr
                  key={ad.id}
                  onClick={() => onAdClick?.(ad.id)}
                  className={`${borderClass} border-b border-[var(--glass-border)] last:border-b-0 hover:bg-white/[0.02] transition-colors cursor-pointer`}
                >
                  {/* Thumbnail */}
                  <td className="px-3 py-2.5">
                    <AdThumbnail thumbnailUrl={ad.thumbnailUrl} imageUrl={ad.imageUrl} name={ad.name} size="sm" />
                  </td>

                  {/* Name + Campaign */}
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{ad.name}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)] truncate">{ad.campaign.name}</p>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge(ad.status)}`}>
                      {ad.status}
                    </span>
                  </td>

                  {/* Spend */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">${Number(ad.spend7d).toLocaleString()}</p>
                    <TrendArrow change={ad.trends.spendChange} />
                  </td>

                  {/* Revenue */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">${Number(ad.revenue7d).toLocaleString()}</p>
                  </td>

                  {/* ROAS */}
                  <td className="px-3 py-2.5 text-right">
                    <p className={`text-sm font-semibold ${roasColor(ad.roas7d)}`}>
                      {ad.roas7d != null ? `${Number(ad.roas7d).toFixed(2)}x` : '—'}
                    </p>
                    <TrendArrow change={ad.trends.roasChange} />
                  </td>

                  {/* CTR */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">
                      {ad.ctr7d != null ? `${(Number(ad.ctr7d) * 100).toFixed(2)}%` : '—'}
                    </p>
                    <TrendArrow change={ad.trends.ctrChange} />
                  </td>

                  {/* CPC */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">
                      {ad.cpc7d != null ? `$${Number(ad.cpc7d).toFixed(2)}` : '—'}
                    </p>
                  </td>

                  {/* Frequency */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">
                      {ad.frequency7d != null ? `${Number(ad.frequency7d).toFixed(1)}x` : '—'}
                    </p>
                    <TrendArrow change={ad.trends.frequencyChange} invert />
                  </td>

                  {/* Conversions */}
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-sm text-[var(--foreground)]">{ad.conversions7d}</p>
                  </td>

                  {/* Health indicator */}
                  <td className="px-3 py-2.5 text-center">
                    {diags.length === 0 ? (
                      <CheckCircle className="h-4 w-4 text-apple-green mx-auto" />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className={`h-3.5 w-3.5 ${hasCritical ? 'text-apple-red' : 'text-apple-yellow'}`} />
                        <span className="text-[10px] font-medium text-[var(--foreground-secondary)]">{diags.length}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassSurface>
  );
}
