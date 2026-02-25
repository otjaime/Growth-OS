// ──────────────────────────────────────────────────────────────
// Growth OS — AI Suggestion Generation
// LLM-powered experiment suggestions + demo fallback
// ──────────────────────────────────────────────────────────────

import type { Signal } from '@growth-os/etl';
import { getClient, AI_MODEL } from './ai.js';

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
  driverAnalysis: string;
  actions: string[];
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
- Each suggestion must have: title, hypothesis (in "If we [change], then [metric] will [improve] because [reason]" format), channel, metric, targetLift (%), scores (1-10 each for impact, confidence, effort, risk), driverAnalysis (1-2 sentence root cause), and actions (exactly 3 concrete next steps)
- Be specific — reference actual metrics and channels from the data
- Prioritize quick wins (high impact, low effort) when possible
- If playbook data is provided, reference past learnings and suggest variations
- Output ONLY a valid JSON array, no markdown fences or other text

JSON array format:
[{"title":"...","hypothesis":"If we ...","channel":"meta|google_ads|email|organic|affiliate|direct|null","metric":"cac|mer|aov|conversion_rate|retention|revenue|sessions","targetLift":15,"impact":8,"confidence":6,"effort":4,"risk":3,"reasoning":"...","driverAnalysis":"Root cause explanation of why this is happening...","actions":["First concrete action step","Second action step","Third action step"]}]`;

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
      impact: Math.min(10, Math.max(1, Number(item.impact ?? 5) || 5)),
      confidence: Math.min(10, Math.max(1, Number(item.confidence ?? 5) || 5)),
      effort: Math.min(10, Math.max(1, Number(item.effort ?? 5) || 5)),
      risk: Math.min(10, Math.max(1, Number(item.risk ?? 3) || 3)),
      reasoning: String(item.reasoning ?? ''),
      driverAnalysis: String(item.driverAnalysis ?? ''),
      actions: Array.isArray(item.actions)
        ? (item.actions as unknown[]).filter((a) => a != null && String(a).trim() !== '').map((a) => String(a)).slice(0, 3)
        : [],
    }));
}

export async function generateSuggestionsForOpportunity(
  opportunity: { type: string; title: string; description: string; signals: Signal[] },
  kpiContext: string,
  playbook: PlaybookEntry[],
  count = 4,
): Promise<SuggestionData[]> {
  const client = getClient();
  const userPrompt = buildUserPrompt(opportunity, kpiContext, playbook, count);

  const response = await client.chat.completions.create({
    model: AI_MODEL,
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
      driverAnalysis: '',
      actions: [],
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
      driverAnalysis: 'Meta CPMs rose 22% WoW due to audience saturation and increased auction competition, while conversion rates dropped — indicating creative fatigue and frequency cap issues.',
      actions: [
        'Pull Meta campaign report by ad set, sort by CPA, identify bottom 20% performers',
        'Create Google Brand campaign targeting top 50 branded keywords with exact match',
        'Set up daily MER tracking dashboard and review after 5 business days',
      ],
    },
    {
      title: 'Pause bottom 20% Meta ad sets by CPA',
      hypothesis: 'If we pause the worst-performing 20% of Meta ad sets, then blended CAC will decrease by 12% because we eliminate waste spend without losing meaningful volume',
      channel: 'meta',
      metric: 'cac',
      targetLift: 12,
      impact: 6, confidence: 7, effort: 2, risk: 2,
      reasoning: 'Quick win — removing low performers improves blended efficiency immediately.',
      driverAnalysis: 'Several ad sets are spending above the target CPA threshold without generating enough conversions, dragging down the overall blended efficiency.',
      actions: [
        'Export Meta Ads Manager report filtered by ad set, last 7 days, sort by cost per result',
        'Pause all ad sets with CPA >2x the blended average',
        'Reallocate freed budget to top 3 performing ad sets and monitor for 48 hours',
      ],
    },
    {
      title: 'Launch retargeting-only campaign for cart abandoners',
      hypothesis: 'If we create a dedicated retargeting campaign for 7-day cart abandoners, then conversion rate will improve by 20% because these users have high purchase intent',
      channel: 'meta',
      metric: 'conversion_rate',
      targetLift: 20,
      impact: 8, confidence: 7, effort: 4, risk: 2,
      reasoning: 'Retargeting warm audiences is more efficient than prospecting when MER is declining.',
      driverAnalysis: 'Cart abandonment rate is high and no dedicated retargeting campaign exists to recapture these high-intent visitors before they churn.',
      actions: [
        'Create a custom audience in Meta of 7-day cart abandoners using the Shopify pixel',
        'Design 3 dynamic product ad creatives with urgency messaging and social proof',
        'Launch campaign with a $50/day budget cap, optimize for purchases, review after 7 days',
      ],
    },
    {
      title: 'Test email-only flash sale for existing customers',
      hypothesis: 'If we run a 48-hour flash sale exclusively via email, then revenue will increase by 10% this week because owned channel revenue has zero CAC',
      channel: 'email',
      metric: 'revenue',
      targetLift: 10,
      impact: 6, confidence: 8, effort: 3, risk: 3,
      reasoning: 'Email generates revenue at zero marginal ad cost, directly improving MER.',
      driverAnalysis: 'Owned-channel revenue is underutilized — email list has strong engagement metrics but low promotion frequency, leaving easy revenue on the table.',
      actions: [
        'Segment email list: VIPs (top 20% by LTV) and engaged subscribers (opened in last 30 days)',
        'Draft flash sale email with 20% off, 48-hour countdown timer, and bestseller showcase',
        'Schedule send for Tuesday 10 AM, set up automated 24-hour reminder for non-openers',
      ],
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
      driverAnalysis: 'Ad frequency exceeded 3.5x in the top prospecting ad sets, causing CTR to drop 28% and CPM to rise — classic creative fatigue pattern.',
      actions: [
        'Source 3-5 UGC videos from existing customers or commission from a UGC platform',
        'Create 3 ad variations: testimonial, unboxing, before/after — each under 30 seconds',
        'Launch as new ad set with $30/day budget, compare CPA vs existing creatives after 5 days',
      ],
    },
    {
      title: 'Expand Meta lookalike audience to 3-5%',
      hypothesis: 'If we broaden our lookalike audience from 1% to 3-5%, then CPM will decrease by 15% because we increase the addressable pool and reduce auction pressure',
      channel: 'meta',
      metric: 'cac',
      targetLift: 15,
      impact: 7, confidence: 6, effort: 2, risk: 4,
      reasoning: 'Tight lookalike audiences lead to frequency saturation. Broadening usually lowers CAC at scale.',
      driverAnalysis: 'Current 1% lookalike audience is exhausted — frequency is 4.2x and the audience size is too small to scale efficiently at current spend levels.',
      actions: [
        'Duplicate top-performing ad set and switch audience from 1% to 3% lookalike',
        'Create a parallel 5% lookalike test with identical creative for comparison',
        'Monitor CPA and quality metrics (AOV, return rate) for 7 days before scaling',
      ],
    },
    {
      title: 'Launch Google Shopping campaign for top SKUs',
      hypothesis: 'If we launch a Google Shopping campaign for our top 10 SKUs, then blended CAC will decrease by 10% because Shopping typically has lower CAC than social prospecting',
      channel: 'google_ads',
      metric: 'cac',
      targetLift: 10,
      impact: 7, confidence: 7, effort: 5, risk: 2,
      reasoning: 'Diversifying acquisition channels reduces dependence on Meta and often yields lower CAC.',
      driverAnalysis: 'Over-reliance on Meta (78% of spend) creates risk concentration. Google Shopping captures high-intent searchers at typically 30-40% lower CAC.',
      actions: [
        'Set up Google Merchant Center feed with top 10 SKUs by revenue contribution',
        'Create a standard Shopping campaign with manual CPC bidding at $1.50 starting bid',
        'Allocate 15% of weekly Meta prospecting budget to Shopping and compare CPA after 14 days',
      ],
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
      driverAnalysis: 'Only 12% of first-time buyers make a second purchase within 30 days. No automated post-purchase sequence exists — customers receive no touchpoints between order confirmation and next promotion.',
      actions: [
        'Map a 5-email flow: Day 1 thank you + usage tips, Day 3 UGC spotlight, Day 7 cross-sell, Day 14 replenishment reminder, Day 21 loyalty offer',
        'Build the flow in Klaviyo with dynamic product blocks based on purchase history',
        'Set up A/B test on subject lines for email #1 and track D30 repeat purchase rate',
      ],
    },
    {
      title: 'Add subscription/auto-replenish option to top SKU',
      hypothesis: 'If we offer a 10% discount subscription option on our best-seller, then D30 retention will improve by 12pp because subscriptions lock in repeat purchases',
      channel: null,
      metric: 'retention',
      targetLift: 12,
      impact: 9, confidence: 6, effort: 7, risk: 3,
      reasoning: 'Subscriptions mechanically improve retention and increase predictable revenue.',
      driverAnalysis: 'Top SKU has a natural 28-day replenishment cycle but no subscription option — customers who want to reorder must manually revisit, leading to drop-off.',
      actions: [
        'Enable Shopify subscription app (Recharge or Loop) for top 3 SKUs by reorder rate',
        'Offer 10% discount + free shipping on subscription orders, displayed prominently on PDP',
        'Add post-purchase email touchpoint offering subscription conversion with one-click enrollment',
      ],
    },
    {
      title: 'Send win-back campaign to 30-60 day lapsed customers',
      hypothesis: 'If we send a personalized win-back offer to customers who bought 30-60 days ago, then retention will improve by 5pp because a timely incentive reactivates dormant buyers',
      channel: 'email',
      metric: 'retention',
      targetLift: 5,
      impact: 6, confidence: 8, effort: 3, risk: 2,
      reasoning: 'Win-back campaigns typically recover 5-15% of lapsed customers at low cost.',
      driverAnalysis: 'There are 2,400+ customers in the 30-60 day lapsed segment with no active win-back flow — this is a large, recoverable cohort.',
      actions: [
        'Create Klaviyo segment: purchased 30-60 days ago, no order since, has email opt-in',
        'Design win-back email with personalized product recommendations and 15% off coupon',
        'Send campaign and track reactivation rate over 14 days; iterate on offer if <5% conversion',
      ],
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
      driverAnalysis: 'Checkout-to-purchase drop-off is 62% — significantly above the 45% industry benchmark. Users are abandoning at the shipping information step, suggesting too many form fields or unexpected costs.',
      actions: [
        'Audit current checkout flow: count form fields, identify where users drop (Shopify analytics or Hotjar)',
        'Enable Shopify one-page checkout or implement an extensibility checkout with fewer steps',
        'Run A/B test with 50/50 traffic split for 14 days, measure checkout completion rate',
      ],
    },
    {
      title: 'Add urgency messaging to cart page',
      hypothesis: 'If we add low-stock indicators and shipping countdown timers to the cart page, then add-to-cart-to-checkout CVR will improve by 10% because urgency reduces hesitation',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 10,
      impact: 6, confidence: 6, effort: 3, risk: 2,
      reasoning: 'Urgency tactics are quick to implement and consistently improve funnel progression.',
      driverAnalysis: 'Average time-on-cart-page is 4.2 minutes — users are hesitating. No urgency signals currently exist on the cart page to encourage progression.',
      actions: [
        'Add "Only X left in stock" badge for items with inventory < 20 units',
        'Add shipping countdown timer: "Order within X hours for next-day delivery"',
        'Implement via Shopify theme customization or app, deploy and measure ATC-to-checkout CVR',
      ],
    },
    {
      title: 'Improve PDP with social proof and UGC',
      hypothesis: 'If we add customer reviews and UGC photos to product detail pages, then PDP-to-ATC CVR will improve by 12% because social proof builds purchase confidence',
      channel: null,
      metric: 'conversion_rate',
      targetLift: 12,
      impact: 7, confidence: 7, effort: 5, risk: 1,
      reasoning: 'Social proof is one of the most effective conversion optimization tactics for e-commerce.',
      driverAnalysis: 'PDP-to-ATC conversion is 4.8%, below the 7% benchmark for DTC. Product pages lack customer reviews and visual social proof, reducing buyer confidence.',
      actions: [
        'Install review app (Judge.me or Loox) and import existing reviews from email/social',
        'Add UGC photo carousel below the product gallery with customer-submitted images',
        'Email recent buyers requesting reviews with photo upload incentive (10% off next order)',
      ],
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
      driverAnalysis: 'Paid media revenue has been flat for 4 consecutive weeks despite 12% spend increase — indicating diminishing marginal returns from existing channels.',
      actions: [
        'Identify 20 micro-influencers (10K-50K followers) in the niche using Creator IQ or manual search',
        'Set up affiliate program with 15% commission using Impact or ShareASale',
        'Onboard first 10 partners with product seeding kits and track affiliate revenue as new channel',
      ],
    },
    {
      title: 'Test new geographic market with targeted campaigns',
      hypothesis: 'If we expand Meta campaigns to 3 new US metros, then sessions will increase by 15% because we tap into underpenetrated demand',
      channel: 'meta',
      metric: 'sessions',
      targetLift: 15,
      impact: 7, confidence: 5, effort: 4, risk: 4,
      reasoning: 'Geographic expansion is a classic growth lever when core markets show saturation.',
      driverAnalysis: 'Top 5 metros account for 72% of revenue but show frequency saturation (5x+). 15 secondary metros are untapped with strong demographic overlap.',
      actions: [
        'Pull GA4 location report to identify top secondary metros by session-to-purchase CVR',
        'Clone top Meta campaign and geo-target 3 highest-potential new metros with $30/day each',
        'Run for 14 days, compare CPA and CVR vs core markets to evaluate expansion potential',
      ],
    },
    {
      title: 'Launch product bundle to increase AOV',
      hypothesis: 'If we create a "starter kit" bundle at 15% discount vs individual items, then AOV will increase by 12% because bundles encourage larger orders',
      channel: null,
      metric: 'aov',
      targetLift: 12,
      impact: 7, confidence: 7, effort: 4, risk: 2,
      reasoning: 'When order count plateaus, increasing AOV is the fastest path to revenue growth.',
      driverAnalysis: 'Average order contains 1.3 items — cross-sell and bundling opportunity is underexploited. Customers who buy 2+ items have 2.1x higher LTV.',
      actions: [
        'Analyze top product affinities: which SKUs are most frequently bought together',
        'Create 2-3 curated bundles on Shopify with 15% bundle discount and dedicated PDP',
        'Promote bundles via homepage hero banner, cart upsell widget, and email campaign',
      ],
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
      driverAnalysis: 'Channel CAC varies 3x between highest and lowest — budget allocation does not reflect efficiency. The highest-CAC channel receives 40% of spend but delivers only 18% of conversions.',
      actions: [
        'Export channel-level CAC report for last 30 days and rank by cost per acquisition',
        'Reduce highest-CAC channel daily budget by 30% and increase lowest-CAC channel by same amount',
        'Monitor for 7 days — if blended CAC improves without volume loss, make permanent',
      ],
    },
    {
      title: 'Test Google Performance Max campaign',
      hypothesis: 'If we launch a Google Performance Max campaign with top creative assets, then we can acquire customers at 20% lower CAC than Meta because Google pMax optimizes across surfaces',
      channel: 'google_ads',
      metric: 'cac',
      targetLift: 20,
      impact: 7, confidence: 5, effort: 5, risk: 4,
      reasoning: 'Diversifying to Google pMax often outperforms single-channel scaling on Meta.',
      driverAnalysis: 'Google represents only 15% of ad spend despite typically delivering lower CAC for similar DTC brands. pMax can access Search, Shopping, Display, and YouTube in one campaign.',
      actions: [
        'Prepare creative assets: 5 images, 2 videos, 5 headlines, 5 descriptions for pMax asset groups',
        'Set up pMax campaign with $50/day budget targeting new customer acquisition',
        'Run alongside existing campaigns for 14 days, compare CPA and ROAS vs Meta prospecting',
      ],
    },
    {
      title: 'Invest in organic content marketing',
      hypothesis: 'If we publish 2 SEO-optimized blog posts per week, then organic sessions will increase by 25% in 60 days because content drives compounding traffic at zero marginal cost',
      channel: 'organic',
      metric: 'sessions',
      targetLift: 25,
      impact: 6, confidence: 5, effort: 6, risk: 1,
      reasoning: 'Organic as a channel has zero CAC and balances paid channel dependence.',
      driverAnalysis: 'Organic traffic is only 8% of total sessions — well below the 20-30% benchmark for mature DTC brands. The site has no blog or content strategy, missing high-intent informational queries.',
      actions: [
        'Conduct keyword research: identify 20 high-intent, low-competition keywords in the product niche',
        'Create content calendar with 2 posts/week: product guides, comparison articles, how-to content',
        'Publish first 4 articles, build internal links from product pages, and track organic session growth',
      ],
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
      driverAnalysis: 'Bounce rate is 58% and no exit-intent mechanism exists — visitors leave without any retention attempt, representing lost conversion opportunity.',
      actions: [
        'Install exit-intent popup tool (Privy, OptiMonk, or Justuno) on Shopify',
        'Configure popup with 10% discount code, email capture field, and 30-second delay trigger',
        'A/B test popup vs no popup for 7 days, measure conversion rate and new email signups',
      ],
    },
    {
      title: 'Test free shipping threshold increase',
      hypothesis: 'If we raise the free shipping threshold from $50 to $75, then AOV will increase by 8% because customers add items to qualify for free shipping',
      channel: null,
      metric: 'aov',
      targetLift: 8,
      impact: 5, confidence: 7, effort: 1, risk: 2,
      reasoning: 'Free shipping thresholds reliably increase AOV with minimal implementation effort.',
      driverAnalysis: 'Current AOV is $62 with free shipping at $50 — 78% of orders already qualify, meaning the threshold is too low to drive incremental cart additions.',
      actions: [
        'Update Shopify shipping settings: change free shipping threshold from $50 to $75',
        'Add progress bar widget to cart page showing "You\'re $X away from free shipping!"',
        'Monitor AOV and conversion rate daily for 7 days; revert if conversion drops >5%',
      ],
    },
    {
      title: 'Enable abandoned cart SMS reminders',
      hypothesis: 'If we send SMS reminders to cart abandoners within 1 hour, then we will recover 3% of abandoned carts because SMS has higher open rates than email',
      channel: 'email',
      metric: 'revenue',
      targetLift: 3,
      impact: 4, confidence: 6, effort: 3, risk: 2,
      reasoning: 'SMS cart recovery is a quick win with predictable ROI for DTC brands.',
      driverAnalysis: 'Cart abandonment recovery currently relies only on email (42% open rate). SMS has 98% open rate and can reach abandoners faster, within the critical first hour.',
      actions: [
        'Enable SMS collection at checkout with opt-in checkbox (Postscript or Klaviyo SMS)',
        'Set up automated SMS flow: 1-hour post-abandonment with cart link and urgency copy',
        'Track SMS-attributed recovered revenue and cost per recovery for 14 days',
      ],
    },
  ],
};

export function getDemoSuggestions(opportunityType: string): SuggestionData[] {
  return DEMO_SUGGESTIONS[opportunityType] ?? DEMO_SUGGESTIONS.QUICK_WIN!;
}
