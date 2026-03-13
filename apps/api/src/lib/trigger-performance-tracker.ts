// ──────────────────────────────────────────────────────────────
// Growth OS — Trigger Performance Tracker
// Records hypothesis outcomes and updates the empirical trigger
// performance library. Over time, the theoretical matrix gets
// overridden by real data.
// Implements Phase 6 of the Psychology Layer plan.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import type { PsychTrigger, AwarenessLevel, FunnelStage } from '@growth-os/etl';

// ── Interfaces ───────────────────────────────────────────────

export interface CloseHypothesisInput {
  /** The PsychHypothesis record ID. */
  readonly hypothesisId: string;
  /** Organization ID for multi-tenancy. */
  readonly organizationId: string;
  /** Outcome of the test. */
  readonly outcome: 'WIN' | 'LOSS' | 'INCONCLUSIVE';
  /** ROAS delta (positive = improvement). */
  readonly roasDelta?: number;
  /** CTR delta (positive = improvement). */
  readonly ctrDelta?: number;
  /** Structured post-mortem. */
  readonly postMortem: PostMortem;
}

export interface PostMortem {
  /** Was the awareness level assumption correct? */
  readonly wasAwarenessCorrect: boolean;
  /** Did the trigger mechanism actually activate in the creative? */
  readonly didTriggerActivate: boolean;
  /** Why the ad worked or failed — the real learning. */
  readonly whyWorkedOrFailed: string;
  /** Vertical-specific insight. */
  readonly verticalLearning: string;
}

export interface CloseHypothesisResult {
  readonly success: boolean;
  readonly error?: string;
  /** Updated confidence level for the trigger-vertical-awareness combo. */
  readonly newConfidenceLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Updated sample size. */
  readonly newSampleSize?: number;
}

// ── Core Function ────────────────────────────────────────────

/**
 * Close a hypothesis with an outcome and update the trigger
 * performance library.
 *
 * Steps:
 * 1. Validate and load the PsychHypothesis
 * 2. Update hypothesis outcome + postMortem + closedAt
 * 3. Upsert TriggerPerformanceRecord — increment sampleSize,
 *    update rolling averages
 * 4. Recompute confidence level
 * 5. On LOSS: append to commonFailurePattern
 * 6. On WIN: append to bestImplementationPattern
 */
