'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Package, X } from 'lucide-react';
import type { ProductPerformanceRow } from './types';

interface ProductComboboxProps {
  products: ProductPerformanceRow[];
  value: string;
  onChange: (product: ProductPerformanceRow | null, manualTitle?: string) => void;
  loading?: boolean;
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  hero: { bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', label: 'Hero' },
  growth: { bg: 'bg-[var(--tint-green)]', text: 'text-apple-green', label: 'Growth' },
  niche: { bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple', label: 'Niche' },
  'long-tail': { bg: 'bg-glass-hover', text: 'text-[var(--foreground-secondary)]', label: 'Long-tail' },
};

function fmt$(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-[var(--foreground-secondary)]';
  if (score >= 80) return 'text-apple-green';
  if (score >= 60) return 'text-apple-blue';
  if (score >= 40) return 'text-apple-yellow';
  return 'text-apple-red';
}

export function ProductCombobox({ products, value, onChange, loading }: ProductComboboxProps): JSX.Element {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.productTitle.toLowerCase().includes(q) ||
        p.productType.toLowerCase().includes(q)
    );
  }, [products, query]);

  function handleInputChange(val: string): void {
    setQuery(val);
    setOpen(true);
    setHighlightIndex(0);
    // If user clears or edits text, deselect product
    onChange(null, val);
  }

  function handleSelect(product: ProductPerformanceRow): void {
    setQuery(product.productTitle);
    setOpen(false);
    onChange(product);
  }

  function handleClear(): void {
    setQuery('');
    setOpen(false);
    onChange(null, '');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => products.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Loading products…' : products.length > 0 ? 'Search products…' : 'Type product title'}
          className="w-full pl-8 pr-8 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] border border-white/5 focus:border-apple-blue/50 focus:outline-none transition-colors"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && products.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] shadow-xl">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-[var(--foreground-secondary)] text-center">
              No matching products
            </div>
          ) : (
            filtered.map((product, idx) => {
              const tier = product.productTier ? TIER_STYLES[product.productTier] : null;
              return (
                <button
                  key={product.id}
                  onClick={() => handleSelect(product)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    idx === highlightIndex ? 'bg-glass-hover' : 'hover:bg-glass-hover/50'
                  }`}
                >
                  {/* Product image */}
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-glass-hover flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-[var(--foreground-secondary)]" />
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--foreground)] truncate">
                        {product.productTitle}
                      </span>
                      {tier && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${tier.bg} ${tier.text}`}>
                          {tier.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--foreground-secondary)]">
                        {fmt$(product.avgPrice)}
                      </span>
                      <span className="text-[10px] text-[var(--foreground-secondary)]">
                        {fmt$(product.revenue30d)} / 30d
                      </span>
                      {product.adFitnessScore != null && (
                        <span className={`text-[10px] font-medium ${scoreColor(product.adFitnessScore)}`}>
                          {product.adFitnessScore.toFixed(0)} fitness
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
