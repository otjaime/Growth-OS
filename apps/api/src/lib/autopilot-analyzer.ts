// ──────────────────────────────────────────────────────────────
// Growth OS — AI Diagnosis Analyzer
// Generates multi-level (ad / ad-set / campaign) insights for
// each autopilot diagnosis. Uses getClient() from ai.ts — never
// creates its own OpenAI instance.
// Falls back to rule-based insights when AI is not configured.
// ──────────────────────────────────────────────────────────────

import { getClient, isAIConfigured, AI_MODEL } from './ai.js';

// ── Input / Output interfaces ────────────────────────────────

export interface DiagnosisAnalyzerInput {
  // Diagnosis context
  ruleId: string;
  severity: string;
  title: string;
  message: string;
  actionType: string;
  suggestedValue: Record<string, unknown> | null;
  // Ad data
  adName: string;
  adStatus: string;
  creativeType: string | null;
  headline: string | null;
  primaryText: string | null;
  callToAction: string | null;
  // 7d metrics
  spend7d: number;
  impressions7d: number;
  clicks7d: number;
  conversions7d: number;
  revenue7d: number;
  roas7d: number | null;
  ctr7d: number | null;
  cpc7d: number | null;
  frequency7d: number | null;
  // 14d metrics (for trend)
  spend14d: number;
  roas14d: number | null;
  ctr14d: number | null;
  frequency14d: number | null;
  // Campaign / AdSet context
  campaignName: string;
  campaignObjective: string | null;
  adSetName: string;
  adSetDailyBudget: number | null;
  // Sibling ads in the same ad set
  siblingAds: readonly SiblingAd[];
}

export interface SiblingAd {
  name: string;
  status: string;
  spend7d: number;
  roas7d: number | null;
  ctr7d: number | null;
}

