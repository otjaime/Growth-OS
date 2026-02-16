// ──────────────────────────────────────────────────────────────
// Growth OS — AI Suggestions Routes
// Signal detection, opportunity classification, suggestion CRUD
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma, isDemoMode } from '@growth-os/database';
import { subDays } from 'date-fns';
import { detectSignals, classifyOpportunities } from '@growth-os/etl';
import type { SignalInput } from '@growth-os/etl';
import * as kpiCalcs from '@growth-os/etl';
import { isAIConfigured } from '../lib/ai.js';
import { generateSuggestionsForOpportunity, getDemoSuggestions } from '../lib/suggestions.js';
import { gatherWeekOverWeekData } from '../lib/gather-metrics.js';

function computeRice(reach?: number | null, impact?: number | null, confidence?: number | null, effort?: number | null): number | null {
  if (reach == null || impact == null || confidence == null || effort == null) return null;
  if (effort === 0) return null;
  return Math.round(((reach * impact * confidence) / effort) * 100) / 100;
}

export async function suggestionsRoutes(app: FastifyInstance) {
  // ── POST /signals/detect — run signal detection ─────────────
  app.post('/signals/detect', {
    schema: {
      tags: ['suggestions'],
      summary: 'Detect signals',
      description: 'Run signal detection from current KPIs and alerts. Returns ephemeral signal list.',
    },
  }, async () => {
    const wow = await gatherWeekOverWeekData();

    const signalInput: SignalInput = {
      ...wow.alertInput,
      currentAOV: wow.currentAOV,
      previousAOV: wow.previousAOV,
      currentSessions: wow.currentSessions,
      previousSessions: wow.previousSessions,
      funnelCurrent: wow.funnelCurrent ? kpiCalcs.kpis.funnelCvr(wow.funnelCurrent) : undefined,
      funnelPrevious: wow.funnelPrevious ? kpiCalcs.kpis.funnelCvr(wow.funnelPrevious) : undefined,
    };

    const signals = detectSignals(signalInput);
    return { signals, evaluatedAt: new Date().toISOString() };
  });

  // ── GET /opportunities — list persisted opportunities ────────
  app.get('/opportunities', {
    schema: {
      tags: ['suggestions'],
      summary: 'List opportunities',
      description: 'Returns all opportunities with their suggestions.',
    },
  }, async (req) => {
    const { status } = req.query as { status?: string };
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const opportunities = await prisma.opportunity.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        suggestions: {
          orderBy: { createdAt: 'desc' },
          include: { feedback: true },
        },
      },
    });

    return { opportunities, total: opportunities.length };
  });

  // ── POST /opportunities/generate — detect + classify + generate ──
  app.post('/opportunities/generate', {
    schema: {
      tags: ['suggestions'],
      summary: 'Generate opportunities and suggestions',
      description: 'Detects signals, classifies into opportunities, and generates experiment suggestions via AI or demo fallback.',
    },
  }, async () => {
    // 1. Gather metrics
    const wow = await gatherWeekOverWeekData();

    // 2. Detect signals
    const signalInput: SignalInput = {
      ...wow.alertInput,
      currentAOV: wow.currentAOV,
      previousAOV: wow.previousAOV,
      currentSessions: wow.currentSessions,
      previousSessions: wow.previousSessions,
      funnelCurrent: wow.funnelCurrent ? kpiCalcs.kpis.funnelCvr(wow.funnelCurrent) : undefined,
      funnelPrevious: wow.funnelPrevious ? kpiCalcs.kpis.funnelCvr(wow.funnelPrevious) : undefined,
    };
    const signals = detectSignals(signalInput);

    // 3. Classify into opportunities
    const candidates = classifyOpportunities(signals);

    if (candidates.length === 0) {
      // In demo mode, inject pre-built opportunities so the page isn't empty
      const demoMode = await isDemoMode();
      if (demoMode) {
        const demoOpportunities = [
          {
            type: 'EFFICIENCY_DROP' as const,
            title: 'Meta Ads spend efficiency declining',
            description: 'Meta prospecting spend increased 35% in the last 7 days while conversions dropped 50%, causing blended CAC to spike. MER deteriorated from 3.2x to 2.4x.',
            priority: 85,
            signals: [{ type: 'alert', id: 'mer_deterioration', severity: 'warning' }],
          },
          {
            type: 'FUNNEL_LEAK' as const,
            title: 'Checkout funnel drop detected',
            description: 'Sessions dropped 22% and checkout completion rate fell 35% in the last 7 days. The add-to-cart to checkout step shows the largest drop, suggesting friction in the checkout flow.',
            priority: 70,
            signals: [{ type: 'metric_delta', metric: 'atcToCheckout', change: -0.35 }],
          },
          {
            type: 'QUICK_WIN' as const,
            title: 'Retargeting ROAS exceeds prospecting 4:1',
            description: 'Retargeting campaigns show 4x higher ROAS than prospecting. Shifting 15% of prospecting budget to retargeting could improve blended CAC by ~20%.',
            priority: 60,
            signals: [{ type: 'channel_efficiency', channel: 'meta', metric: 'roas_gap' }],
          },
        ];

        const createdOpps = [];
        let totalSuggestions = 0;

        for (const demo of demoOpportunities) {
          const cutoff = subDays(new Date(), 1);
          const existing = await prisma.opportunity.findFirst({
            where: { type: demo.type as never, createdAt: { gte: cutoff } },
            include: { suggestions: true },
          });

          if (existing) {
            createdOpps.push(existing);
            continue;
          }

          const opp = await prisma.opportunity.create({
            data: {
              type: demo.type as never,
              title: demo.title,
              description: demo.description,
              priority: demo.priority,
              signalsJson: demo.signals as unknown as never,
            },
          });

          const suggestions = getDemoSuggestions(demo.type);
          for (const sd of suggestions) {
            await prisma.suggestion.create({
              data: {
                opportunityId: opp.id,
                type: 'RULE_BASED',
                title: sd.title,
                hypothesis: sd.hypothesis,
                suggestedChannel: sd.channel,
                suggestedMetric: sd.metric,
                suggestedTargetLift: sd.targetLift,
                impactScore: sd.impact,
                confidenceScore: sd.confidence,
                effortScore: sd.effort,
                riskScore: sd.risk,
                reasoning: sd.reasoning,
              },
            });
            totalSuggestions++;
          }

          const full = await prisma.opportunity.findUnique({
            where: { id: opp.id },
            include: { suggestions: { include: { feedback: true } } },
          });
          if (full) createdOpps.push(full);
        }

        return {
          opportunities: createdOpps,
          signalsDetected: 0,
          opportunitiesCreated: createdOpps.length,
          suggestionsGenerated: totalSuggestions,
          aiEnabled: isAIConfigured(),
          demoGenerated: true,
        };
      }

      return {
        opportunities: [],
        signalsDetected: signals.length,
        opportunitiesCreated: 0,
        suggestionsGenerated: 0,
        aiEnabled: isAIConfigured(),
      };
    }

    // 4. Fetch playbook (completed experiments with learnings)
    const playbook = await prisma.experiment.findMany({
      where: { status: 'COMPLETED', learnings: { not: null } },
      select: { name: true, channel: true, result: true, learnings: true, nextSteps: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // 5. For each opportunity: upsert + generate suggestions
    const aiEnabled = isAIConfigured();
    const createdOpportunities = [];
    let totalSuggestions = 0;

    for (const candidate of candidates) {
      // Dedup: check if same type opportunity exists from last 24h
      const cutoff = subDays(new Date(), 1);
      const existing = await prisma.opportunity.findFirst({
        where: {
          type: candidate.type as never,
          createdAt: { gte: cutoff },
        },
        include: { suggestions: true },
      });

      let opportunity;
      if (existing) {
        // Update existing opportunity
        opportunity = await prisma.opportunity.update({
          where: { id: existing.id },
          data: {
            title: candidate.title,
            description: candidate.description,
            priority: candidate.priority,
            signalsJson: candidate.signals as unknown as never,
            status: 'NEW',
          },
          include: { suggestions: { include: { feedback: true } } },
        });
      } else {
        // Create new opportunity
        opportunity = await prisma.opportunity.create({
          data: {
            type: candidate.type as never,
            title: candidate.title,
            description: candidate.description,
            priority: candidate.priority,
            signalsJson: candidate.signals as unknown as never,
          },
          include: { suggestions: { include: { feedback: true } } },
        });
      }

      // Generate suggestions (skip if existing opportunity already has suggestions)
      if (!existing || existing.suggestions.length === 0) {
        let suggestionDataList;
        if (aiEnabled) {
          try {
            suggestionDataList = await generateSuggestionsForOpportunity(
              { type: candidate.type, title: candidate.title, description: candidate.description, signals: candidate.signals },
              wow.kpiContext,
              playbook,
            );
          } catch {
            // Fallback to demo suggestions on AI error
            suggestionDataList = getDemoSuggestions(candidate.type);
          }
        } else {
          suggestionDataList = getDemoSuggestions(candidate.type);
        }

        // Persist suggestions
        for (const sd of suggestionDataList) {
          await prisma.suggestion.create({
            data: {
              opportunityId: opportunity.id,
              type: aiEnabled ? 'AI_GENERATED' : 'RULE_BASED',
              title: sd.title,
              hypothesis: sd.hypothesis,
              suggestedChannel: sd.channel,
              suggestedMetric: sd.metric,
              suggestedTargetLift: sd.targetLift,
              impactScore: sd.impact,
              confidenceScore: sd.confidence,
              effortScore: sd.effort,
              riskScore: sd.risk,
              reasoning: sd.reasoning,
            },
          });
          totalSuggestions++;
        }

        // Re-fetch with suggestions
        opportunity = await prisma.opportunity.findUnique({
          where: { id: opportunity.id },
          include: { suggestions: { include: { feedback: true } } },
        });
      }

      if (opportunity) createdOpportunities.push(opportunity);
    }

    return {
      opportunities: createdOpportunities,
      signalsDetected: signals.length,
      opportunitiesCreated: createdOpportunities.length,
      suggestionsGenerated: totalSuggestions,
      aiEnabled,
    };
  });

  // ── GET /suggestions — list suggestions ─────────────────────
  app.get('/suggestions', {
    schema: {
      tags: ['suggestions'],
      summary: 'List suggestions',
      description: 'Returns all suggestions with optional status and opportunity filters.',
    },
  }, async (req) => {
    const { status, opportunityId } = req.query as { status?: string; opportunityId?: string };
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (opportunityId) where.opportunityId = opportunityId;

    const suggestions = await prisma.suggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: { select: { id: true, type: true, title: true } },
        feedback: true,
      },
    });

    return { suggestions, total: suggestions.length };
  });

  // ── POST /suggestions/:id/feedback — approve/reject/modify ──
  app.post('/suggestions/:id/feedback', {
    schema: {
      tags: ['suggestions'],
      summary: 'Record suggestion feedback',
      description: 'Approve, reject, or modify a suggestion.',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { action: string; notes?: string };

    if (!body.action || !['approve', 'reject', 'modify'].includes(body.action.toLowerCase())) {
      reply.status(400);
      return { error: 'action must be one of: approve, reject, modify' };
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id } });
    if (!suggestion) {
      reply.status(404);
      return { error: 'Suggestion not found' };
    }

    const action = body.action.toUpperCase() as 'APPROVE' | 'REJECT' | 'MODIFY';

    // Update suggestion status
    const statusMap: Record<string, string> = {
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      MODIFY: 'PENDING',
    };

    const [updated, feedback] = await Promise.all([
      prisma.suggestion.update({
        where: { id },
        data: { status: statusMap[action] as never },
      }),
      prisma.suggestionFeedback.create({
        data: {
          suggestionId: id,
          action: action as never,
          notes: body.notes ?? null,
        },
      }),
    ]);

    // If this is a review action, mark the opportunity as REVIEWED
    if (action === 'APPROVE' || action === 'REJECT') {
      await prisma.opportunity.update({
        where: { id: suggestion.opportunityId },
        data: { status: 'REVIEWED' },
      });
    }

    return { suggestion: updated, feedback };
  });

  // ── POST /suggestions/:id/promote — create Experiment ───────
  app.post('/suggestions/:id/promote', {
    schema: {
      tags: ['suggestions'],
      summary: 'Promote suggestion to experiment',
      description: 'Creates a new Experiment from a suggestion and links it via feedback.',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { notes?: string } | null) ?? {};

    const suggestion = await prisma.suggestion.findUnique({
      where: { id },
      include: { opportunity: true },
    });

    if (!suggestion) {
      reply.status(404);
      return { error: 'Suggestion not found' };
    }

    // Create experiment from suggestion
    // Suggestion has no reachScore — user fills it in after promotion
    const reach = null;
    const impact = suggestion.impactScore;
    const confidence = suggestion.confidenceScore;
    const effort = suggestion.effortScore;
    const riceScore = computeRice(reach, impact, confidence, effort);

    const experiment = await prisma.experiment.create({
      data: {
        name: suggestion.title,
        hypothesis: suggestion.hypothesis,
        status: 'IDEA',
        channel: suggestion.suggestedChannel,
        primaryMetric: suggestion.suggestedMetric ?? 'conversion_rate',
        targetLift: suggestion.suggestedTargetLift,
        reach,
        impact,
        confidence,
        effort,
        riceScore,
      },
    });

    // Update suggestion status
    await prisma.suggestion.update({
      where: { id },
      data: { status: 'PROMOTED' },
    });

    // Create feedback record
    const feedback = await prisma.suggestionFeedback.create({
      data: {
        suggestionId: id,
        action: 'PROMOTE',
        notes: body.notes ?? null,
        promotedExperimentId: experiment.id,
      },
    });

    // Update opportunity status
    await prisma.opportunity.update({
      where: { id: suggestion.opportunityId },
      data: { status: 'ACTED' },
    });

    return { experiment, suggestion: { ...suggestion, status: 'PROMOTED' }, feedback };
  });
}
