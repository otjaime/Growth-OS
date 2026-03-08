'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone, Sparkles, Loader2, Calendar, TrendingUp,
  Check, X, Pause, Play, ShoppingBag, Tag, Star,
  Package, Gift, ArrowRight, Rocket, ExternalLink, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { CampaignStrategy, CampaignStrategyStatus, CampaignStrategyType, SeasonalEvent } from './types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthDay(month: number, day: number): string {
  const d = new Date(2024, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Style maps ───────────────────────────────────────────────

const TYPE_STYLES: Record<CampaignStrategyType, { bg: string; text: string; label: string; icon: typeof Star }> = {
  HERO_PRODUCT: { bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', label: 'Hero Product', icon: Star },
  CATEGORY: { bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple', label: 'Category', icon: Tag },
  SEASONAL: { bg: 'bg-[var(--tint-orange)]', text: 'text-apple-orange', label: 'Seasonal', icon: Calendar },
  NEW_ARRIVAL: { bg: 'bg-[var(--tint-green)]', text: 'text-apple-green', label: 'New Arrival', icon: Gift },
  CROSS_SELL: { bg: 'bg-[var(--tint-pink)]', text: 'text-apple-pink', label: 'Cross-Sell', icon: ShoppingBag },
  BEST_SELLERS: { bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', label: 'Best Sellers', icon: TrendingUp },
};

const STATUS_STYLES: Record<CampaignStrategyStatus, { bg: string; text: string; label: string }> = {
  SUGGESTED: { bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow', label: 'Suggested' },
  APPROVED: { bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', label: 'Approved' },
  ACTIVE: { bg: 'bg-[var(--tint-green)]', text: 'text-apple-green', label: 'Active' },
  PAUSED: { bg: 'bg-glass-hover', text: 'text-[var(--foreground-secondary)]', label: 'Paused' },
  COMPLETED: { bg: 'bg-glass-hover', text: 'text-[var(--foreground-secondary)]', label: 'Completed' },
  REJECTED: { bg: 'bg-[var(--tint-red)]', text: 'text-apple-red', label: 'Rejected' },
};

// ── Campaign Card ────────────────────────────────────────────

interface CampaignCardProps {
  campaign: CampaignStrategy;
  currency: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onActivate: (id: string) => void;
  onUpdateBudget: (id: string, newBudget: number) => Promise<void>;
  actionLoading: string | null;
}

function CampaignCard({ campaign, currency, onApprove, onReject, onPause, onResume, onActivate, onUpdateBudget, actionLoading }: CampaignCardProps): JSX.Element {
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(Number(campaign.dailyBudget ?? 0)));
  const [savingBudget, setSavingBudget] = useState(false);

  const typeStyle = TYPE_STYLES[campaign.type] ?? TYPE_STYLES.HERO_PRODUCT;
  const statusStyle = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.SUGGESTED;
  const TypeIcon = typeStyle.icon;
  const isActioning = actionLoading === campaign.id;

  const handleSaveBudget = async (): Promise<void> => {
    const newBudget = Number(budgetInput);
    if (!isFinite(newBudget) || newBudget <= 0) return;
    setSavingBudget(true);
    try {
      await onUpdateBudget(campaign.id, newBudget);
      setEditingBudget(false);
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <div className="card px-4 py-4 space-y-3">
      {/* Top row: type badge + status badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-caption font-semibold ${typeStyle.bg} ${typeStyle.text}`}>
            <TypeIcon className="h-3 w-3" />
            {typeStyle.label}
          </span>
        </div>
        <span className={`inline-block px-2 py-0.5 rounded-md text-caption font-medium ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </span>
      </div>

      {/* Campaign name */}
      <h4 className="text-sm font-semibold text-[var(--foreground)] leading-snug">{campaign.name}</h4>

      {/* Key metrics row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--foreground-secondary)]">
        <span className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {campaign.productCount} product{campaign.productCount !== 1 ? 's' : ''}
        </span>
        {campaign.estimatedRoas != null && (
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Est. ROAS {Number(campaign.estimatedRoas).toFixed(2)}x
          </span>
        )}
        {campaign.dailyBudget != null && (
          (campaign.status === 'APPROVED' || campaign.status === 'SUGGESTED') && editingBudget ? (
            <span className="flex items-center gap-1">
              <span className="text-[var(--foreground-secondary)]">{currency}</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveBudget(); if (e.key === 'Escape') setEditingBudget(false); }}
                className="w-20 px-1.5 py-0.5 text-xs rounded bg-glass-muted border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-apple-blue"
                min="1"
                autoFocus
                disabled={savingBudget}
              />
              <span className="text-[var(--foreground-secondary)]">/day</span>
              <button
                onClick={() => void handleSaveBudget()}
                disabled={savingBudget}
                className="text-apple-green hover:text-apple-green/80"
              >
                {savingBudget ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                onClick={() => { setEditingBudget(false); setBudgetInput(String(Number(campaign.dailyBudget ?? 0))); }}
                className="text-[var(--foreground-secondary)] hover:text-apple-red"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <span
              className={(campaign.status === 'APPROVED' || campaign.status === 'SUGGESTED') ? 'cursor-pointer hover:text-apple-blue flex items-center gap-0.5' : ''}
              onClick={() => {
                if (campaign.status === 'APPROVED' || campaign.status === 'SUGGESTED') {
                  setBudgetInput(String(Number(campaign.dailyBudget ?? 0)));
                  setEditingBudget(true);
                }
              }}
            >
              {formatMoney(Number(campaign.dailyBudget), currency)}/day
              {(campaign.status === 'APPROVED' || campaign.status === 'SUGGESTED') && (
                <Pencil className="h-2.5 w-2.5 opacity-50" />
              )}
            </span>
          )
        )}
        {campaign.startDate && campaign.endDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
          </span>
        )}
      </div>

      {/* Active campaign metrics */}
      {campaign.status === 'ACTIVE' && (campaign.actualSpend != null || campaign.actualRevenue != null) && (
        <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-glass-muted text-xs">
          {campaign.actualSpend != null && (
            <div>
              <p className="text-[var(--foreground-secondary)]">Spend</p>
              <p className="font-semibold text-[var(--foreground)] tabular-nums">{formatMoney(Number(campaign.actualSpend), currency)}</p>
            </div>
          )}
          {campaign.actualRevenue != null && (
            <div>
              <p className="text-[var(--foreground-secondary)]">Revenue</p>
              <p className="font-semibold text-[var(--foreground)] tabular-nums">{formatMoney(Number(campaign.actualRevenue), currency)}</p>
            </div>
          )}
          {campaign.actualRoas != null && (
            <div>
              <p className="text-[var(--foreground-secondary)]">ROAS</p>
              <p className={`font-semibold tabular-nums ${Number(campaign.actualRoas) >= 2 ? 'text-apple-green' : Number(campaign.actualRoas) >= 1 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                {Number(campaign.actualRoas).toFixed(2)}x
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rationale */}
      {campaign.rationale && (
        <p className="text-xs text-[var(--foreground-secondary)] leading-relaxed line-clamp-2">
          {campaign.rationale}
        </p>
      )}

      {/* Product names preview */}
      {campaign.productTitles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {campaign.productTitles.slice(0, 3).map((title) => (
            <span
              key={title}
              className="inline-block px-1.5 py-0.5 rounded bg-glass-muted text-caption text-[var(--foreground-secondary)] truncate max-w-[140px]"
              title={title}
            >
              {title}
            </span>
          ))}
          {campaign.productTitles.length > 3 && (
            <span className="inline-block px-1.5 py-0.5 rounded bg-glass-muted text-caption text-[var(--foreground-secondary)]">
              +{campaign.productTitles.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        {campaign.status === 'SUGGESTED' && (
          <>
            <button
              onClick={() => onApprove(campaign.id)}
              disabled={isActioning}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-apple-green hover:bg-apple-green/80 disabled:opacity-50 rounded-lg transition-all ease-spring press-scale"
            >
              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Approve
            </button>
            <button
              onClick={() => onReject(campaign.id)}
              disabled={isActioning}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--foreground-secondary)] bg-glass-muted hover:bg-glass-hover disabled:opacity-50 rounded-lg transition-all ease-spring press-scale"
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </>
        )}
        {campaign.status === 'APPROVED' && (
          <button
            onClick={() => onActivate(campaign.id)}
            disabled={isActioning}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-apple-blue hover:bg-apple-blue/80 disabled:opacity-50 rounded-lg transition-all ease-spring press-scale"
          >
            {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
            {isActioning ? 'Creating on Meta...' : 'Activate on Meta'}
          </button>
        )}
        {campaign.status === 'ACTIVE' && (
          <>
            {campaign.metaCampaignId && !campaign.metaCampaignId.startsWith('demo_') && (
              <a
                href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${campaign.metaCampaignId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 rounded-lg transition-all ease-spring press-scale"
              >
                <ExternalLink className="h-3 w-3" />
                View on Meta
              </a>
            )}
            <button
              onClick={() => onPause(campaign.id)}
              disabled={isActioning}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-apple-orange bg-[var(--tint-orange)] hover:bg-apple-orange/20 disabled:opacity-50 rounded-lg transition-all ease-spring press-scale"
            >
              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
              Pause
            </button>
          </>
        )}
        {campaign.status === 'PAUSED' && campaign.metaCampaignId && (
          <>
            {!campaign.metaCampaignId.startsWith('demo_') && (
              <a
                href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${campaign.metaCampaignId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 rounded-lg transition-all ease-spring press-scale"
              >
                <ExternalLink className="h-3 w-3" />
                View on Meta
              </a>
            )}
            <button
              onClick={() => onResume(campaign.id)}
              disabled={isActioning}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20 disabled:opacity-50 rounded-lg transition-all ease-spring press-scale"
            >
              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {isActioning ? 'Resuming...' : 'Resume'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Seasonal Event Card ──────────────────────────────────────

function SeasonalEventCard({ event }: { event: SeasonalEvent }): JSX.Element {
  const startStr = formatMonthDay(event.startMonth, event.startDay);
  const endStr = formatMonthDay(event.endMonth, event.endDay);

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--tint-orange)] flex items-center justify-center">
            <Calendar className="h-4 w-4 text-apple-orange" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-[var(--foreground)]">{event.name}</h4>
            <p className="text-caption text-[var(--foreground-secondary)]">
              {startStr} <ArrowRight className="inline h-2.5 w-2.5" /> {endStr}
            </p>
          </div>
        </div>
        {event.budgetMultiplier > 1 && (
          <span className="px-2 py-0.5 rounded-md bg-[var(--tint-green)] text-apple-green text-caption font-semibold">
            {event.budgetMultiplier}x budget
          </span>
        )}
      </div>
      {event.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {event.tags.map((tag) => (
            <span key={tag} className="inline-block px-1.5 py-0.5 rounded bg-glass-muted text-caption text-[var(--foreground-secondary)]">
              {tag}
            </span>
          ))}
        </div>
      )}
      {event.audienceHint && (
        <p className="text-caption text-[var(--foreground-secondary)] mt-1.5">{event.audienceHint}</p>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

interface CampaignsTabProps {
  currency?: string;
}

export function CampaignsTab({ currency = 'USD' }: CampaignsTabProps): JSX.Element {
  const [campaigns, setCampaigns] = useState<CampaignStrategy[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<SeasonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [campRes, calRes] = await Promise.all([
        apiFetch('/api/autopilot/strategies'),
        apiFetch('/api/autopilot/strategies/calendar'),
      ]);

      if (campRes.ok) {
        const data = await campRes.json();
        setCampaigns(data.strategies ?? []);
      }
      if (calRes.ok) {
        const data = await calRes.json();
        setCalendarEvents(data.events ?? []);
      }
    } catch (err) {
      console.error('[Campaigns] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/autopilot/strategies/generate', { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('[Campaigns] Generate failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'APPROVED' as CampaignStrategyStatus } : c)),
        );
      }
    } catch (err) {
      console.error('[Campaigns] Approve failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}/reject`, { method: 'POST' });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'REJECTED' as CampaignStrategyStatus } : c)),
        );
      }
    } catch (err) {
      console.error('[Campaigns] Reject failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}/activate`, { method: 'POST' });
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      if (res.ok && data.success) {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status: 'ACTIVE' as CampaignStrategyStatus,
                  metaCampaignId: data.metaCampaignId ?? null,
                }
              : c,
          ),
        );
        // Show summary with any warnings
        const msg = `Campaign activated on Meta! ${data.adSetsCreated} ad sets, ${data.adsCreated} ads created.`;
        if (data.warnings?.length > 0) {
          alert(`${msg}\n\nWarnings:\n${data.warnings.join('\n')}`);
        }
      } else {
        console.error('[Campaigns] Activate failed:', data);
        alert(`Failed to activate: ${data.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Campaigns] Activate failed:', err);
      alert('Network error activating campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateBudget = async (id: string, newBudget: number): Promise<void> => {
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyBudget: newBudget }),
      });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, dailyBudget: newBudget } : c)),
        );
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to update budget: ${err.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Campaigns] Update budget failed:', err);
      alert('Network error updating budget');
    }
  };

  const handlePause = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}/pause`, { method: 'POST' });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'PAUSED' as CampaignStrategyStatus } : c)),
        );
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to pause: ${err.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Campaigns] Pause failed:', err);
      alert('Network error pausing campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (id: string): Promise<void> => {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/autopilot/strategies/${id}/resume`, { method: 'POST' });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'ACTIVE' as CampaignStrategyStatus } : c)),
        );
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to resume: ${err.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[Campaigns] Resume failed:', err);
      alert('Network error resuming campaign');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Grouped campaigns by status ────────────────────────────
  const suggestedCampaigns = campaigns.filter((c) => c.status === 'SUGGESTED');
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE' || c.status === 'APPROVED');
  const otherCampaigns = campaigns.filter(
    (c) => c.status === 'PAUSED' || c.status === 'COMPLETED' || c.status === 'REJECTED',
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--foreground-secondary)]" />
        <span className="ml-2 text-sm text-[var(--foreground-secondary)]">Loading campaign strategies...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">Campaign Strategies</h2>
          <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
            AI-generated campaign suggestions based on your product performance
          </p>
        </div>
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-apple-purple hover:bg-apple-purple/80 disabled:opacity-50 rounded-xl transition-all ease-spring press-scale"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? 'Generating...' : 'Generate Suggestions'}
        </button>
      </div>

      {/* ── Empty State ─────────────────────────────────────────── */}
      {campaigns.length === 0 && (
        <div className="card px-6 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--tint-purple)] flex items-center justify-center mx-auto mb-3">
            <Megaphone className="h-6 w-6 text-apple-purple" />
          </div>
          <p className="text-sm font-semibold text-[var(--foreground)]">No campaign strategies yet</p>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">
            Click &quot;Generate Suggestions&quot; to create AI-powered campaign strategies based on your top products.
          </p>
        </div>
      )}

      {/* ── Suggested Campaigns ──────────────────────────────────── */}
      {suggestedCampaigns.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-apple-yellow" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Suggestions ({suggestedCampaigns.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence>
              {suggestedCampaigns.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CampaignCard
                    campaign={c}
                    currency={currency}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onPause={handlePause}
                    onResume={handleResume}
                    onActivate={handleActivate}
                    onUpdateBudget={handleUpdateBudget}
                    actionLoading={actionLoading}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Active / Approved Campaigns ───────────────────────────── */}
      {activeCampaigns.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-apple-green" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Active ({activeCampaigns.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence>
              {activeCampaigns.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CampaignCard
                    campaign={c}
                    currency={currency}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onPause={handlePause}
                    onResume={handleResume}
                    onActivate={handleActivate}
                    onUpdateBudget={handleUpdateBudget}
                    actionLoading={actionLoading}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Other Campaigns (paused/completed/rejected) ─────────── */}
      {otherCampaigns.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--foreground-secondary)]">
            Past ({otherCampaigns.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence>
              {otherCampaigns.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CampaignCard
                    campaign={c}
                    currency={currency}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onPause={handlePause}
                    onResume={handleResume}
                    onActivate={handleActivate}
                    onUpdateBudget={handleUpdateBudget}
                    actionLoading={actionLoading}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Seasonal Calendar ──────────────────────────────────── */}
      {calendarEvents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-apple-orange" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Seasonal Calendar</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {calendarEvents.map((event) => (
              <SeasonalEventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
