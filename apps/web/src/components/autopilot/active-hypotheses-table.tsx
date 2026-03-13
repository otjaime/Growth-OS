'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PsychHypothesisRecord } from './types';
import { AWARENESS_LABELS, EMOTION_LABELS, TRIGGER_LABELS, OUTCOME_STYLES } from './psychology-labels';
import { CloseHypothesisForm } from './close-hypothesis-form';

interface ActiveHypothesesTableProps {
  hypotheses: PsychHypothesisRecord[];
  loading: boolean;
  outcomeFilter: string;
  onFilterChange: (f: string) => void;
  onRefresh: () => void;
}

const FILTER_OPTIONS = ['ALL', 'OPEN', 'WIN', 'LOSS', 'INCONCLUSIVE'] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function HypothesisCard({
  hypothesis,
  onRefresh,
}: {
  hypothesis: PsychHypothesisRecord;
  onRefresh: () => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);

  const outcomeKey = hypothesis.outcome ?? 'OPEN';
  const outcomeStyle = OUTCOME_STYLES[outcomeKey] ?? OUTCOME_STYLES.OPEN;
  const awarenessStyle = AWARENESS_LABELS[hypothesis.awarenessLevel];
  const emotionStyle = EMOTION_LABELS[hypothesis.emotionalState];
  const triggerLabel = TRIGGER_LABELS[hypothesis.primaryTrigger];

  return (
    <div className="card p-4 transition-all ease-spring">
      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Outcome badge */}
        <div className={`shrink-0 px-2 py-1 rounded-lg text-caption font-semibold ${outcomeStyle.bg} ${outcomeStyle.text}`}>
          {outcomeStyle.label}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[var(--foreground)]">
              {triggerLabel.label}
            </span>
            {hypothesis.secondaryTrigger && (
              <span className="text-caption text-[var(--foreground-secondary)]">
                + {TRIGGER_LABELS[hypothesis.secondaryTrigger].short}
              </span>
            )}
            <span className="text-caption text-[var(--foreground-secondary)]">·</span>
            <span className={`text-caption px-1.5 py-0.5 rounded ${awarenessStyle.bg} ${awarenessStyle.text}`}>
              {awarenessStyle.short}
            </span>
            <span className="text-caption text-[var(--foreground-secondary)]">→</span>
            <span className={`text-caption px-1.5 py-0.5 rounded ${emotionStyle.bg} ${emotionStyle.text}`}>
              {emotionStyle.short}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-caption text-[var(--foreground-secondary)]">
            <span>{hypothesis.vertical}</span>
            <span>·</span>
            <span>
              {hypothesis.falsificationMetric.toUpperCase()} +{hypothesis.falsificationTarget}% in {hypothesis.falsificationWindow}d
            </span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatDate(hypothesis.createdAt)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5">
          {!hypothesis.outcome && !closing && (
            <button
              onClick={(e) => { e.stopPropagation(); setClosing(true); }}
              className="text-caption font-medium text-apple-blue hover:text-apple-blue/80 px-2 py-1 rounded-lg press-scale"
            >
              Close
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] press-scale p-1"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              <div>
                <span className="text-caption text-[var(--foreground-secondary)]">Objection: </span>
                <span className="text-xs text-[var(--foreground)]">{hypothesis.primaryObjection}</span>
              </div>
              <div>
                <span className="text-caption text-[var(--foreground-secondary)]">Min. Viable Shift: </span>
                <span className="text-xs text-[var(--foreground)]">{hypothesis.minimumViableShift}</span>
              </div>
              {hypothesis.triggerRationale && (
                <div>
                  <span className="text-caption text-[var(--foreground-secondary)]">Rationale: </span>
                  <span className="text-xs text-[var(--foreground)]">{hypothesis.triggerRationale}</span>
                </div>
              )}
              {hypothesis.postMortem && (
                <div className="mt-2 p-3 rounded-lg bg-glass-muted space-y-1.5">
                  <div className="text-caption font-semibold text-[var(--foreground)]">Post-Mortem</div>
                  <div className="flex gap-3 text-caption">
                    <span className={hypothesis.postMortem.wasAwarenessCorrect ? 'text-apple-green' : 'text-apple-red'}>
                      Awareness {hypothesis.postMortem.wasAwarenessCorrect ? '✓' : '✗'}
                    </span>
                    <span className={hypothesis.postMortem.didTriggerActivate ? 'text-apple-green' : 'text-apple-red'}>
                      Trigger {hypothesis.postMortem.didTriggerActivate ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--foreground)]">
                    {hypothesis.postMortem.whyWorkedOrFailed}
                  </div>
                  {hypothesis.postMortem.verticalLearning && (
                    <div className="text-xs text-[var(--foreground-secondary)]">
                      Learning: {hypothesis.postMortem.verticalLearning}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline close form */}
      <AnimatePresence>
        {closing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <CloseHypothesisForm
              hypothesisId={hypothesis.id}
              onComplete={() => { setClosing(false); onRefresh(); }}
              onCancel={() => setClosing(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActiveHypothesesTable({
  hypotheses,
  loading,
  outcomeFilter,
  onFilterChange,
  onRefresh,
}: ActiveHypothesesTableProps): JSX.Element {
  // Client-side filter
  const filtered = outcomeFilter === 'ALL'
    ? hypotheses
    : outcomeFilter === 'OPEN'
      ? hypotheses.filter((h) => !h.outcome)
      : hypotheses.filter((h) => h.outcome === outcomeFilter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[var(--foreground-secondary)]" />
          <h3 className="text-sm font-semibold">Hypotheses</h3>
          <span className="text-caption text-[var(--foreground-secondary)]">
            {filtered.length} of {hypotheses.length}
          </span>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-0.5 bg-glass-muted rounded-xl p-1">
          {FILTER_OPTIONS.map((f) => {
            const isActive = outcomeFilter === f;
            return (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium press-scale transition-colors ease-spring ${
                  isActive
                    ? 'bg-glass-active text-[var(--foreground)]'
                    : 'text-[var(--foreground-secondary)]'
                }`}
              >
                {f === 'ALL' ? 'All' : f === 'OPEN' ? 'Open' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-glass-hover" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-glass-hover flex items-center justify-center mx-auto mb-3">
            <FlaskConical className="h-5 w-5 text-[var(--foreground-secondary)]" />
          </div>
          <p className="text-sm font-medium text-[var(--foreground)]">
            {outcomeFilter === 'ALL' ? 'No hypotheses yet' : `No ${outcomeFilter.toLowerCase()} hypotheses`}
          </p>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">
            Create a hypothesis to start tracking trigger performance
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => (
            <HypothesisCard key={h.id} hypothesis={h} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
