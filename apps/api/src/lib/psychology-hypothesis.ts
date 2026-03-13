// ──────────────────────────────────────────────────────────────
// Growth OS — Psychology Hypothesis Module
// AI-powered State Diagnosis Protocol + structured hypothesis
// formatting. Implements Phase 4 of the Psychology Layer plan.
// ──────────────────────────────────────────────────────────────

import { isAIConfigured, getClient, AI_MODEL } from './ai.js';
import type {
  AwarenessLevel,
  PsychTrigger,
  EmotionalState,
  FunnelStage,
} from '@growth-os/etl';
import { selectTrigger } from '@growth-os/etl';
import type { TriggerRecommendation, TriggerPerformanceData } from '@growth-os/etl';

// ── Interfaces ───────────────────────────────────────────────

export interface StateDiagnosisInput {
  /** Product title for context. */
  readonly productTitle: string;
  /** Product category/type (e.g., "apparel", "electronics"). */
  readonly productType: string;
  /** Business vertical (e.g., "dtc_fashion", "dtc_beauty"). */
  readonly vertical: string;
  /** Target audience description. */
  readonly targetAudience: string;
  /** Optional ad performance metrics for evidence. */
  readonly adMetrics?: {
    readonly cpm?: number;
    readonly ctr?: number;
    readonly hookRetention?: number;
    readonly landingCvr?: number;
    readonly checkoutCvr?: number;
    readonly roas?: number;
    readonly frequency?: number;
  };
  /** Manual overrides — skip AI for these fields if provided. */
  readonly manualAwareness?: AwarenessLevel;
  readonly manualEmotion?: EmotionalState;
  readonly manualObjection?: string;
}

export interface StateDiagnosisResult {
  /** Diagnosed awareness level. */
  readonly awarenessLevel: AwarenessLevel;
  /** Evidence supporting the awareness diagnosis. */
  readonly awarenessEvidence: string;
  /** Diagnosed emotional state. */
  readonly emotionalState: EmotionalState;
  /** Primary objection the audience holds. */
  readonly primaryObjection: string;
  /** Minimum viable shift: what needs to change. */
  readonly minimumViableShift: string;
  /** Whether AI was used or demo fallback. */
  readonly source: 'ai' | 'demo_fallback' | 'manual_override';
}

export interface StructuredHypothesis {
  /** State diagnosis fields. */
  readonly awarenessLevel: AwarenessLevel;
  readonly awarenessEvidence: string;
  readonly emotionalState: EmotionalState;
  readonly primaryObjection: string;
  readonly minimumViableShift: string;
  /** Trigger recommendation. */
  readonly primaryTrigger: PsychTrigger;
  readonly secondaryTrigger: PsychTrigger | undefined;
  readonly triggerRationale: string;
  readonly triggerSource: TriggerRecommendation['source'];
  /** Falsification criteria. */
  readonly falsificationMetric: string;
  readonly falsificationTarget: number;
  readonly falsificationWindow: number;
  /** Human-readable hypothesis text. */
  readonly hypothesisText: string;
}

// ── Constants ────────────────────────────────────────────────

const VALID_AWARENESS_LEVELS: readonly AwarenessLevel[] = [
  'UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE',
] as const;

const VALID_EMOTIONAL_STATES: readonly EmotionalState[] = [
  'FRUSTRATED', 'HOPEFUL', 'SKEPTICAL', 'CURIOUS',
  'PROUD', 'ANXIOUS', 'BORED', 'ASPIRATIONAL',
] as const;

