'use client';

import { useState } from 'react';
import { Search, ChevronRight, Clock, Database } from 'lucide-react';
import { ConnectorIcon } from './connector-icon';
import type { ConnectorDef } from './types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './types';

interface ConnectorCatalogProps {
  connectors: ConnectorDef[];
  connectedIds: Set<string>;
  onSelect: (connector: ConnectorDef) => void;
}

export function ConnectorCatalog({ connectors, connectedIds, onSelect }: ConnectorCatalogProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const filtered = connectors.filter((c) => {
    if (filterCategory && c.category !== filterCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    // Search across name, description, category, quickFindPath, and dataSync tags
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.quickFindPath ?? '').toLowerCase().includes(q) ||
      (c.dataSync ?? []).some((d) => d.toLowerCase().includes(q)) ||
      // Also match common synonyms
      (q === 'facebook' && c.id === 'meta_ads') ||
      (q === 'instagram' && c.id === 'meta_ads') ||
      (q === 'fb' && c.id === 'meta_ads') ||
      (q === 'wordpress' && c.id === 'woocommerce') ||
      (q === 'ga' && c.id === 'ga4') ||
      (q === 'google analytics' && c.id === 'ga4') ||
      (q === 'excel' && c.id === 'csv_upload') ||
      (q === 'file' && c.id === 'csv_upload')
    );
  });

  // Group by category
  const grouped: Record<string, ConnectorDef[]> = {};
  for (const c of filtered) {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  }

  const categories = CATEGORY_ORDER.filter((cat) => grouped[cat]?.length);
  const allCategories = [...new Set(connectors.map((c) => c.category))];

  return (
    <div className="space-y-5">
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, data type, or platform..."
            className="w-full bg-white/[0.04] border border-[var(--glass-border)] rounded-xl pl-10 pr-4 py-2.5 text-[var(--foreground)] text-sm focus:ring-2 focus:ring-apple-blue focus:border-apple-blue transition-all placeholder:text-[var(--foreground-secondary)]/70"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ease-spring ${
              !filterCategory ? 'bg-apple-blue text-[var(--foreground)]' : 'bg-white/[0.06] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            All
          </button>
          {allCategories.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat === filterCategory ? null : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ease-spring ${
                cat === filterCategory ? 'bg-apple-blue text-[var(--foreground)]' : 'bg-white/[0.06] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Grid */}
      {categories.map((category) => (
        <div key={category}>
          <h3 className="text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[category]?.map((connector) => {
              const isConnected = connectedIds.has(connector.id);
              return (
                <button
                  key={connector.id}
                  onClick={() => onSelect(connector)}
                  className={`text-left bg-white/[0.03] border rounded-xl p-4 hover:border-apple-blue/50 hover:bg-white/[0.06]/60 transition-all group ${
                    isConnected ? 'border-apple-green/30' : 'border-[var(--glass-border)]/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ConnectorIcon icon={connector.icon} color={connector.color} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[var(--foreground)] font-medium text-sm truncate">{connector.name}</h4>
                        {isConnected && (
                          <span className="flex-shrink-0 text-[10px] font-medium text-apple-green bg-[var(--tint-green)] px-1.5 py-0.5 rounded-full">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 line-clamp-2">{connector.description}</p>

                      {/* Quick info row */}
                      <div className="flex items-center gap-3 mt-2">
                        {connector.setupTime && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--foreground-secondary)]/70">
                            <Clock className="h-3 w-3" /> {connector.setupTime}
                          </span>
                        )}
                        {connector.dataSync && connector.dataSync.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--foreground-secondary)]/70">
                            <Database className="h-3 w-3" /> {connector.dataSync.length} data types
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--foreground-secondary)]/50 group-hover:text-apple-blue transition-all ease-spring flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {connectors.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--foreground-secondary)] text-sm">Failed to load connectors from the API.</p>
          <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">Please check your connection and try refreshing the page.</p>
        </div>
      )}

      {connectors.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--foreground-secondary)] text-sm">No connectors match your search.</p>
          <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">Try searching by data type (e.g. &quot;orders&quot;, &quot;campaigns&quot;) or platform name.</p>
        </div>
      )}
    </div>
  );
}
