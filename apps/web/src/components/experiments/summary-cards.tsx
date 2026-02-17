'use client';

import { FlaskConical, Clock, CheckCircle, Trophy } from 'lucide-react';
import type { Experiment } from './types';

export function SummaryCards({ allExperiments }: { allExperiments: Experiment[] }): React.ReactElement {
  const total = allExperiments.length;
  const running = allExperiments.filter((e) => e.status === 'RUNNING').length;
  const completed = allExperiments.filter((e) => e.status === 'COMPLETED').length;
  const withResult = allExperiments.filter((e) => e.status === 'COMPLETED' && (e.verdict || e.result));
  const wins = withResult.filter((e) => {
    if (e.verdict) return e.verdict === 'WINNER';
    return e.result && !e.result.toLowerCase().includes('no impact') && !e.result.toLowerCase().includes('failed') && !e.result.toLowerCase().includes('negative');
  });
  const winRate = withResult.length > 0 ? Math.round((wins.length / withResult.length) * 100) : null;

  const cards = [
    { label: 'Total Experiments', value: total, icon: FlaskConical, color: 'text-apple-blue' },
    { label: 'Running Now', value: running, icon: Clock, color: 'text-apple-green' },
    { label: 'Completed', value: completed, icon: CheckCircle, color: 'text-apple-purple' },
    { label: 'Win Rate', value: winRate != null ? `${winRate}%` : '\u2014', icon: Trophy, color: 'text-apple-green' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">{c.label}</span>
            <c.icon className={`h-4 w-4 ${c.color}`} />
          </div>
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
