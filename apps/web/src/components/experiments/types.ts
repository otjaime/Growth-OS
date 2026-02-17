export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  channel: string | null;
  primaryMetric: string;
  targetLift: number | null;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  iceScore: number | null;
  startDate: string | null;
  endDate: string | null;
  result: string | null;
  learnings: string | null;
  nextSteps: string | null;
  createdAt: string;
  _count?: { metrics: number };
  // A/B test fields
  controlName: string | null;
  variantName: string | null;
  controlSampleSize: number | null;
  variantSampleSize: number | null;
  controlConversions: number | null;
  variantConversions: number | null;
  controlRate: number | null;
  variantRate: number | null;
  absoluteLift: number | null;
  relativeLift: number | null;
  pValue: number | null;
  confidenceLevel: number | null;
  isSignificant: boolean | null;
  confidenceInterval: { lower: number; upper: number } | null;
  verdict: string | null;
}

export interface ExperimentMetric {
  id: string;
  date: string;
  metricName: string;
  value: number;
  notes: string | null;
}

export type ExperimentStatus = 'IDEA' | 'BACKLOG' | 'RUNNING' | 'COMPLETED' | 'ARCHIVED';
export type SortKey = 'name' | 'channel' | 'primaryMetric' | 'iceScore' | 'status' | 'duration';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'table' | 'kanban';

export const STATUSES = ['ALL', 'IDEA', 'BACKLOG', 'RUNNING', 'COMPLETED', 'ARCHIVED'] as const;

export const KANBAN_STATUSES: readonly ExperimentStatus[] = ['IDEA', 'BACKLOG', 'RUNNING', 'COMPLETED', 'ARCHIVED'] as const;

export const STATUS_COLORS: Record<string, string> = {
  IDEA: 'bg-white/[0.04] text-[var(--foreground)]/80',
  BACKLOG: 'bg-[var(--tint-blue)] text-apple-blue',
  RUNNING: 'bg-[var(--tint-green)] text-apple-green',
  COMPLETED: 'bg-[var(--tint-purple)] text-apple-purple',
  ARCHIVED: 'bg-white/[0.04] text-[var(--foreground-secondary)]/70',
};

export const CHANNELS = ['meta', 'google_ads', 'tiktok', 'email', 'organic', 'affiliate', 'direct', 'other'];
export const METRICS = ['conversion_rate', 'aov', 'cac', 'ltv', 'mer', 'revenue', 'sessions', 'retention'];

export const TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  IDEA: ['BACKLOG', 'ARCHIVED'],
  BACKLOG: ['RUNNING', 'IDEA', 'ARCHIVED'],
  RUNNING: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['IDEA'],
};

export const STATUS_ORDER: Record<ExperimentStatus, number> = {
  IDEA: 0,
  BACKLOG: 1,
  RUNNING: 2,
  COMPLETED: 3,
  ARCHIVED: 4,
};

export function formatDuration(startDate: string | null, endDate: string | null): string | null {
  if (!startDate) return null;
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function getDurationDays(startDate: string | null, endDate: string | null): number {
  if (!startDate) return -1;
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}
