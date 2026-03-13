// ──────────────────────────────────────────────────────────────
// Growth OS — Psychology Layer: Human-Readable Labels & Colors
// ──────────────────────────────────────────────────────────────

import type {
  AwarenessLevel,
  EmotionalState,
  PsychTrigger,
  FunnelStage,
  TriggerConfidence,
  PsychDiagnosticCode,
} from './types';

interface LabelStyle {
  readonly label: string;
  readonly short: string;
  readonly bg: string;
  readonly text: string;
}

// ── Awareness Levels ──────────────────────────────────────────

export const AWARENESS_LABELS: Record<AwarenessLevel, LabelStyle> = {
  UNAWARE:        { label: 'Unaware',        short: 'UNW', bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple' },
  PAIN_AWARE:     { label: 'Pain Aware',     short: 'PAN', bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red' },
  SOLUTION_AWARE: { label: 'Solution Aware', short: 'SOL', bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow' },
  PRODUCT_AWARE:  { label: 'Product Aware',  short: 'PRD', bg: 'bg-[var(--tint-blue)]',   text: 'text-apple-blue' },
  MOST_AWARE:     { label: 'Most Aware',     short: 'MAX', bg: 'bg-[var(--tint-green)]',  text: 'text-apple-green' },
};

// ── Emotional States ──────────────────────────────────────────

export const EMOTION_LABELS: Record<EmotionalState, LabelStyle> = {
  FRUSTRATED:  { label: 'Frustrated',  short: 'FRS', bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red' },
  HOPEFUL:     { label: 'Hopeful',     short: 'HPF', bg: 'bg-[var(--tint-green)]',  text: 'text-apple-green' },
  SKEPTICAL:   { label: 'Skeptical',   short: 'SKP', bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow' },
  CURIOUS:     { label: 'Curious',     short: 'CRS', bg: 'bg-[var(--tint-blue)]',   text: 'text-apple-blue' },
  PROUD:       { label: 'Proud',       short: 'PRD', bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple' },
  ANXIOUS:     { label: 'Anxious',     short: 'ANX', bg: 'bg-[var(--tint-orange)]', text: 'text-apple-orange' },
  BORED:       { label: 'Bored',       short: 'BRD', bg: 'bg-glass-hover',          text: 'text-[var(--foreground-secondary)]' },
  ASPIRATIONAL:{ label: 'Aspirational',short: 'ASP', bg: 'bg-[var(--tint-blue)]',   text: 'text-apple-blue' },
};

// ── Psychological Triggers ────────────────────────────────────

export const TRIGGER_LABELS: Record<PsychTrigger, { readonly label: string; readonly short: string }> = {
  LOSS_AVERSION:            { label: 'Loss Aversion',            short: 'Loss' },
  SOCIAL_PROOF_SPECIFICITY: { label: 'Social Proof (Specific)',  short: 'Social' },
  SOCIAL_PROOF_AUTHORITY:   { label: 'Social Proof (Authority)', short: 'Authority' },
  IDENTITY_TRIBAL:          { label: 'Identity (Tribal)',        short: 'Tribal' },
  IDENTITY_ASPIRATIONAL:    { label: 'Identity (Aspirational)',  short: 'Aspire' },
  COGNITIVE_EASE:           { label: 'Cognitive Ease',           short: 'Ease' },
  CURIOSITY_GAP:            { label: 'Curiosity Gap',            short: 'Curiosity' },
  ENDOWMENT_EFFECT:         { label: 'Endowment Effect',        short: 'Endow' },
  REACTANCE:                { label: 'Reactance',                short: 'React' },
  RECIPROCITY:              { label: 'Reciprocity',              short: 'Recip' },
  CONTRAST_EFFECT:          { label: 'Contrast Effect',          short: 'Contrast' },
  PEAK_END_RULE:            { label: 'Peak-End Rule',            short: 'Peak' },
  SCARCITY:                 { label: 'Scarcity',                 short: 'Scarce' },
  COMMITMENT_CONSISTENCY:   { label: 'Commitment & Consistency', short: 'Commit' },
};

// ── Funnel Stages ─────────────────────────────────────────────

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  TOFU: 'Top of Funnel',
  MOFU: 'Mid Funnel',
  BOFU: 'Bottom of Funnel',
  RETENTION: 'Retention',
};

// ── Outcome Badges ────────────────────────────────────────────

export const OUTCOME_STYLES: Record<string, { readonly bg: string; readonly text: string; readonly label: string }> = {
  OPEN:          { bg: 'bg-[var(--tint-blue)]',   text: 'text-apple-blue',   label: 'Open' },
  WIN:           { bg: 'bg-[var(--tint-green)]',  text: 'text-apple-green',  label: 'Win' },
  LOSS:          { bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red',    label: 'Loss' },
  INCONCLUSIVE:  { bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow', label: 'Inconclusive' },
};

// ── Confidence Levels ─────────────────────────────────────────

export const CONFIDENCE_STYLES: Record<TriggerConfidence, { readonly bg: string; readonly text: string; readonly label: string }> = {
  LOW:    { bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red',    label: 'Low' },
  MEDIUM: { bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow', label: 'Medium' },
  HIGH:   { bg: 'bg-[var(--tint-green)]',  text: 'text-apple-green',  label: 'High' },
};

// ── Diagnostic Codes ──────────────────────────────────────────

export const DIAGNOSTIC_LABELS: Record<PsychDiagnosticCode, { readonly label: string; readonly bg: string; readonly text: string }> = {
  audience_mismatch:            { label: 'Audience Mismatch',     bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red' },
  creative_execution:           { label: 'Creative Execution',    bg: 'bg-[var(--tint-orange)]', text: 'text-apple-orange' },
  awareness_trigger_mismatch:   { label: 'Trigger Mismatch',      bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow' },
  promise_mismatch:             { label: 'Promise Mismatch',      bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple' },
  commitment_friction:          { label: 'Commitment Friction',   bg: 'bg-[var(--tint-red)]',    text: 'text-apple-red' },
  frequency_fatigue:            { label: 'Frequency Fatigue',     bg: 'bg-glass-hover',          text: 'text-[var(--foreground-secondary)]' },
  healthy:                      { label: 'Healthy',               bg: 'bg-[var(--tint-green)]',  text: 'text-apple-green' },
  insufficient_data:            { label: 'Insufficient Data',     bg: 'bg-glass-hover',          text: 'text-[var(--foreground-secondary)]' },
};

// ── Ordered lists for UI rendering ────────────────────────────

export const AWARENESS_ORDER: readonly AwarenessLevel[] = [
  'UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE',
];

export const TRIGGER_ORDER: readonly PsychTrigger[] = [
  'LOSS_AVERSION', 'SOCIAL_PROOF_SPECIFICITY', 'SOCIAL_PROOF_AUTHORITY',
  'IDENTITY_TRIBAL', 'IDENTITY_ASPIRATIONAL', 'COGNITIVE_EASE',
  'CURIOSITY_GAP', 'ENDOWMENT_EFFECT', 'SCARCITY',
  'CONTRAST_EFFECT', 'RECIPROCITY', 'COMMITMENT_CONSISTENCY',
  'PEAK_END_RULE', 'REACTANCE',
];
