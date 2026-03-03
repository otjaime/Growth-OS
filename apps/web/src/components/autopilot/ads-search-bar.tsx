'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { MetaAdWithTrends, CampaignHealthScore } from './types';

interface AdsSearchBarProps {
  ads: MetaAdWithTrends[];
  healthByCampaignId?: Map<string, CampaignHealthScore>;
  onFiltered: (filtered: MetaAdWithTrends[]) => void;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED';
type HealthFilter = 'ALL' | 'GOOD' | 'ISSUES';

export function AdsSearchBar({ ads, healthByCampaignId, onFiltered }: AdsSearchBarProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = statusFilter !== 'ALL' || healthFilter !== 'ALL' || query.length > 0;

  const filtered = useMemo(() => {
    let result = ads;

    // Text search
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (ad) =>
          ad.name.toLowerCase().includes(q) ||
          ad.campaign.name.toLowerCase().includes(q) ||
          ad.adSet.name.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      result = result.filter((ad) => ad.status === statusFilter);
    }

    // Health filter
    if (healthFilter !== 'ALL' && healthByCampaignId) {
      result = result.filter((ad) => {
        const health = healthByCampaignId.get(ad.campaign.id);
        if (!health) return healthFilter === 'ISSUES'; // no score = unknown = potentially issues
        if (healthFilter === 'GOOD') return health.grade === 'A' || health.grade === 'B';
        return health.grade !== 'A' && health.grade !== 'B';
      });
    }

    return result;
  }, [ads, query, statusFilter, healthFilter, healthByCampaignId]);

  // Push filtered results to parent
  useEffect(() => {
    onFiltered(filtered);
  }, [filtered, onFiltered]);

  const clearAll = useCallback(() => {
    setQuery('');
    setStatusFilter('ALL');
    setHealthFilter('ALL');
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ads by name or campaign..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-glass-muted border border-[var(--glass-border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-apple-blue/30 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-glass-hover transition-colors"
            >
              <X className="h-3 w-3 text-[var(--foreground-secondary)]" />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl press-scale transition-all ease-spring ${
            hasActiveFilters
              ? 'text-apple-blue bg-[var(--tint-blue)]'
              : 'text-[var(--foreground-secondary)] bg-glass-muted hover:bg-glass-hover'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </button>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] press-scale transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-4 flex-wrap">
          {/* Status */}
          <div className="flex items-center gap-1">
            <span className="text-caption text-[var(--foreground-secondary)] mr-1">Status:</span>
            {(['ALL', 'ACTIVE', 'PAUSED'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium press-scale transition-colors ease-spring ${
                  statusFilter === s
                    ? 'bg-glass-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Health */}
          <div className="flex items-center gap-1">
            <span className="text-caption text-[var(--foreground-secondary)] mr-1">Health:</span>
            {(['ALL', 'GOOD', 'ISSUES'] as HealthFilter[]).map((h) => (
              <button
                key={h}
                onClick={() => setHealthFilter(h)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium press-scale transition-colors ease-spring ${
                  healthFilter === h
                    ? 'bg-glass-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {h === 'ALL' ? 'All' : h === 'GOOD' ? 'Healthy' : 'Needs attention'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result count */}
      {hasActiveFilters && (
        <p className="text-caption text-[var(--foreground-secondary)]">
          {filtered.length} of {ads.length} ad{ads.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
