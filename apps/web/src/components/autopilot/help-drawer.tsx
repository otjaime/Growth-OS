'use client';

import { useEffect, useCallback } from 'react';
import { X, BookOpen, Shield, Zap, Eye, Lightbulb } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { METRIC_LABELS, MODE_LABELS } from './human-labels';
import type { MetricKey } from './types';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

const METRIC_ORDER: MetricKey[] = ['roas', 'ctr', 'cpc', 'frequency', 'spend', 'conversions', 'revenue'];

const MODE_ICONS: Record<string, typeof Eye> = {
  monitor: Eye,
  suggest: Lightbulb,
  auto: Zap,
};

export function HelpDrawer({ open, onClose }: HelpDrawerProps): JSX.Element {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-0 right-0 z-[91] h-full w-full max-w-[420px] bg-[var(--surface)] border-l border-[var(--glass-border)] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
              <div className="flex items-center gap-2.5">
                <BookOpen className="h-4 w-4 text-apple-blue" />
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Help</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors press-scale"
              >
                <X className="h-4 w-4 text-[var(--foreground-secondary)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* How Copilot Works */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  How does Copilot work?
                </h3>
                <div className="space-y-3 text-sm text-[var(--foreground-secondary)] leading-relaxed">
                  <p>
                    Copilot connects to your Meta Ads account and analyzes how each ad is performing.
                    It checks things like whether you&apos;re getting a good return on your spending,
                    if people are getting tired of seeing the same ad, and if any ads are wasting money.
                  </p>
                  <p>
                    When it finds something worth acting on, it creates a simple recommendation
                    you can approve with one tap. You&apos;re always in control — nothing happens
                    without your say-so (unless you turn on Auto-Apply).
                  </p>
                  <p>
                    Over time, Copilot learns what works for your business and makes
                    better recommendations.
                  </p>
                </div>
              </section>

              {/* Modes */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  What does each mode do?
                </h3>
                <div className="space-y-3">
                  {Object.entries(MODE_LABELS).map(([key, { label, description }]) => {
                    const Icon = MODE_ICONS[key] ?? Eye;
                    return (
                      <div key={key} className="flex items-start gap-3 p-3 rounded-lg bg-glass-muted">
                        <Icon className="h-4 w-4 text-[var(--foreground-secondary)] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                          <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Metric Definitions */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  What do the numbers mean?
                </h3>
                <div className="space-y-2">
                  {METRIC_ORDER.map((key) => {
                    const metric = METRIC_LABELS[key];
                    return (
                      <div key={key} className="p-3 rounded-lg bg-glass-muted">
                        <p className="text-sm font-medium text-[var(--foreground)]">{metric.label}</p>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{metric.tooltip}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Data Safety */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                  Is my data safe?
                </h3>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--tint-green)] border border-apple-green/20">
                  <Shield className="h-4 w-4 text-apple-green shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm text-[var(--foreground-secondary)] leading-relaxed">
                    <p>
                      Your data is encrypted and stored securely. We never share your ad data
                      with anyone. Your Meta Ads credentials are encrypted with AES-256
                      and only used to read your ad performance.
                    </p>
                    <p>
                      When Copilot takes action (like pausing an ad), it uses the Meta API
                      on your behalf. You can undo any action instantly.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
