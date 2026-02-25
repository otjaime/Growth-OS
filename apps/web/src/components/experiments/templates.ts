import type { ExperimentType } from './types';

export interface ExperimentTemplate {
  type: ExperimentType;
  label: string;
  description: string;
  defaultHypothesis: string;
  defaultMetric: string;
  defaultGuardrails: string[];
  suggestedChannels: string[];
}

export const EXPERIMENT_TEMPLATES: readonly ExperimentTemplate[] = [
  {
    type: 'CRO',
    label: 'Conversion Rate Optimization',
    description: 'Funnel improvements, checkout optimization, landing page tests',
    defaultHypothesis: 'If we [optimize this step], then conversion rate will increase because [reason].',
    defaultMetric: 'conversion_rate',
    defaultGuardrails: ['aov', 'revenue'],
    suggestedChannels: ['direct', 'organic'],
  },
  {
    type: 'CREATIVE',
    label: 'Creative & Ad Testing',
    description: 'Ad creatives, copy tests, audience targeting experiments',
    defaultHypothesis: 'If we [change the creative/copy], then CAC will decrease because [reason].',
    defaultMetric: 'cac',
    defaultGuardrails: ['conversion_rate', 'aov'],
    suggestedChannels: ['meta', 'google_ads', 'tiktok'],
  },
  {
    type: 'PRICING',
    label: 'Pricing & Promotions',
    description: 'Price testing, discount strategies, shipping threshold experiments',
    defaultHypothesis: 'If we [adjust pricing/promotion], then AOV will increase because [reason].',
    defaultMetric: 'aov',
    defaultGuardrails: ['conversion_rate', 'revenue'],
    suggestedChannels: [],
  },
  {
    type: 'LIFECYCLE',
    label: 'Lifecycle & Retention',
    description: 'Email flows, win-back campaigns, loyalty programs',
    defaultHypothesis: 'If we [improve this lifecycle touchpoint], then retention will improve because [reason].',
    defaultMetric: 'retention',
    defaultGuardrails: ['revenue', 'ltv'],
    suggestedChannels: ['email'],
  },
  {
    type: 'LANDING',
    label: 'Landing Pages',
    description: 'Landing page design, hero tests, above-the-fold experiments',
    defaultHypothesis: 'If we [redesign this landing page], then sessions-to-purchase rate will increase because [reason].',
    defaultMetric: 'conversion_rate',
    defaultGuardrails: ['aov', 'sessions'],
    suggestedChannels: ['meta', 'google_ads'],
  },
  {
    type: 'OTHER',
    label: 'Other',
    description: 'Custom experiments that don\'t fit standard categories',
    defaultHypothesis: 'If we [change], then [metric] will [improve] because [reason].',
    defaultMetric: 'revenue',
    defaultGuardrails: [],
    suggestedChannels: [],
  },
] as const;

export function getTemplate(type: ExperimentType): ExperimentTemplate | undefined {
  return EXPERIMENT_TEMPLATES.find((t) => t.type === type);
}
