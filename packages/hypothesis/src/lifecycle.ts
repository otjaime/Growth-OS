import type { CampaignHypothesis } from '@growth-os/database';

// Use string literal type matching the Prisma enum to keep this module decoupled
type HypothesisStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'LIVE'
  | 'PAUSED_BY_SYSTEM'
  | 'PAUSED_BY_USER'
  | 'WINNER'
  | 'LOSER'
  | 'INCONCLUSIVE';

export interface StatusTransition {
  readonly from: HypothesisStatus;
  readonly to: HypothesisStatus;
  readonly requiredFields: readonly string[];
  readonly guard?: (h: CampaignHypothesis) => { valid: boolean; reason?: string };
}

const MIN_LESSON_LENGTH = 50;
const MIN_FALSIFICATION_LENGTH = 30;

function hasField(h: CampaignHypothesis, field: string): boolean {
  const value = (h as Record<string, unknown>)[field];
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim().length === 0) return false;
  return true;
}

function guardDraftToApproved(h: CampaignHypothesis): { valid: boolean; reason?: string } {
  const falsification = (h as Record<string, unknown>)['falsificationCondition'];
  if (typeof falsification === 'string' && falsification.trim().length < MIN_FALSIFICATION_LENGTH) {
    return {
      valid: false,
      reason: `falsificationCondition must be at least ${MIN_FALSIFICATION_LENGTH} characters (got ${falsification.trim().length}).`,
    };
  }
  return { valid: true };
}

function guardToWinnerOrLoser(h: CampaignHypothesis): { valid: boolean; reason?: string } {
  const lesson = (h as Record<string, unknown>)['lesson'];
  if (typeof lesson === 'string' && lesson.trim().length < MIN_LESSON_LENGTH) {
    return {
      valid: false,
      reason: `lesson must be at least ${MIN_LESSON_LENGTH} characters (got ${lesson.trim().length}).`,
    };
  }
  if (!lesson || (typeof lesson === 'string' && lesson.trim().length === 0)) {
    return {
      valid: false,
      reason: `lesson is required and must be at least ${MIN_LESSON_LENGTH} characters.`,
    };
  }
  return { valid: true };
}

export const VALID_TRANSITIONS: readonly StatusTransition[] = [
  // DRAFT → APPROVED
  {
    from: 'DRAFT',
    to: 'APPROVED',
    requiredFields: [
      'title',
      'trigger',
      'triggerMechanism',
      'awarenessLevel',
      'audience',
      'funnelStage',
      'creativeAngle',
      'copyHook',
      'primaryEmotion',
      'primaryObjection',
      'falsificationCondition',
      'expectedROAS',
      'expectedCTR',
      'expectedCVR',
      'conviction',
      'budgetUSD',
      'durationDays',
    ],
    guard: guardDraftToApproved,
  },

  // APPROVED → LIVE
  {
    from: 'APPROVED',
    to: 'LIVE',
    requiredFields: ['metaCampaignId'],
  },

  // LIVE → PAUSED_BY_SYSTEM (system action, no required fields)
  {
    from: 'LIVE',
    to: 'PAUSED_BY_SYSTEM',
    requiredFields: [],
  },

  // LIVE → PAUSED_BY_USER
  {
    from: 'LIVE',
    to: 'PAUSED_BY_USER',
    requiredFields: [],
  },

  // PAUSED_BY_SYSTEM → LIVE (resume)
  {
    from: 'PAUSED_BY_SYSTEM',
    to: 'LIVE',
    requiredFields: [],
  },

  // LIVE → WINNER
  {
    from: 'LIVE',
    to: 'WINNER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // LIVE → LOSER
  {
    from: 'LIVE',
    to: 'LOSER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // LIVE → INCONCLUSIVE
  {
    from: 'LIVE',
    to: 'INCONCLUSIVE',
    requiredFields: ['lesson'],
  },

  // PAUSED_BY_SYSTEM → WINNER
  {
    from: 'PAUSED_BY_SYSTEM',
    to: 'WINNER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // PAUSED_BY_SYSTEM → LOSER
  {
    from: 'PAUSED_BY_SYSTEM',
    to: 'LOSER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // PAUSED_BY_SYSTEM → INCONCLUSIVE
  {
    from: 'PAUSED_BY_SYSTEM',
    to: 'INCONCLUSIVE',
    requiredFields: ['lesson'],
  },

  // PAUSED_BY_USER → WINNER
  {
    from: 'PAUSED_BY_USER',
    to: 'WINNER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // PAUSED_BY_USER → LOSER
  {
    from: 'PAUSED_BY_USER',
    to: 'LOSER',
    requiredFields: ['actualROAS', 'actualCTR', 'lesson', 'triggerEffective'],
    guard: guardToWinnerOrLoser,
  },

  // PAUSED_BY_USER → INCONCLUSIVE
  {
    from: 'PAUSED_BY_USER',
    to: 'INCONCLUSIVE',
    requiredFields: ['lesson'],
  },
];

/**
 * Check whether a hypothesis can transition to the given status.
 * Validates the transition exists, required fields are present, and guards pass.
 */
export function canTransition(
  hypothesis: CampaignHypothesis,
  to: HypothesisStatus
): { valid: boolean; reason?: string } {
  const currentStatus = hypothesis.status as HypothesisStatus;

  const transition = VALID_TRANSITIONS.find((t) => t.from === currentStatus && t.to === to);

  if (!transition) {
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${to}. No such transition exists.`,
    };
  }

  // Check required fields
  for (const field of transition.requiredFields) {
    if (!hasField(hypothesis, field)) {
      return {
        valid: false,
        reason: `Missing required field "${field}" for transition ${currentStatus} → ${to}.`,
      };
    }
  }

  // Run guard if present
  if (transition.guard) {
    const guardResult = transition.guard(hypothesis);
    if (!guardResult.valid) {
      return guardResult;
    }
  }

  return { valid: true };
}

/**
 * Apply a status transition to a hypothesis, returning a new object with the updated status.
 * Throws if the transition is invalid.
 */
export function applyTransition(
  hypothesis: CampaignHypothesis,
  to: HypothesisStatus
): CampaignHypothesis {
  const check = canTransition(hypothesis, to);
  if (!check.valid) {
    throw new Error(`Cannot transition hypothesis "${hypothesis.id}": ${check.reason}`);
  }

  const now = new Date();
  const updates: Partial<CampaignHypothesis> = { status: to as CampaignHypothesis['status'] };

  if (to === 'LIVE' && hypothesis.status === 'APPROVED') {
    updates.launchedAt = now;
  }

  if (to === 'WINNER' || to === 'LOSER' || to === 'INCONCLUSIVE') {
    updates.closedAt = now;
  }

  return { ...hypothesis, ...updates, updatedAt: now };
}
