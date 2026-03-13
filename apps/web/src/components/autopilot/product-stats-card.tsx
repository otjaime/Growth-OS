'use client';

import { Package } from 'lucide-react';
import { motion } from 'motion/react';
import type { ProductPerformanceRow } from './types';

interface ProductStatsCardProps {
  product: ProductPerformanceRow;
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

export function ProductStatsCard({ product }: ProductStatsCardProps): JSX.Element {
  const tier = product.productTier ? TIER_STYLES[product.productTier] : null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="overflow-hidden"
    >
      <div className="flex items-start gap-3 p-3 rounded-lg bg-glass-hover border border-white/5">
        {/* Product image */}
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="w-10 h-10 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-[var(--glass-bg)] flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-[var(--foreground-secondary)]" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-[var(--foreground)] truncate">
              {product.productTitle}
            </span>
            {tier && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${tier.bg} ${tier.text}`}>
                {tier.label}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Stat label="Revenue 30d" value={fmt$(product.revenue30d)} />
            <Stat label="Margin" value={`${(product.estimatedMargin * 100).toFixed(0)}%`} />
            <Stat
              label="Ad Fitness"
              value={product.adFitnessScore != null ? product.adFitnessScore.toFixed(0) : '—'}
              className={scoreColor(product.adFitnessScore)}
            />
            <Stat label="Repeat" value={`${(product.repeatBuyerPct * 100).toFixed(0)}%`} />
            {product.historicalRoas != null && (
              <Stat label="Hist. ROAS" value={`${product.historicalRoas.toFixed(1)}x`} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-[var(--foreground-secondary)]">{label}</span>
      <span className={`text-[10px] font-semibold ${className ?? 'text-[var(--foreground)]'}`}>{value}</span>
    </div>
  );
}
