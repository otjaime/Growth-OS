'use client';

import { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Loader2, Trophy, TrendingUp, Target } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
import type { PsychHypothesisRecord, TriggerPerformanceRecord } from './types';
import { HypothesisWizard } from './hypothesis-wizard';
import { ActiveHypothesesTable } from './active-hypotheses-table';
import { TriggerPerformanceHeatmap } from './trigger-performance-heatmap';

export function PsychologyTab(): JSX.Element {
  const [hypotheses, setHypotheses] = useState<PsychHypothesisRecord[]>([]);
  const [performanceRecords, setPerformanceRecords] = useState<TriggerPerformanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');

  // ── Data fetching ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hypRes, perfRes] = await Promise.all([
        apiFetch('/api/autopilot/psychology/hypotheses'),
        apiFetch('/api/autopilot/psychology/trigger-performance'),
      ]);

      if (hypRes.ok) {
        const hypData = (await hypRes.json()) as { hypotheses: PsychHypothesisRecord[]; total: number };
        setHypotheses(hypData.hypotheses);
      }

      if (perfRes.ok) {
        const perfData = (await perfRes.json()) as { records: TriggerPerformanceRecord[]; total: number };
        setPerformanceRecords(perfData.records);
      }
    } catch {
      // Silently fail — empty states will render
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Computed KPIs ───────────────────────────────────────────
  const totalHypotheses = hypotheses.length;
  const closedHypotheses = hypotheses.filter((h) => h.outcome);
  const wins = closedHypotheses.filter((h) => h.outcome === 'WIN');
  const winRate = closedHypotheses.length > 0
    ? (wins.length / closedHypotheses.length) * 100
    : 0;

  // Top trigger by win rate (from performance records with sample >= 3)
  const topTrigger = performanceRecords
    .filter((r) => r.sampleSize >= 3)
    .sort((a, b) => b.winRate - a.winRate)[0];

  // Avg ROAS delta from wins
  const avgRoasDelta = performanceRecords.length > 0
    ? performanceRecords.reduce((sum, r) => sum + r.avgRoasDelta, 0) / performanceRecords.length
    : 0;

  // ── Handlers ────────────────────────────────────────────────
  function handleWizardComplete(_hypothesisId: string): void {
    setWizardOpen(false);
    void fetchData();
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4.5 w-4.5 text-apple-purple" />
          <h2 className="text-base font-semibold">Psychology Engine</h2>
        </div>

        <button
          onClick={() => setWizardOpen(!wizardOpen)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-apple-blue text-white press-scale"
        >
          <Plus className="h-3 w-3" />
          New Hypothesis
        </button>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────── */}
      {!loading && totalHypotheses > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiMini
            icon={<Target className="h-3.5 w-3.5 text-apple-blue" />}
            label="Hypotheses"
            value={String(totalHypotheses)}
            sub={`${closedHypotheses.length} closed`}
          />
          <KpiMini
            icon={<Trophy className="h-3.5 w-3.5 text-apple-green" />}
            label="Win Rate"
            value={closedHypotheses.length > 0 ? `${winRate.toFixed(0)}%` : '--'}
            sub={`${wins.length} wins`}
          />
          <KpiMini
            icon={<TrendingUp className="h-3.5 w-3.5 text-apple-orange" />}
            label="Avg ROAS Δ"
            value={avgRoasDelta !== 0 ? `${avgRoasDelta > 0 ? '+' : ''}${avgRoasDelta.toFixed(1)}%` : '--'}
            sub="across triggers"
          />
          <KpiMini
            icon={<Brain className="h-3.5 w-3.5 text-apple-purple" />}
            label="Top Trigger"
            value={topTrigger ? topTrigger.trigger.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()).split(' ').slice(0, 2).join(' ') : '--'}
            sub={topTrigger ? `${(topTrigger.winRate * 100).toFixed(0)}% win rate` : 'needs data'}
          />
        </div>
      )}

      {/* ── Wizard (conditional) ───────────────────────────── */}
      <AnimatePresence>
        {wizardOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <HypothesisWizard
              onComplete={handleWizardComplete}
              onCancel={() => setWizardOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading state ──────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-[var(--foreground-secondary)] animate-spin" />
        </div>
      )}

      {/* ── Hypotheses table ───────────────────────────────── */}
      {!loading && (
        <ActiveHypothesesTable
          hypotheses={hypotheses}
          loading={false}
          outcomeFilter={outcomeFilter}
          onFilterChange={setOutcomeFilter}
          onRefresh={fetchData}
        />
      )}

      {/* ── Trigger Performance Heatmap ────────────────────── */}
      {!loading && (
        <TriggerPerformanceHeatmap records={performanceRecords} loading={false} />
      )}
    </div>
  );
}

// ── Mini KPI card ─────────────────────────────────────────────

function KpiMini({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}): JSX.Element {
  return (
    <div className="card px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-caption text-[var(--foreground-secondary)]">{label}</span>
      </div>
      <div className="text-sm font-semibold text-[var(--foreground)]">{value}</div>
      <div className="text-caption text-[var(--foreground-secondary)]">{sub}</div>
    </div>
  );
}
