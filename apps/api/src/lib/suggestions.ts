// ──────────────────────────────────────────────────────────────
// Growth OS — AI Suggestion Generation
// LLM-powered experiment suggestions + demo fallback
// ──────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import type { Signal } from '@growth-os/etl';

const apiKey = process.env.OPENAI_API_KEY ?? '';
const model = process.env.AI_MODEL ?? 'gpt-4o-mini';

export interface SuggestionData {
  title: string;
  hypothesis: string;
  channel: string | null;
  metric: string;
  targetLift: number;
  impact: number;
  confidence: number;
  effort: number;
  risk: number;
  reasoning: string;
}

interface PlaybookEntry {
  name: string;
  channel: string | null;
  result: string | null;
  learnings: string | null;
  nextSteps: string | null;
}

const SYSTEM_PROMPT = `You are a senior DTC growth strategist. Your job is to generate concrete, actionable experiment ideas based on detected performance issues in an e-commerce business.

Rules:
- Generate exactly the number of experiment suggestions requested
- Each suggestion must have: title, hypothesis (in "If we [change], then [metric] will [improve] because [reason]" format), channel, metric, targetLift (%), and scores (1-10 each for impact, confidence, effort, risk)
- Be specific — reference actual metrics and channels from the data
- Prioritize quick wins (high impact, low effort) when possible
- If playbook data is provided, reference past learnings and suggest variations
- Output ONLY a valid JSON array, no markdown fences or other text

JSON array format:
[{"title":"...","hypothesis":"If we ...","channel":"meta|google_ads|email|organic|affiliate|direct|null","metric":"cac|mer|aov|conversion_rate|retention|revenue|sessions","targetLift":15,"impact":8,"confidence":6,"effort":4,"risk":3,"reasoning":"..."}]`;

function buildUserPrompt(
  opportunity: { type: string; title: string; description: string; signals: Signal[] },
  kpiContext: string,
  playbook: PlaybookEntry[],
  count: number,
): string {
  const signalBullets = opportunity.signals
    .map((s) => `- [${s.severity.toUpperCase()}] ${s.title}: ${s.description}`)
    .join('\n');

  const playbookSection = playbook.length > 0
    ? `\nPAST EXPERIMENT PLAYBOOK:\n${playbook.map((p) => `- [${p.channel ?? 'all'}] ${p.name}: ${p.result ?? 'No result'}. Learning: ${p.learnings ?? 'None'}. Next: ${p.nextSteps ?? 'None'}`).join('\n')}`
    : '';

  return `DETECTED OPPORTUNITY: ${opportunity.type} — ${opportunity.title}
${opportunity.description}

SIGNALS THAT TRIGGERED THIS:
${signalBullets}

${kpiContext}
${playbookSection}

Generate ${count} experiment suggestions to address this opportunity:`;
}

function parseSuggestionResponse(text: string): SuggestionData[] {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return validateSuggestions(parsed);
  } catch {
    // Try extracting JSON from markdown code fences
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]!);
        if (Array.isArray(parsed)) return validateSuggestions(parsed);
      } catch {
        // fall through
      }
    }

    // Try extracting raw array
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return validateSuggestions(parsed);
      } catch {
        // fall through
      }
    }
  }

  return [];
}