const STATE_DIAGNOSIS_PROMPT = `You are a consumer psychology expert analyzing a DTC e-commerce audience to diagnose their psychological state.

Given a product, vertical, and target audience, answer the 4 State Diagnosis Protocol questions:

1. **Awareness Level** — Where is this audience on Eugene Schwartz's awareness spectrum?
   - UNAWARE: Don't know they have a problem
   - PAIN_AWARE: Know the pain, don't know solutions exist
   - SOLUTION_AWARE: Know solutions exist, don't know your product
   - PRODUCT_AWARE: Know your product, haven't bought
   - MOST_AWARE: Know you, trust you, need a reason to act now

2. **Emotional State** — What emotion dominates their buying decision?
   - FRUSTRATED: Tried things that didn't work
   - HOPEFUL: Believe a solution exists, searching actively
   - SKEPTICAL: Doubt claims, need proof
   - CURIOUS: Open to learning, not urgent
   - PROUD: Want to signal identity/status
   - ANXIOUS: Fear of making wrong choice
   - BORED: Needs pattern interruption
   - ASPIRATIONAL: Gap between current and desired self

3. **Primary Objection** — What single objection prevents purchase? (e.g., "It's too expensive for what it does", "I'm not sure it'll work for me")

4. **Minimum Viable Shift** — What is the smallest psychological shift needed to move them one awareness level forward?

Respond in JSON format:
{
  "awarenessLevel": "<ENUM>",
  "awarenessEvidence": "<1-2 sentence explanation of why this level>",
  "emotionalState": "<ENUM>",
  "primaryObjection": "<specific objection in first person>",
  "minimumViableShift": "<1 sentence: from X to Y>"
}`;

// ── Demo Fallback Diagnosis ──────────────────────────────────

const DEMO_DIAGNOSIS_MAP: Record<string, StateDiagnosisResult> = {
  apparel: {
    awarenessLevel: 'SOLUTION_AWARE',
    awarenessEvidence: 'DTC apparel audiences typically know alternatives exist and are comparing options.',
    emotionalState: 'ASPIRATIONAL',
    primaryObjection: "I'm not sure this brand matches my style or values.",
    minimumViableShift: 'From comparing options to seeing this product as uniquely aligned with their identity.',
    source: 'demo_fallback',
  },
  beauty: {
    awarenessLevel: 'PAIN_AWARE',
    awarenessEvidence: 'Beauty consumers typically know their skin/hair concern but are overwhelmed by options.',
    emotionalState: 'FRUSTRATED',
    primaryObjection: "I've tried so many products that didn't work, why would this one be different?",
    minimumViableShift: 'From skepticism about all products to curiosity about this specific formulation.',
    source: 'demo_fallback',
  },
  electronics: {
    awarenessLevel: 'PRODUCT_AWARE',
    awarenessEvidence: 'Electronics buyers research extensively and usually know the product before buying.',
    emotionalState: 'SKEPTICAL',
    primaryObjection: "The specs look similar to cheaper alternatives, so why pay more?",
    minimumViableShift: 'From price comparison to understanding the specific value differential.',
    source: 'demo_fallback',
  },
  food: {
    awarenessLevel: 'SOLUTION_AWARE',
    awarenessEvidence: 'Food/beverage consumers know healthier/premium options exist but haven\'t committed to a brand.',
    emotionalState: 'CURIOUS',
    primaryObjection: "I'm interested but not sure it will taste good enough to justify the price.",
    minimumViableShift: 'From curiosity to trial — reduce the risk of a first purchase.',
    source: 'demo_fallback',
  },
  default: {
    awarenessLevel: 'SOLUTION_AWARE',
    awarenessEvidence: 'General DTC audience likely knows solutions exist and is comparing options.',
    emotionalState: 'CURIOUS',
    primaryObjection: "I don't know if this is worth the investment compared to what I have now.",
    minimumViableShift: 'From passive awareness to active consideration through a compelling proof point.',
    source: 'demo_fallback',
  },
};

