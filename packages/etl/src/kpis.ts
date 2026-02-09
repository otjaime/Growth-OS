// ──────────────────────────────────────────────────────────────
// Growth OS — KPI Calculation Engine
// All metric definitions centralized here for consistency
// See /docs/kpi-definitions.md for full documentation
// ──────────────────────────────────────────────────────────────

import Decimal from 'decimal.js';

// ── Revenue ─────────────────────────────────────────────────
export function revenueGross(orders: Array<{ revenueGross: number }>): number {
  return orders.reduce((sum, o) => sum + o.revenueGross, 0);
}

export function revenueNet(orders: Array<{ revenueNet: number }>): number {
  return orders.reduce((sum, o) => sum + o.revenueNet, 0);
}

// ── Contribution Margin ─────────────────────────────────────
export function contributionMarginTotal(
  orders: Array<{ contributionMargin: number }>,
): number {
  return orders.reduce((sum, o) => sum + o.contributionMargin, 0);
}

export function contributionMarginPct(
  totalContribution: number,
  totalRevenueNet: number,
): number {
  if (totalRevenueNet === 0) return 0;
  return totalContribution / totalRevenueNet;
}

// ── CAC ─────────────────────────────────────────────────────
/**
 * Blended CAC = Total Marketing Spend / Total New Customers Acquired
 */
export function blendedCac(totalSpend: number, newCustomers: number): number {
  if (newCustomers === 0) return 0;
  return totalSpend / newCustomers;
}

/**
 * Channel CAC = Channel Spend / New Customers from that Channel
 */
export function channelCac(channelSpend: number, channelNewCustomers: number): number {
  if (channelNewCustomers === 0) return 0;
  return channelSpend / channelNewCustomers;
}

// ── MER (Marketing Efficiency Ratio) ────────────────────────
/**
 * MER = Total Revenue / Total Marketing Spend
 * Higher is better. Also known as "Blended ROAS" or "ecosystem ROAS".
 */
export function mer(totalRevenue: number, totalSpend: number): number {
  if (totalSpend === 0) return 0;
  return totalRevenue / totalSpend;
}

// ── ROAS ────────────────────────────────────────────────────
/**
 * ROAS = Channel Revenue / Channel Spend
 * Applies to individual channels, not blended (use MER for blended)
 */
export function roas(channelRevenue: number, channelSpend: number): number {
  if (channelSpend === 0) return 0;
  return channelRevenue / channelSpend;
}

// ── LTV ─────────────────────────────────────────────────────
/**
 * Cohort-based LTV at N days:
 * LTV_N = Sum of net revenue from cohort within N days of acquisition / Cohort size
 */
export function ltvAtDays(
  totalCohortRevenue: number,
  cohortSize: number,
): number {
  if (cohortSize === 0) return 0;
  return totalCohortRevenue / cohortSize;
}

// ── Payback Days ────────────────────────────────────────────
/**
 * Payback days = CAC / (daily average contribution margin per customer)
 * Daily avg CM = (LTV_30 * CM%) / 30
 */
export function paybackDays(
  cac: number,
  ltv30: number,
  cmPct: number,
): number | null {
  if (cac <= 0 || ltv30 <= 0 || cmPct <= 0) return null;
  const dailyCm = (ltv30 * cmPct) / 30;
  if (dailyCm <= 0) return null;
  return Math.round(cac / dailyCm);
}

// ── Retention ───────────────────────────────────────────────
/**
 * D-N Retention (ecommerce) = % of cohort customers who made a repeat
 * purchase within N days of their first purchase.
 */
export function retentionRate(
  repeatCustomers: number,
  cohortSize: number,
): number {
  if (cohortSize === 0) return 0;
  return repeatCustomers / cohortSize;
}

// ── Funnel CVR ──────────────────────────────────────────────
export function funnelCvr(
  traffic: { sessions: number; pdpViews: number; addToCart: number; checkouts: number; purchases: number },
): {
  sessionToPdp: number;
  pdpToAtc: number;
  atcToCheckout: number;
  checkoutToPurchase: number;
  sessionToPurchase: number;
} {
  return {
    sessionToPdp: traffic.sessions > 0 ? traffic.pdpViews / traffic.sessions : 0,
    pdpToAtc: traffic.pdpViews > 0 ? traffic.addToCart / traffic.pdpViews : 0,
    atcToCheckout: traffic.addToCart > 0 ? traffic.checkouts / traffic.addToCart : 0,
    checkoutToPurchase: traffic.checkouts > 0 ? traffic.purchases / traffic.checkouts : 0,
    sessionToPurchase: traffic.sessions > 0 ? traffic.purchases / traffic.sessions : 0,
  };
}

// ── Period Comparison (WoW, MoM) ────────────────────────────
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

export function percentagePointChange(currentPct: number, previousPct: number): number {
  return currentPct - previousPct;
}

// ── AOV (Average Order Value) ───────────────────────────────
export function aov(totalRevenue: number, orderCount: number): number {
  if (orderCount === 0) return 0;
  return totalRevenue / orderCount;
}

// ── New vs Returning ────────────────────────────────────────
export function newCustomerShare(
  newCustomerOrders: number,
  totalOrders: number,
): number {
  if (totalOrders === 0) return 0;
  return newCustomerOrders / totalOrders;
}

// ── CPC / CPM ───────────────────────────────────────────────
export function cpc(spend: number, clicks: number): number {
  if (clicks === 0) return 0;
  return spend / clicks;
}

export function cpm(spend: number, impressions: number): number {
  if (impressions === 0) return 0;
  return (spend / impressions) * 1000;
}

export function ctr(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return clicks / impressions;
}