interface InsightRecommendation {
  action: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface DiagnosisInsight {
  rootCause: string;
  adRecommendation: InsightRecommendation;
  adSetRecommendation: InsightRecommendation;
  campaignRecommendation: InsightRecommendation;
  estimatedImpact: string;
}

// ── System prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior Meta Ads performance strategist specializing in DTC ecommerce brands.

Given a diagnosis about an underperforming or noteworthy Meta ad, provide a structured analysis with specific, actionable recommendations at three levels: ad, ad-set, and campaign.

Rules:
- Use the ACTUAL numbers provided — never invent data.
- Reference sibling ads for context when relevant (e.g., "The other active ad in this ad set has 3.2x ROAS vs this ad's 0.4x").
- Each recommendation must be a CONCRETE action, not generic advice like "optimize your targeting".
- Include specific numbers in recommendations (e.g., "Reduce daily budget from $50 to $25" not "Reduce budget").
- Estimated impact should be a realistic dollar figure or performance range based on the data.
- Priority: high = do it today, medium = this week, low = nice to have.
- Keep each field concise: rootCause ≤2 sentences, each action ≤15 words, each detail ≤2 sentences.
- Output ONLY valid JSON. No markdown, no code fences, no explanation.

JSON schema:
{
  "rootCause": "string",
  "adRecommendation": { "action": "string", "detail": "string", "priority": "high|medium|low" },
  "adSetRecommendation": { "action": "string", "detail": "string", "priority": "high|medium|low" },
  "campaignRecommendation": { "action": "string", "detail": "string", "priority": "high|medium|low" },
  "estimatedImpact": "string"
}`;

// ── AI-powered insight generation ────────────────────────────

export async function generateDiagnosisInsight(input: DiagnosisAnalyzerInput): Promise<DiagnosisInsight> {
  if (!isAIConfigured()) {
    throw new Error('AI is not configured — set OPENAI_API_KEY to generate diagnosis insights');
  }

  const ai = getClient();

  const metricsBlock = [
    `Spend (7d): $${input.spend7d.toFixed(0)}`,
    `Spend (14d): $${input.spend14d.toFixed(0)}`,
    input.roas7d !== null ? `ROAS (7d): ${input.roas7d.toFixed(2)}x` : null,
    input.roas14d !== null ? `ROAS (14d): ${input.roas14d.toFixed(2)}x` : null,
    input.ctr7d !== null ? `CTR (7d): ${(input.ctr7d * 100).toFixed(2)}%` : null,
    input.ctr14d !== null ? `CTR (14d): ${(input.ctr14d * 100).toFixed(2)}%` : null,
    input.cpc7d !== null ? `CPC: $${input.cpc7d.toFixed(2)}` : null,
    input.frequency7d !== null ? `Frequency (7d): ${input.frequency7d.toFixed(1)}x` : null,
    input.frequency14d !== null ? `Frequency (14d): ${input.frequency14d.toFixed(1)}x` : null,
    `Impressions (7d): ${input.impressions7d.toLocaleString()}`,
    `Clicks (7d): ${input.clicks7d}`,
    `Conversions (7d): ${input.conversions7d}`,
    `Revenue (7d): $${input.revenue7d.toFixed(0)}`,
  ].filter(Boolean).join('\n');

  const siblingBlock = input.siblingAds.length > 0
    ? input.siblingAds.map((s) =>
      `- ${s.name} [${s.status}]: Spend $${s.spend7d.toFixed(0)}, ROAS ${s.roas7d?.toFixed(2) ?? 'N/A'}x, CTR ${s.ctr7d !== null ? (s.ctr7d * 100).toFixed(2) + '%' : 'N/A'}`,
    ).join('\n')
    : '(No other ads in this ad set)';

  const userPrompt = `Diagnosis: [${input.severity}] ${input.title}
Rule: ${input.ruleId}
Message: ${input.message}

Ad: "${input.adName}" [${input.adStatus}]
Creative type: ${input.creativeType ?? 'unknown'}
Headline: ${input.headline ?? '(none)'}
Primary text: ${input.primaryText ?? '(none)'}
CTA: ${input.callToAction ?? '(none)'}

Metrics:
${metricsBlock}

Campaign: "${input.campaignName}" (objective: ${input.campaignObjective ?? 'unknown'})
Ad Set: "${input.adSetName}" (daily budget: $${input.adSetDailyBudget?.toFixed(0) ?? '?'})

Other ads in this ad set:
${siblingBlock}

Analyze this diagnosis and provide structured recommendations as JSON.`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.3,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  return parseInsightResponse(raw);
}

// ── Rule-based fallback (no AI key required) ──────────────────

export function generateRuleBasedInsight(input: DiagnosisAnalyzerInput): DiagnosisInsight {
  const bestSibling = input.siblingAds
    .filter((s) => s.roas7d !== null && s.roas7d > 0)
    .sort((a, b) => (b.roas7d ?? 0) - (a.roas7d ?? 0))[0];

  const siblingContext = bestSibling
    ? ` The best-performing sibling ad "${bestSibling.name}" has ${bestSibling.roas7d?.toFixed(2)}x ROAS.`
    : '';

  switch (input.ruleId) {
    case 'wasted_budget':
      return {
        rootCause: `This ad spent $${input.spend7d.toFixed(0)} in 7 days with only ${input.conversions7d} conversions. The creative or audience targeting is not resonating.${siblingContext}`,
        adRecommendation: {
          action: 'Pause ad and reallocate budget',
          detail: `With $${input.spend7d.toFixed(0)} spent and ${input.conversions7d} conversions, this ad is burning budget. Pause it and redirect spend to better performers.`,
          priority: 'high',
        },
        adSetRecommendation: {
          action: `Reduce daily budget to $${Math.max(10, Math.round((input.adSetDailyBudget ?? 50) * 0.5))}/day`,
          detail: `Current budget of $${input.adSetDailyBudget?.toFixed(0) ?? '?'}/day is too high for this conversion rate. Cut by 50% while testing new creatives.`,
          priority: 'high',
        },
        campaignRecommendation: {
          action: 'Review audience targeting across ad sets',
          detail: 'Multiple non-converting ads suggest the campaign audience may need refinement. Consider narrowing targeting or testing lookalike audiences.',
          priority: 'medium',
        },
        estimatedImpact: `Could save ~$${Math.round(input.spend7d * 0.8)}/week by pausing this ad.`,
      };

    case 'negative_roas':
      return {
        rootCause: `ROAS of ${input.roas7d?.toFixed(2) ?? '0'}x means every dollar spent loses money. With $${input.spend7d.toFixed(0)} spent and only $${input.revenue7d.toFixed(0)} revenue, this ad is actively destroying margin.${siblingContext}`,
        adRecommendation: {
          action: 'Pause immediately to stop losses',
          detail: `This ad is losing $${Math.max(0, input.spend7d - input.revenue7d).toFixed(0)} per week. Immediate pause is the highest-ROI action.`,
          priority: 'high',
        },
        adSetRecommendation: {
          action: 'Shift budget to top-performing ads',
          detail: bestSibling ? `Reallocate budget to "${bestSibling.name}" which has ${bestSibling.roas7d?.toFixed(2)}x ROAS.` : 'Test a new creative variant before investing more in this ad set.',
          priority: 'high',
        },
        campaignRecommendation: {
          action: 'Audit campaign-level cost structure',
          detail: 'Negative ROAS at the ad level often signals broader issues — check if the campaign objective aligns with your conversion goals.',
          priority: 'medium',
        },
        estimatedImpact: `Could recover ~$${Math.max(0, Math.round(input.spend7d - input.revenue7d))}/week in wasted spend.`,
      };

    case 'creative_fatigue':
      return {
        rootCause: `Frequency of ${input.frequency7d?.toFixed(1) ?? '?'}x means your audience has seen this ad ${Math.round((input.frequency7d ?? 4) * (input.impressions7d / (input.clicks7d || 1)))} times on average. CTR dropped as viewers tune out the same creative.${siblingContext}`,
        adRecommendation: {
          action: 'Generate fresh creative variants',
          detail: 'Create 2-3 new creatives with different hooks, angles, or formats. Keep the offer the same but change the visual and copy approach.',
          priority: 'high',
        },
        adSetRecommendation: {
          action: 'Expand audience to reduce frequency',
          detail: `Consider broadening the ad set's audience by 20-30% to reach fresh eyeballs and reduce frequency from ${input.frequency7d?.toFixed(1) ?? '?'}x.`,
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'Implement creative rotation schedule',
          detail: 'Set up a cadence to refresh creatives every 2-3 weeks before fatigue sets in. Track frequency as a leading indicator.',
          priority: 'low',
        },
        estimatedImpact: `Fresh creatives typically recover 15-30% of lost CTR, potentially adding ~$${Math.round(input.revenue7d * 0.2)}/week in revenue.`,
      };

    case 'low_ctr':
      return {
        rootCause: `CTR of ${input.ctr7d !== null ? (input.ctr7d * 100).toFixed(2) : '?'}% is below the 0.8% threshold with ${input.impressions7d.toLocaleString()} impressions — the creative is not grabbing attention in the feed.${siblingContext}`,
        adRecommendation: {
          action: 'Test new hook and visual creative',
          detail: 'The first 3 seconds and headline are critical. Try a bold claim, question, or UGC-style video to increase thumb-stop rate.',
          priority: 'high',
        },
        adSetRecommendation: {
          action: 'Review audience-creative alignment',
          detail: 'Low CTR often means the audience sees content that doesn\'t feel relevant. Ensure ad messaging matches the audience\'s intent stage.',
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'A/B test different creative formats',
          detail: 'If using static images, test video or carousel. Different formats perform differently across placements (Feed vs Stories vs Reels).',
          priority: 'medium',
        },
        estimatedImpact: `Improving CTR to 1.2% could increase clicks by ~${Math.round(input.impressions7d * 0.004)}/week with no extra spend.`,
      };

    case 'click_no_buy':
      return {
        rootCause: `High CTR (${input.ctr7d !== null ? (input.ctr7d * 100).toFixed(2) : '?'}%) but very low conversion rate means the ad promise doesn't match the landing page experience.${siblingContext}`,
        adRecommendation: {
          action: 'Align ad messaging with landing page',
          detail: 'The ad is attracting clicks but the post-click experience disappoints. Ensure the landing page headline and offer match what the ad promises.',
          priority: 'high',
        },
        adSetRecommendation: {
          action: 'Test different destination URLs',
          detail: 'Try sending traffic to a product page instead of homepage, or create a dedicated landing page that continues the ad\'s narrative.',
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'Review campaign objective settings',
          detail: 'If optimizing for link clicks, switch to purchase optimization. Meta will find users more likely to convert, not just click.',
          priority: 'high',
        },
        estimatedImpact: `Converting just ${Math.max(1, Math.round(input.clicks7d * 0.02))} more clicks/week could add ~$${Math.round(input.revenue7d * 0.5)} in revenue.`,
      };

    case 'winner_not_scaled':
      return {
        rootCause: `This ad has ${input.roas7d?.toFixed(2) ?? '?'}x ROAS with low frequency (${input.frequency7d?.toFixed(1) ?? '?'}x), indicating significant headroom to scale without audience saturation.${siblingContext}`,
        adRecommendation: {
          action: 'Keep creative unchanged — it\'s working',
          detail: 'Don\'t change what\'s working. This ad\'s performance metrics are strong and should be preserved while scaling.',
          priority: 'low',
        },
        adSetRecommendation: {
          action: `Increase daily budget to $${input.suggestedValue?.suggestedBudget ?? Math.round((input.adSetDailyBudget ?? 50) * 1.5)}/day`,
          detail: `Scale gradually (20-30% increases every 3-4 days) to let Meta\'s algorithm adapt without resetting the learning phase.`,
          priority: 'high',
        },
        campaignRecommendation: {
          action: 'Duplicate winning ad into new ad sets',
          detail: 'Test this creative with different audience segments. Create 2-3 new ad sets with lookalike audiences based on your best customers.',
          priority: 'medium',
        },
        estimatedImpact: `Scaling budget 50% could add ~$${Math.round(input.revenue7d * 0.4)}/week in revenue at similar ROAS.`,
      };

    case 'paused_positive':
      return {
        rootCause: `This ad was paused despite having ${input.roas14d?.toFixed(2) ?? '?'}x ROAS on $${input.spend14d.toFixed(0)} spend over 14 days. It may have been accidentally paused or paused during a broader campaign change.${siblingContext}`,
        adRecommendation: {
          action: 'Reactivate ad to recover lost revenue',
          detail: `With proven ${input.roas14d?.toFixed(2) ?? '?'}x ROAS, this ad was profitable. Reactivating could quickly restore performance.`,
          priority: 'high',
        },
        adSetRecommendation: {
          action: 'Ensure adequate budget for reactivation',
          detail: 'After reactivation, the ad may re-enter a mini learning phase. Set budget to allow 50+ conversions per week for the algorithm to optimize.',
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'Review why this ad was paused',
          detail: 'Check if it was paused intentionally (seasonal, inventory) or by mistake. Set up alerts to prevent accidentally pausing profitable ads.',
          priority: 'low',
        },
        estimatedImpact: `Reactivating could recover ~$${Math.round((input.spend14d / 14) * 7 * (input.roas14d ?? 2))}/week in revenue.`,
      };

    case 'learning_phase':
      return {
        rootCause: `This ad was created recently and has fewer than 500 impressions. Meta's algorithm needs time and data to optimize delivery and find the right audience.`,
        adRecommendation: {
          action: 'Wait 48 hours before making changes',
          detail: 'Any edits during the learning phase reset the algorithm. Let the ad run undisturbed until it exits learning.',
          priority: 'low',
        },
        adSetRecommendation: {
          action: 'Ensure budget supports 50 conversions/week',
          detail: 'Meta needs ~50 optimization events per week to exit learning phase. If budget is too low, the ad may stay in learning indefinitely.',
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'Avoid launching too many ads simultaneously',
          detail: 'Each new ad enters its own learning phase. Launching many at once splits budget and delays learning for all of them.',
          priority: 'low',
        },
        estimatedImpact: 'No immediate impact — monitor for 48h before evaluating performance.',
      };

    default:
      return {
        rootCause: `${input.title}: ${input.message}`,
        adRecommendation: {
          action: 'Review ad performance manually',
          detail: `This ad spent $${input.spend7d.toFixed(0)} in 7 days with ${input.conversions7d} conversions. Evaluate if the creative and targeting need adjustment.`,
          priority: 'medium',
        },
        adSetRecommendation: {
          action: 'Check budget allocation across ad set',
          detail: 'Ensure budget is distributed optimally across all ads in this ad set.',
          priority: 'medium',
        },
        campaignRecommendation: {
          action: 'Align campaign strategy with goals',
          detail: 'Review the campaign objective and ensure all ad sets serve the broader growth strategy.',
          priority: 'low',
        },
        estimatedImpact: 'Impact depends on the specific action taken.',
      };
  }
}

// ── JSON parsing helper ──────────────────────────────────────

function parseInsightResponse(raw: string): DiagnosisInsight {
  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse AI insight response as JSON: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;

  const parseRec = (rec: unknown): InsightRecommendation => {
    const r = (rec ?? {}) as Record<string, unknown>;
    return {
      action: String(r.action ?? 'Review and optimize'),
      detail: String(r.detail ?? ''),
      priority: (['high', 'medium', 'low'].includes(String(r.priority)) ? String(r.priority) : 'medium') as InsightRecommendation['priority'],
    };
  };

  return {
    rootCause: String(obj.rootCause ?? 'Unable to determine root cause.'),
    adRecommendation: parseRec(obj.adRecommendation),
    adSetRecommendation: parseRec(obj.adSetRecommendation),
    campaignRecommendation: parseRec(obj.campaignRecommendation),
    estimatedImpact: String(obj.estimatedImpact ?? 'Impact estimation unavailable.'),
  };
}