export async function closeHypothesis(
  input: CloseHypothesisInput,
): Promise<CloseHypothesisResult> {
  // 1. Load hypothesis
  const hypothesis = await prisma.psychHypothesis.findFirst({
    where: {
      id: input.hypothesisId,
      organizationId: input.organizationId,
    },
  });

  if (!hypothesis) {
    return { success: false, error: 'Hypothesis not found' };
  }

  if (hypothesis.outcome != null) {
    return { success: false, error: 'Hypothesis already closed' };
  }

  if (!hypothesis.primaryTrigger || !hypothesis.awarenessLevel) {
    return { success: false, error: 'Hypothesis missing required trigger/awareness data' };
  }

  const trigger = hypothesis.primaryTrigger as PsychTrigger;
  const awarenessLevel = hypothesis.awarenessLevel as AwarenessLevel;
  const funnelStage = (hypothesis.funnelStage ?? 'TOFU') as FunnelStage;
  const vertical = hypothesis.vertical ?? 'default';

  // Steps 2+3 in a transaction to prevent partial updates
  return prisma.$transaction(async (tx) => {
    // 2. Update hypothesis
    await tx.psychHypothesis.update({
      where: { id: input.hypothesisId },
      data: {
        outcome: input.outcome,
        postMortem: input.postMortem as unknown as Parameters<typeof prisma.psychHypothesis.update>[0]['data']['postMortem'],
        closedAt: new Date(),
      },
    });

    // 3. Upsert TriggerPerformanceRecord
    const existingRecord = await tx.triggerPerformanceRecord.findFirst({
      where: {
        organizationId: input.organizationId,
        trigger,
        vertical,
        awarenessLevel,
        funnelStage,
      },
    });

    let newSampleSize: number;
    let newWinRate: number;
    let newAvgRoasDelta: number;
    let newAvgCtrDelta: number;

    if (existingRecord) {
      newSampleSize = existingRecord.sampleSize + 1;

      // Incremental rolling average
      const wins = Math.round(Number(existingRecord.winRate) * existingRecord.sampleSize);
      const newWins = input.outcome === 'WIN' ? wins + 1 : wins;
      newWinRate = newWins / newSampleSize;

      // Rolling average for deltas
      newAvgRoasDelta = incrementalAvg(
        Number(existingRecord.avgRoasDelta),
        existingRecord.sampleSize,
        input.roasDelta ?? 0,
      );
      newAvgCtrDelta = incrementalAvg(
        Number(existingRecord.avgCtrDelta),
        existingRecord.sampleSize,
        input.ctrDelta ?? 0,
      );

      // Update failure/success patterns
      const failurePattern = existingRecord.commonFailurePattern ?? '';
      const successPattern = existingRecord.bestImplementationPattern ?? '';

      const updatedFailure = input.outcome === 'LOSS'
        ? appendPattern(failurePattern, input.postMortem.whyWorkedOrFailed)
        : failurePattern;

      const updatedSuccess = input.outcome === 'WIN'
        ? appendPattern(successPattern, input.postMortem.whyWorkedOrFailed)
        : successPattern;

      const confidenceLevel = computeConfidence(newSampleSize);

      await tx.triggerPerformanceRecord.update({
        where: { id: existingRecord.id },
        data: {
          sampleSize: newSampleSize,
          winRate: newWinRate,
          avgRoasDelta: newAvgRoasDelta,
          avgCtrDelta: newAvgCtrDelta,
          commonFailurePattern: updatedFailure || null,
          bestImplementationPattern: updatedSuccess || null,
          confidenceLevel,
        },
      });

      return {
        success: true as const,
        newConfidenceLevel: confidenceLevel,
        newSampleSize,
      };
    }

    // New record
    newSampleSize = 1;
    newWinRate = input.outcome === 'WIN' ? 1 : 0;
    newAvgRoasDelta = input.roasDelta ?? 0;
    newAvgCtrDelta = input.ctrDelta ?? 0;
    const confidenceLevel = computeConfidence(newSampleSize);

    await tx.triggerPerformanceRecord.create({
      data: {
        organizationId: input.organizationId,
        trigger,
        vertical,
        awarenessLevel,
        funnelStage,
        sampleSize: newSampleSize,
        winRate: newWinRate,
        avgRoasDelta: newAvgRoasDelta,
        avgCtrDelta: newAvgCtrDelta,
        commonFailurePattern: input.outcome === 'LOSS' ? input.postMortem.whyWorkedOrFailed : null,
        bestImplementationPattern: input.outcome === 'WIN' ? input.postMortem.whyWorkedOrFailed : null,
        confidenceLevel,
      },
    });

    return {
      success: true as const,
      newConfidenceLevel: confidenceLevel,
      newSampleSize,
    };
  }, { timeout: 30000 });
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Compute incremental rolling average.
 * newAvg = oldAvg + (newValue - oldAvg) / newCount
 */
function incrementalAvg(
  oldAvg: number,
  oldCount: number,
  newValue: number,
): number {
  if (oldCount === 0) return newValue;
  return oldAvg + (newValue - oldAvg) / (oldCount + 1);
}

/**
 * Confidence level based on sample size.
 * <10 → LOW, 10-29 → MEDIUM, ≥30 → HIGH
 */
function computeConfidence(sampleSize: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (sampleSize >= 30) return 'HIGH';
  if (sampleSize >= 10) return 'MEDIUM';
  return 'LOW';
}

/**
 * Append a learning to a pattern string (newline-separated).
 * Keeps last 10 entries to avoid unbounded growth.
 */
function appendPattern(existing: string, newEntry: string): string {
  if (!newEntry || newEntry.trim().length === 0) return existing;

  const entries = existing
    ? existing.split('\n---\n').filter((e) => e.trim().length > 0)
    : [];

  entries.push(`[${new Date().toISOString().slice(0, 10)}] ${newEntry.trim()}`);

  // Keep last 10
  const trimmed = entries.slice(-10);
  return trimmed.join('\n---\n');
}
