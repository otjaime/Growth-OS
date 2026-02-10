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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, data type, or platform..."
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !filterCategory ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          {allCategories.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat === filterCategory ? null : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                cat === filterCategory ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
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
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped[category]?.map((connector) => {
              const isConnected = connectedIds.has(connector.id);
              return (
                <button
                  key={connector.id}
                  onClick={() => onSelect(connector)}
                  className={`text-left bg-slate-800/30 border rounded-xl p-4 hover:border-blue-500/50 hover:bg-slate-800/60 transition-all group ${
                    isConnected ? 'border-green-500/30' : 'border-slate-700/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ConnectorIcon icon={connector.icon} color={connector.color} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium text-sm truncate">{connector.name}</h4>
                        {isConnected && (
                          <span className="flex-shrink-0 text-[10px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                            Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{connector.description}</p>

                      {/* Quick info row */}
                      <div className="flex items-center gap-3 mt-2">
                        {connector.setupTime && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock className="h-3 w-3" /> {connector.setupTime}
                          </span>
                        )}
                        {connector.dataSync && connector.dataSync.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Database className="h-3 w-3" /> {connector.dataSync.length} data types
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {connectors.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-sm">Failed to load connectors from the API.</p>
          <p className="text-xs text-slate-500 mt-1">Please check your connection and try refreshing the page.</p>
        </div>
      )}

      {connectors.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-sm">No connectors match your search.</p>
          <p className="text-xs text-slate-500 mt-1">Try searching by data type (e.g. &quot;orders&quot;, &quot;campaigns&quot;) or platform name.</p>
        </div>
      )}
    </div>
  );
}
