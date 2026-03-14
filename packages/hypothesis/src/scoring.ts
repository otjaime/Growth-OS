import { TRIGGER_LIBRARY } from './triggers.js';

type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// Minimal PrismaClient interface — just the methods we actually call.
// This avoids a hard dependency on the full PrismaClient type at compile time
// while still being compatible at runtime.
interface HypothesisDbClient {
  campaignHypothesis: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      clientId: string;
      status: string;
      trigger: string;
      awarenessLevel: string;
      actualROAS: number | null;
      expectedROAS: number;
    } | null>;
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }) => Promise<Array<{
      status: string;
      actualROAS: number | null;
      expectedROAS: number;
    }>>;
  };
  client: {
    findUnique: (args: { where: { id: string } }) => Promise<{ vertical: string } | null>;
  };
  triggerScore: {
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
    }) => Promise<Array<{
      trigger: string;
      winRate: number;
      confidenceLevel: string;
      sampleSize: number;
    }>>;
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

/**
 * Determine confidence level based on sample size.
 * LOW: < 15, MEDIUM: 15-30, HIGH: > 30
 */
export function getConfidenceLevel(sampleSize: number): ConfidenceLevel {
  if (sampleSize < 15) return 'LOW';
  if (sampleSize <= 30) return 'MEDIUM';
  return 'HIGH';
}

export interface TriggerScoreUpdate {
  readonly trigger: string;
  readonly vertical: string;
  readonly awarenessLevel: string;
  readonly sampleSize: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly avgROASDelta: number;
  readonly confidenceLevel: ConfidenceLevel;
}

/**
 * After closing a hypothesis (WINNER/LOSER/INCONCLUSIVE), update the TriggerScore table
 * with accumulated empirical data for the trigger x vertical x awareness combination.
 */
export async function updateTriggerScore(
  hypothesisId: string,
  db: HypothesisDbClient
): Promise<TriggerScoreUpdate | null> {
  // Fetch the closed hypothesis
  const hypothesis = await db.campaignHypothesis.findUnique({
    where: { id: hypothesisId },
  });

  if (!hypothesis) {
    throw new Error(`Hypothesis ${hypothesisId} not found.`);
  }

  const closedStatuses = ['WINNER', 'LOSER', 'INCONCLUSIVE'];
  if (!closedStatuses.includes(hypothesis.status)) {
    throw new Error(
      `Hypothesis ${hypothesisId} is not closed (status: ${hypothesis.status}). Cannot update trigger score.`
    );
  }

  const { trigger, awarenessLevel } = hypothesis;

  // Look up the client to get vertical
  const client = await db.client.findUnique({
    where: { id: hypothesis.clientId },
  });

  if (!client) {
    throw new Error(`Client ${hypothesis.clientId} not found.`);
  }

  const vertical = client.vertical;

  // Count all closed hypotheses for this trigger x vertical x awareness
  const allClosed = await db.campaignHypothesis.findMany({
    where: {
      trigger,
      awarenessLevel,
      client: { vertical },
      status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] },
    },
    select: {
      status: true,
      actualROAS: true,
      expectedROAS: true,
    },
  });

  const wins = allClosed.filter((h) => h.status === 'WINNER').length;
  const losses = allClosed.filter((h) => h.status === 'LOSER').length;
  const sampleSize = allClosed.length;
  const winRate = sampleSize > 0 ? wins / sampleSize : 0;

  // Average ROAS delta (actual - expected) for hypotheses with both values
  const withDelta = allClosed.filter(
    (h) => h.actualROAS !== null && h.expectedROAS !== null
  );
  const avgROASDelta =
    withDelta.length > 0
      ? withDelta.reduce((sum: number, h) => sum + ((h.actualROAS ?? 0) - h.expectedROAS), 0) / withDelta.length
      : 0;

  const confidenceLevel = getConfidenceLevel(sampleSize);

  // Upsert the TriggerScore record
  await db.triggerScore.upsert({
    where: {
      trigger_vertical_awarenessLevel: {
        trigger,
        vertical,
        awarenessLevel,
      },
    },
    create: {
      trigger,
      vertical,
      awarenessLevel,
      sampleSize,
      wins,
      losses,
      winRate: Math.round(winRate * 10000) / 10000,
      avgROASDelta: Math.round(avgROASDelta * 100) / 100,
      confidenceLevel,
    },
    update: {
      sampleSize,
      wins,
      losses,
      winRate: Math.round(winRate * 10000) / 10000,
      avgROASDelta: Math.round(avgROASDelta * 100) / 100,
      confidenceLevel,
    },
  });

  return {
    trigger,
    vertical,
    awarenessLevel,
    sampleSize,
    wins,
    losses,
    winRate: Math.round(winRate * 10000) / 10000,
    avgROASDelta: Math.round(avgROASDelta * 100) / 100,
    confidenceLevel,
  };
}

export interface TriggerRecommendation {
  readonly trigger: string;
  readonly winRate: number;
  readonly confidence: string;
  readonly sampleSize: number;
}

/**
 * Get trigger recommendations for a given vertical, awareness level, and funnel stage.
 * Returns triggers sorted by win rate descending.
 * Falls back to TRIGGER_LIBRARY when no empirical data exists.
 */
export async function getTriggerRecommendation(params: {
  vertical: string;
  awarenessLevel: string;
  funnelStage: string;
  db: HypothesisDbClient;
}): Promise<readonly TriggerRecommendation[]> {
  const { vertical, awarenessLevel, funnelStage, db } = params;

  // Query empirical data from TriggerScore table
  const empiricalScores = await db.triggerScore.findMany({
    where: {
      vertical,
      awarenessLevel,
    },
    orderBy: { winRate: 'desc' },
  });

  // Filter empirical scores to triggers that match the funnel stage in TRIGGER_LIBRARY
  const empiricalResults: TriggerRecommendation[] = [];
  const coveredTriggers = new Set<string>();

  for (const score of empiricalScores) {
    const def = TRIGGER_LIBRARY[score.trigger];
    if (def && def.bestFor.funnelStages.includes(funnelStage)) {
      empiricalResults.push({
        trigger: score.trigger,
        winRate: score.winRate,
        confidence: score.confidenceLevel,
        sampleSize: score.sampleSize,
      });
      coveredTriggers.add(score.trigger);
    }
  }

  // Fill in triggers from TRIGGER_LIBRARY that have no empirical data
  const libraryFallbacks: TriggerRecommendation[] = [];
  for (const [triggerId, def] of Object.entries(TRIGGER_LIBRARY)) {
    if (coveredTriggers.has(triggerId)) continue;

    const matchesAwareness = def.bestFor.awarenessLevels.includes(awarenessLevel);
    const matchesFunnel = def.bestFor.funnelStages.includes(funnelStage);
    const matchesVertical =
      def.bestFor.verticals.includes(vertical) || def.bestFor.verticals.includes('OTHER');

    if (matchesAwareness && matchesFunnel && matchesVertical) {
      libraryFallbacks.push({
        trigger: triggerId,
        winRate: 0.5, // Default prior
        confidence: 'LOW',
        sampleSize: 0,
      });
    }
  }

  // Empirical results first (sorted by win rate), then library fallbacks
  return [...empiricalResults, ...libraryFallbacks];
}