function getDemoDiagnosis(productType: string): StateDiagnosisResult {
  const key = productType.toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 'default' key always exists
  return DEMO_DIAGNOSIS_MAP[key] ?? DEMO_DIAGNOSIS_MAP['default']!;
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Run the State Diagnosis Protocol for a product/audience.
 * Uses AI when available, falls back to demo diagnosis by vertical.
 * Manual overrides take precedence over both AI and demo.
 */
export async function diagnoseAudienceState(
  input: StateDiagnosisInput,
): Promise<StateDiagnosisResult> {
  // If all fields are manually provided, skip AI entirely
  if (input.manualAwareness && input.manualEmotion && input.manualObjection) {
    return {
      awarenessLevel: input.manualAwareness,
      awarenessEvidence: 'Manually set by user.',
      emotionalState: input.manualEmotion,
      primaryObjection: input.manualObjection,
      minimumViableShift: `Move audience from ${input.manualAwareness} to the next awareness level.`,
      source: 'manual_override',
    };
  }

  if (!isAIConfigured()) {
    const demo = getDemoDiagnosis(input.productType);
    return applyOverrides(demo, input);
  }

  try {
    const client = getClient();

    const metricsContext = input.adMetrics
      ? `\nAd Performance Metrics:\n${Object.entries(input.adMetrics).filter(([, v]) => v != null).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
      : '';

    const response = await client.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.4,
      max_tokens: 500,
      messages: [
        { role: 'system', content: STATE_DIAGNOSIS_PROMPT },
        {
          role: 'user',
          content: `Product: ${input.productTitle} (${input.productType})
Vertical: ${input.vertical}
Target Audience: ${input.targetAudience}${metricsContext}

Diagnose the audience state:`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = parseAIDiagnosis(content);

    if (parsed) {
      return applyOverrides(
        { ...parsed, source: 'ai' as const },
        input,
      );
    }

    // AI parsing failed — fall back to demo
    const demo = getDemoDiagnosis(input.productType);
    return applyOverrides(demo, input);
  } catch {
    // AI call failed — fall back to demo
    const demo = getDemoDiagnosis(input.productType);
    return applyOverrides(demo, input);
  }
}

/**
 * Apply manual overrides on top of AI or demo diagnosis.
 */
function applyOverrides(
  diagnosis: StateDiagnosisResult,
  input: StateDiagnosisInput,
): StateDiagnosisResult {
  return {
    ...diagnosis,
    awarenessLevel: input.manualAwareness ?? diagnosis.awarenessLevel,
    emotionalState: input.manualEmotion ?? diagnosis.emotionalState,
    primaryObjection: input.manualObjection ?? diagnosis.primaryObjection,
    source: (input.manualAwareness || input.manualEmotion || input.manualObjection)
      ? 'manual_override'
      : diagnosis.source,
  };
}

/**
 * Parse AI response JSON into a StateDiagnosisResult.
 * Returns null on parse failure.
 */
function parseAIDiagnosis(content: string): Omit<StateDiagnosisResult, 'source'> | null {
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const awarenessLevel = String(parsed.awarenessLevel ?? '').toUpperCase() as AwarenessLevel;
    const emotionalState = String(parsed.emotionalState ?? '').toUpperCase() as EmotionalState;

    // Validate enums
    if (!VALID_AWARENESS_LEVELS.includes(awarenessLevel)) return null;
    if (!VALID_EMOTIONAL_STATES.includes(emotionalState)) return null;

    return {
      awarenessLevel,
      awarenessEvidence: String(parsed.awarenessEvidence ?? ''),
      emotionalState,
      primaryObjection: String(parsed.primaryObjection ?? ''),
      minimumViableShift: String(parsed.minimumViableShift ?? ''),
    };
  } catch {
    return null;
  }
}

// ── Hypothesis Formatting ────────────────────────────────────

/**
 * Build a complete structured hypothesis from state diagnosis +
 * trigger selection, including falsification criteria.
 */
export function buildStructuredHypothesis(
  diagnosis: StateDiagnosisResult,
  vertical: string,
  funnelStage: FunnelStage,
  performanceRecords?: readonly TriggerPerformanceData[],
  metric?: string,
  targetLift?: number,
  windowDays?: number,
): StructuredHypothesis {
  // Get trigger recommendation
  const triggerRec: TriggerRecommendation = selectTrigger({
    awarenessLevel: diagnosis.awarenessLevel,
    emotionalState: diagnosis.emotionalState,
    vertical,
    funnelStage,
    performanceRecords: performanceRecords as TriggerPerformanceData[] | undefined,
  });

  const falsificationMetric = metric ?? 'ctr';
  const falsificationTarget = targetLift ?? 15;
  const falsificationWindow = windowDays ?? 7;

  const hypothesisText = formatHypothesisText({
    awarenessLevel: diagnosis.awarenessLevel,
    emotionalState: diagnosis.emotionalState,
    primaryTrigger: triggerRec.primary,
    secondaryTrigger: triggerRec.secondary ?? undefined,
    primaryObjection: diagnosis.primaryObjection,
    minimumViableShift: diagnosis.minimumViableShift,
    falsificationMetric,
    falsificationTarget,
    falsificationWindow,
  });

  return {
    awarenessLevel: diagnosis.awarenessLevel,
    awarenessEvidence: diagnosis.awarenessEvidence,
    emotionalState: diagnosis.emotionalState,
    primaryObjection: diagnosis.primaryObjection,
    minimumViableShift: diagnosis.minimumViableShift,
    primaryTrigger: triggerRec.primary,
    secondaryTrigger: triggerRec.secondary ?? undefined,
    triggerRationale: triggerRec.rationale,
    triggerSource: triggerRec.source,
    falsificationMetric,
    falsificationTarget,
    falsificationWindow,
    hypothesisText,
  };
}

/**
 * Format a structured hypothesis into human-readable text.
 * This text auto-populates the Experiment.hypothesis field.
 */
export function formatHypothesisText(input: {
  readonly awarenessLevel: AwarenessLevel;
  readonly emotionalState: EmotionalState;
  readonly primaryTrigger: PsychTrigger;
  readonly secondaryTrigger?: PsychTrigger;
  readonly primaryObjection: string;
  readonly minimumViableShift: string;
  readonly falsificationMetric: string;
  readonly falsificationTarget: number;
  readonly falsificationWindow: number;
}): string {
  const triggerLabel = input.secondaryTrigger
    ? `${input.primaryTrigger} (secondary: ${input.secondaryTrigger})`
    : input.primaryTrigger;

  return [
    `Audience State: [${input.awarenessLevel}, ${input.emotionalState}]`,
    `Trigger: ${triggerLabel} to address "${input.primaryObjection}"`,
    `Shift: ${input.minimumViableShift}`,
    `Falsifiable: If ${input.falsificationMetric} does not improve by ${input.falsificationTarget}% within ${input.falsificationWindow} days, reject this hypothesis.`,
  ].join('\n');
}

// ── Psychology Audit Checklist ────────────────────────────────

export interface AuditCheckItem {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface PsychologyAudit {
  readonly items: readonly AuditCheckItem[];
  readonly overallPass: boolean;
  readonly passCount: number;
  readonly totalCount: number;
}

/**
 * Run a pre-launch psychology audit on a hypothesis.
 * 9 pass/fail checks to catch common mistakes.
 */
export function auditHypothesis(hypothesis: {
  readonly awarenessLevel?: AwarenessLevel | null;
  readonly emotionalState?: EmotionalState | null;
  readonly primaryObjection?: string | null;
  readonly minimumViableShift?: string | null;
  readonly primaryTrigger?: PsychTrigger | null;
  readonly secondaryTrigger?: PsychTrigger | null;
  readonly triggerRationale?: string | null;
  readonly falsificationMetric?: string | null;
  readonly falsificationTarget?: number | null;
  readonly falsificationWindow?: number | null;
}): PsychologyAudit {
  const items: AuditCheckItem[] = [
    {
      id: 'awareness_level_set',
      label: 'Awareness Level Defined',
      passed: hypothesis.awarenessLevel != null &&
        VALID_AWARENESS_LEVELS.includes(hypothesis.awarenessLevel),
      detail: hypothesis.awarenessLevel
        ? `Set to ${hypothesis.awarenessLevel}`
        : 'Missing — audience awareness level not defined',
    },
    {
      id: 'emotional_state_set',
      label: 'Emotional State Defined',
      passed: hypothesis.emotionalState != null &&
        VALID_EMOTIONAL_STATES.includes(hypothesis.emotionalState),
      detail: hypothesis.emotionalState
        ? `Set to ${hypothesis.emotionalState}`
        : 'Missing — emotional state not defined',
    },
    {
      id: 'objection_addressed',
      label: 'Primary Objection Addressed',
      passed: typeof hypothesis.primaryObjection === 'string' &&
        hypothesis.primaryObjection.length >= 10,
      detail: hypothesis.primaryObjection
        ? `"${hypothesis.primaryObjection.slice(0, 80)}${hypothesis.primaryObjection.length > 80 ? '...' : ''}"`
        : 'Missing — no objection defined to address',
    },
    {
      id: 'minimum_viable_shift',
      label: 'Minimum Viable Shift Defined',
      passed: typeof hypothesis.minimumViableShift === 'string' &&
        hypothesis.minimumViableShift.length >= 10,
      detail: hypothesis.minimumViableShift
        ? `"${hypothesis.minimumViableShift.slice(0, 80)}${hypothesis.minimumViableShift.length > 80 ? '...' : ''}"`
        : 'Missing — no target shift defined',
    },
    {
      id: 'trigger_selected',
      label: 'Psychological Trigger Selected',
      passed: hypothesis.primaryTrigger != null,
      detail: hypothesis.primaryTrigger
        ? `Primary: ${hypothesis.primaryTrigger}${hypothesis.secondaryTrigger ? `, Secondary: ${hypothesis.secondaryTrigger}` : ''}`
        : 'Missing — no trigger selected',
    },
    {
      id: 'trigger_not_reactance',
      label: 'Trigger Is Not REACTANCE (Primary)',
      passed: hypothesis.primaryTrigger !== 'REACTANCE',
      detail: hypothesis.primaryTrigger === 'REACTANCE'
        ? 'FAIL — REACTANCE should only be used as an anti-pattern guide, never as the primary trigger'
        : 'Pass — primary trigger is not REACTANCE',
    },
    {
      id: 'trigger_rationale_provided',
      label: 'Trigger Rationale Provided',
      passed: typeof hypothesis.triggerRationale === 'string' &&
        hypothesis.triggerRationale.length >= 5,
      detail: hypothesis.triggerRationale
        ? 'Rationale provided'
        : 'Missing — no explanation for trigger choice',
    },
    {
      id: 'falsification_defined',
      label: 'Falsification Criteria Defined',
      passed: typeof hypothesis.falsificationMetric === 'string' &&
        hypothesis.falsificationMetric.length > 0 &&
        typeof hypothesis.falsificationTarget === 'number' &&
        hypothesis.falsificationTarget > 0 &&
        typeof hypothesis.falsificationWindow === 'number' &&
        hypothesis.falsificationWindow > 0,
      detail: hypothesis.falsificationMetric && hypothesis.falsificationTarget && hypothesis.falsificationWindow
        ? `${hypothesis.falsificationMetric} must improve ${hypothesis.falsificationTarget}% within ${hypothesis.falsificationWindow} days`
        : 'Missing — hypothesis is not falsifiable without clear criteria',
    },
    {
      id: 'copy_aligned',
      label: 'Copy Generation Possible',
      passed: hypothesis.primaryTrigger != null &&
        hypothesis.awarenessLevel != null &&
        hypothesis.emotionalState != null &&
        hypothesis.primaryObjection != null &&
        hypothesis.primaryObjection.length > 0,
      detail: hypothesis.primaryTrigger && hypothesis.awarenessLevel && hypothesis.emotionalState && hypothesis.primaryObjection
        ? 'All inputs available for trigger-driven copy generation'
        : 'Missing fields — cannot generate psychology-driven copy without complete state',
    },
  ];

  const passCount = items.filter((i) => i.passed).length;

  return {
    items,
    overallPass: passCount === items.length,
    passCount,
    totalCount: items.length,
  };
}
