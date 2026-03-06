export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Currency-aware compact formatter.
 * Uses Intl.NumberFormat for correct symbol, grouping, and decimals per currency.
 * Falls back to compact notation for large values.
 */
export function formatMoney(value: number, currency = 'USD'): string {
  // Zero-decimal currencies (CLP, JPY, KRW, etc.) — no fractional digits
  const zeroDecimal = new Set(['CLP', 'JPY', 'KRW', 'VND', 'BIF', 'CRC', 'DJF', 'GNF', 'ISK', 'PYG', 'RWF', 'UGX', 'UYI', 'VUV', 'XAF', 'XOF', 'XPF']);
  const noDecimals = zeroDecimal.has(currency);
  const abs = Math.abs(value);

  // For very large values, use compact notation
  if (abs >= 1_000_000) {
    const compact = abs / 1_000_000;
    const sym = getCurrencySymbol(currency);
    return `${value < 0 ? '-' : ''}${sym}${compact.toFixed(noDecimals ? 0 : 1)}M`;
  }

  // For values 1K+, use Intl compact notation
  if (abs >= 1_000) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: noDecimals ? 0 : 1,
      }).format(value);
    } catch {
      const sym = getCurrencySymbol(currency);
      const compact = abs / 1_000;
      return `${value < 0 ? '-' : ''}${sym}${compact.toFixed(noDecimals ? 0 : 1)}K`;
    }
  }

  // For small values, use full Intl formatting
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: noDecimals ? 0 : 0,
    }).format(value);
  } catch {
    const sym = getCurrencySymbol(currency);
    return `${value < 0 ? '-' : ''}${sym}${abs.toFixed(0)}`;
  }
}

/** Extract just the currency symbol (e.g. '$', '€', '¥') */
function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatPercentChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function changeColor(value: number, invert = false): string {
  const isPositive = invert ? value < 0 : value >= 0;
  if (Math.abs(value) < 0.001) return 'kpi-neutral';
  return isPositive ? 'kpi-positive' : 'kpi-negative';
}

export function formatDays(value: number | null): string {
  if (value === null || value === 0) return '--';
  return `${value}d`;
}

export function formatMultiplier(value: number): string {
  if (value === 0) return '--';
  return `${value.toFixed(1)}x`;
}