function validateSuggestions(items: unknown[]): SuggestionData[] {
  return items
    .filter((item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && 'title' in item && 'hypothesis' in item,
    )
    .map((item) => ({
      title: String(item.title ?? ''),
      hypothesis: String(item.hypothesis ?? ''),
      channel: item.channel ? String(item.channel) : null,
      metric: String(item.metric ?? 'conversion_rate'),
      targetLift: Number(item.targetLift ?? 10),
      impact: Math.min(10, Math.max(1, Number(item.impact ?? 5))),
      confidence: Math.min(10, Math.max(1, Number(item.confidence ?? 5))),
      effort: Math.min(10, Math.max(1, Number(item.effort ?? 5))),
      risk: Math.min(10, Math.max(1, Number(item.risk ?? 3))),
      reasoning: String(item.reasoning ?? ''),
    }));
}

export async function generateSuggestionsForOpportunity(
  opportunity: { type: string; title: string; description: string; signals: Signal[] },
  kpiContext: string,
  playbook: PlaybookEntry[],
  count = 4,
): Promise<SuggestionData[]> {
  const client = new OpenAI({ apiKey });
  const userPrompt = buildUserPrompt(opportunity, kpiContext, playbook, count);

  const response = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const suggestions = parseSuggestionResponse(text);

  // If parsing failed completely, return one generic rule-based suggestion
  if (suggestions.length === 0) {
    return [{
      title: `Investigate ${opportunity.title}`,
      hypothesis: `If we address the ${opportunity.type.toLowerCase().replace(/_/g, ' ')} issue, then performance will improve because the current metrics indicate a problem.`,
      channel: null,
      metric: 'revenue',
      targetLift: 10,
      impact: 5,
      confidence: 3,
      effort: 5,
      risk: 3,
      reasoning: 'AI generation failed to produce structured suggestions. Manual investigation recommended.',
    }];
  }

  return suggestions;
}

// ── Demo Mode Fallback ────────────────────────────────────────

const DEMO_SUGGESTIONS: Record<string, SuggestionData[]> = {
  EFFICIENCY_DROP: [
    {
      title: 'Shift 20% of Meta prospecting budget to Google Brand',
      hypothesis: 'If we reallocate 20% of Meta prospecting spend to Google Brand campaigns, then MER will improve by 15% because brand searches have 3-5x higher ROAS',
      channel: 'google_ads',
      metric: 'mer',
      targetLift: 15,
      impact: 7, confidence: 8, effort: 3, risk: 2,
      reasoning: 'Meta prospecting shows diminishing returns while Google Brand consistently converts at lower CAC.',
    },
    {
      title: 'Pause bottom 20% Meta ad sets by CPA',
      hypothesis: 'If we pause the worst-performing 20% of Meta ad sets, then blended CAC will decrease by 12% because we eliminate waste spend without losing meaningful volume',
      channel: 'meta',
      metric: 'cac',
      targetLift: 12,
      impact: 6, confidence: 7, effort: 2, risk: 2,
      reasoning: 'Quick win — removing low performers improves blended efficiency immediately.',
    },
    {
      title: 'Launch retargeting-only campaign for cart abandoners',
      hypothesis: 'If we create a dedicated retargeting campaign for 7-day cart abandoners, then conversion rate will improve by 20% because these users have high purchase intent',
      channel: 'meta',
      metric: 'conversion_rate',
      targetLift: 20,
      impact: 8, confidence: 7, effort: 4, risk: 2,
      reasoning: 'Retargeting warm audiences is more efficient than prospecting when MER is declining.',
    },
    {
      title: 'Test email-only flash sale for existing customers',
      hypothesis: 'If we run a 48-hour flash sale exclusively via email, then revenue will increase by 10% this week because owned channel revenue has zero CAC',
      channel: 'email',
      metric: 'revenue',
      targetLift: 10,
      impact: 6, confidence: 8, effort: 3, risk: 3,
      reasoning: 'Email generates revenue at zero marginal ad cost, directly improving MER.',
    },
  ],
  CAC_SPIKE: [
    {
      title: 'Refresh Meta ad creative with UGC video',
      hypothesis: 'If we replace static image ads with UGC video creative, then Meta CAC will decrease by 18% because video drives higher engagement and lower CPM',
      channel: 'meta',
      metric: 'cac',
      targetLift: 18,
      impact: 8, confidence: 6, effort: 5, risk: 3,
      reasoning: 'Creative fatigue is a common cause of CAC spikes. UGC video typically outperforms static for DTC.',
    },
    {
      title: 'Expand Meta lookalike audience to 3-5%',
      hypothesis: 'If we broaden our lookalike audience from 1% to 3-5%, then CPM will decrease by 15% because we increase the addressable pool and reduce auction pressure',
      channel: 'meta',
      metric: 'cac',
      targetLift: 15,
      impact: 7, confidence: 6, effort: 2, risk: 4,
      reasoning: 'Tight lookalike audiences lead to frequency saturation. Broadening usually lowers CAC at scale.',
    },
    {
      title: 'Launch Google Shopping campaign for top SKUs',
      hypothesis: 'If we launch a Google Shopping campaign for our top 10 SKUs, then blended CAC will decrease by 10% because Shopping typically has lower CAC than social prospecting',
      channel: 'google_ads',
      metric: 'cac',
      targetLift: 10,
      impact: 7, confidence: 7, effort: 5, risk: 2,
      reasoning: 'Diversifying acquisition channels reduces dependence on Meta and often yields lower CAC.',
    },
  ],
  RETENTION_DECLINE: [
    {
      title: 'Launch post-purchase email nurture sequence',
      hypothesis: 'If we implement a 5-email post-purchase sequence with usage tips and cross-sells, then D30 retention will improve by 8pp because engaged customers repurchase sooner',
      channel: 'email',
      metric: 'retention',
      targetLift: 8,
      impact: 8, confidence: 7, effort: 5, risk: 1,
      reasoning: 'Post-purchase engagement is the highest-leverage retention tactic for DTC brands.',
    },
    {
      title: 'Add subscription/auto-replenish option to top SKU',
      hypothesis: 'If we offer a 10% discount subscription option on our best-seller, then D30 retention will improve by 12pp because subscriptions lock in repeat purchases',
      channel: null,
      metric: 'retention',
      targetLift: 12,
      impact: 9, confidence: 6, effort: 7, risk: 3,
      reasoning: 'Subscriptions mechanically improve retention and increase predictable revenue.',
    },
    {
      title: 'Send win-back campaign to 30-60 day lapsed customers',
      hypothesis: 'If we send a personalized win-back offer to customers who bought 30-60 days ago, then retention will improve by 5pp because a timely incentive reactivates dormant buyers',
      channel: 'email',
      metric: 'retention',
      targetLift: 5,
      impact: 6, confidence: 8, effort: 3, risk: 2,
      reasoning: 'Win-back campaigns typically recover 5-15% of lapsed customers at low cost.',
    },
  ],
  FUNNEL_LEAK: [
    {
      title: 'A/B test simplified checkout flow',
      hypothesis: 'If we reduce checkout steps from 3 to 1 page, then checkout-to-purchase CVR will improve by 15% because friction causes abandonment',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 15,
      impact: 9, confidence: 7, effort: 6, risk: 2,
      reasoning: 'Multi-step checkout is the #1 conversion killer in DTC. One-page checkout typically lifts CVR 10-20%.',
    },
    {
      title: 'Add urgency messaging to cart page',
      hypothesis: 'If we add low-stock indicators and shipping countdown timers to the cart page, then add-to-cart-to-checkout CVR will improve by 10% because urgency reduces hesitation',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 10,
      impact: 6, confidence: 6, effort: 3, risk: 2,
      reasoning: 'Urgency tactics are quick to implement and consistently improve funnel progression.',
    },
    {
      title: 'Improve PDP with social proof and UGC',
      hypothesis: 'If we add customer reviews and UGC photos to product detail pages, then PDP-to-ATC CVR will improve by 12% because social proof builds purchase confidence',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 12,
      impact: 7, confidence: 7, effort: 5, risk: 1,
      reasoning: 'Social proof is one of the most effective conversion optimization tactics for e-commerce.',
    },
  ],
  GROWTH_PLATEAU: [
    {
      title: 'Launch affiliate/influencer partnership program',
      hypothesis: 'If we onboard 10 micro-influencers as affiliates, then revenue will increase by 8% because new channels bring incremental reach at performance-based cost',
      channel: 'affiliate',
      metric: 'revenue',
      targetLift: 8,
      impact: 7, confidence: 5, effort: 6, risk: 3,
      reasoning: 'When paid channels plateau, affiliate and influencer partnerships provide new customer sources.',
    },
    {
      title: 'Test new geographic market with targeted campaigns',
      hypothesis: 'If we expand Meta campaigns to 3 new US metros, then sessions will increase by 15% because we tap into underpenetrated demand',
      channel: 'meta',
      metric: 'sessions',
      targetLift: 15,
      impact: 7, confidence: 5, effort: 4, risk: 4,
      reasoning: 'Geographic expansion is a classic growth lever when core markets show saturation.',
    },
    {
      title: 'Launch product bundle to increase AOV',
      hypothesis: 'If we create a "starter kit" bundle at 15% discount vs individual items, then AOV will increase by 12% because bundles encourage larger orders',
      channel: null,
      metric: 'aov',
      targetLift: 12,
      impact: 7, confidence: 7, effort: 4, risk: 2,
      reasoning: 'When order count plateaus, increasing AOV is the fastest path to revenue growth.',
    },
  ],
  CHANNEL_IMBALANCE: [
    {
      title: 'Rebalance budget: reduce highest-CAC channel by 30%',
      hypothesis: 'If we shift 30% of the highest-CAC channel budget to the lowest-CAC channel, then blended CAC will decrease by 10% because we reallocate to more efficient channels',
      channel: null,
      metric: 'cac',
      targetLift: 10,
      impact: 7, confidence: 7, effort: 2, risk: 3,
      reasoning: 'Simple budget reallocation based on channel efficiency is a low-effort, high-impact move.',
    },
    {
      title: 'Test Google Performance Max campaign',
      hypothesis: 'If we launch a Google Performance Max campaign with top creative assets, then we can acquire customers at 20% lower CAC than Meta because Google pMax optimizes across surfaces',
      channel: 'google_ads',
      metric: 'cac',
      targetLift: 20,
      impact: 7, confidence: 5, effort: 5, risk: 4,
      reasoning: 'Diversifying to Google pMax often outperforms single-channel scaling on Meta.',
    },
    {
      title: 'Invest in organic content marketing',
      hypothesis: 'If we publish 2 SEO-optimized blog posts per week, then organic sessions will increase by 25% in 60 days because content drives compounding traffic at zero marginal cost',
      channel: 'organic',
      metric: 'sessions',
      targetLift: 25,
      impact: 6, confidence: 5, effort: 6, risk: 1,
      reasoning: 'Organic as a channel has zero CAC and balances paid channel dependence.',
    },
  ],
  QUICK_WIN: [
    {
      title: 'Add exit-intent popup with discount offer',
      hypothesis: 'If we show a 10% discount popup to visitors about to leave, then conversion rate will improve by 5% because we capture otherwise-lost visitors',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 5,
      impact: 5, confidence: 7, effort: 2, risk: 2,
      reasoning: 'Exit-intent popups are quick to implement and typically convert 2-5% of abandoning visitors.',
    },
    {
      title: 'Test free shipping threshold increase',
      hypothesis: 'If we raise the free shipping threshold from $50 to $75, then AOV will increase by 8% because customers add items to qualify for free shipping',
      channel: null,
      metric: 'aov',
      targetLift: 8,
      impact: 5, confidence: 7, effort: 1, risk: 2,
      reasoning: 'Free shipping thresholds reliably increase AOV with minimal implementation effort.',
    },
    {
      title: 'Enable abandoned cart SMS reminders',
      hypothesis: 'If we send SMS reminders to cart abandoners within 1 hour, then we will recover 3% of abandoned carts because SMS has higher open rates than email',
      channel: 'email',
      metric: 'revenue',
      targetLift: 3,
      impact: 4, confidence: 6, effort: 3, risk: 2,
      reasoning: 'SMS cart recovery is a quick win with predictable ROI for DTC brands.',
    },
  ],
};

export function getDemoSuggestions(opportunityType: string): SuggestionData[] {
  return DEMO_SUGGESTIONS[opportunityType] ?? DEMO_SUGGESTIONS.QUICK_WIN!;
}
