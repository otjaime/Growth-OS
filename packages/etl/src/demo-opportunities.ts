// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Opportunity & Suggestion Seeding
// Creates sample opportunities with suggestions for demo mode
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';

interface DemoOpportunity {
  type: 'EFFICIENCY_DROP' | 'FUNNEL_LEAK' | 'QUICK_WIN';
  title: string;
  description: string;
  priority: number;
  signalsJson: Prisma.InputJsonValue;
  suggestions: DemoSuggestion[];
}

interface DemoSuggestion {
  type: 'RULE_BASED' | 'PLAYBOOK_MATCH';
  title: string;
  hypothesis: string;
  suggestedChannel: string | null;
  suggestedMetric: string;
  suggestedTargetLift: number;
  impactScore: number;
  confidenceScore: number;
  effortScore: number;
  riskScore: number;
  reasoning: string;
  driverAnalysis: string;
  actionsJson: string[];
}

const DEMO_OPPORTUNITIES: readonly DemoOpportunity[] = [
  {
    type: 'EFFICIENCY_DROP',
    title: 'Meta Ads spend efficiency declining',
    description: 'Meta prospecting CAC increased 22% WoW while spend grew only 8%. CPA on Advantage+ campaigns spiked from $38 to $46, suggesting audience fatigue or creative decay.',
    priority: 85,
    signalsJson: [
      { metric: 'cac', currentValue: 46, previousValue: 38, changePercent: 21.1, direction: 'up', severity: 'critical' },
      { metric: 'roas', currentValue: 2.8, previousValue: 3.5, changePercent: -20, direction: 'down', severity: 'warning' },
    ],
    suggestions: [
      {
        type: 'PLAYBOOK_MATCH',
        title: 'Refresh UGC creatives on top Meta campaigns',
        hypothesis: 'If we replace the top 3 fatigued ad sets with fresh UGC creatives, then Meta CAC will decrease by 15-20% because creative fatigue is the primary driver of rising CPAs.',
        suggestedChannel: 'meta',
        suggestedMetric: 'cac',
        suggestedTargetLift: 18,
        impactScore: 8,
        confidenceScore: 7,
        effortScore: 4,
        riskScore: 2,
        reasoning: 'Historical data shows that UGC creative swaps recovered 26% CAC reduction in a prior experiment (UGC Video Creative on Meta). The current top 3 ad sets have been running unchanged for 28+ days, well past the typical 14-day creative decay window.',
        driverAnalysis: 'Meta CPAs spiked because the top 3 prospecting ad sets have been running for 28+ days without creative rotation. Frequency reached 3.8x (vs 2.0x benchmark), causing audience fatigue. Secondary factor: iOS 17 ATT changes reduced Advantage+ audience match quality.',
        actionsJson: [
          'Source 3-5 new UGC videos from creator roster (budget: $2K)',
          'Pause fatigued ad sets and launch fresh creatives with $200/day test budgets',
          'Set up automated creative rotation alerts at 14-day or 3x frequency threshold',
        ],
      },
      {
        type: 'RULE_BASED',
        title: 'Shift 20% of Meta prospecting budget to Google Shopping',
        hypothesis: 'If we reallocate 20% of Meta prospecting spend to Google Shopping pMax, then blended CAC will decrease because Google Shopping captures higher-intent traffic at lower CPA.',
        suggestedChannel: 'google_ads',
        suggestedMetric: 'cac',
        suggestedTargetLift: 12,
        impactScore: 7,
        confidenceScore: 6,
        effortScore: 3,
        riskScore: 3,
        reasoning: 'Google Shopping pMax has 40% lower CPA than Meta prospecting in the current data. Shifting budget to higher-performing channels while Meta creatives are refreshed reduces blended CAC risk.',
        driverAnalysis: 'Channel mix is over-indexed on Meta (65% of spend) despite Google Shopping showing 40% lower CPA. Diversification reduces dependency on a single creative-dependent channel.',
        actionsJson: [
          'Calculate optimal reallocation: shift $X/day from Meta prospecting to Google pMax',
          'Monitor Google pMax ROAS for 7 days to confirm scalability',
          'Set blended CAC guardrail at $45 — auto-alert if breached after rebalance',
        ],
      },
    ],
  },
  {
    type: 'FUNNEL_LEAK',
    title: 'Checkout funnel drop detected',
    description: 'ATC-to-checkout conversion dropped from 45% to 38% this week, representing a ~15% decline. Cart abandonment rate is at 68%, up from 62% baseline. Estimated revenue leak: $12K/week.',
    priority: 70,
    signalsJson: [
      { metric: 'atc_to_checkout', currentValue: 0.38, previousValue: 0.45, changePercent: -15.6, direction: 'down', severity: 'warning' },
      { metric: 'cart_abandonment', currentValue: 0.68, previousValue: 0.62, changePercent: 9.7, direction: 'up', severity: 'warning' },
    ],
    suggestions: [
      {
        type: 'RULE_BASED',
        title: 'Add cart abandonment SMS recovery flow',
        hypothesis: 'If we add SMS as a cart recovery channel (30min, 4hr triggers) alongside existing email, then cart recovery rate will increase by 25% because SMS has 98% open rates vs 20% for email.',
        suggestedChannel: 'email',
        suggestedMetric: 'conversion_rate',
        suggestedTargetLift: 25,
        impactScore: 7,
        confidenceScore: 7,
        effortScore: 5,
        riskScore: 2,
        reasoning: 'SMS cart abandonment flows typically recover 8-12% of abandoned carts vs 3-5% for email alone. The current email-only recovery flow is well-optimized, so adding a complementary channel addresses whitespace.',
        driverAnalysis: 'Cart abandonment spiked because a recent shipping cost display change shows costs later in the funnel (at checkout instead of PDP). Customers who add-to-cart are surprised by shipping costs and bail. Secondary: new payment gateway has 2s slower load time.',
        actionsJson: [
          'Implement SMS opt-in at add-to-cart step (Klaviyo/Postscript integration)',
          'A/B test showing estimated shipping earlier — on PDP vs cart page',
          'Audit checkout page load time and optimize payment gateway performance',
        ],
      },
    ],
  },
  {
    type: 'QUICK_WIN',
    title: 'Retargeting ROAS exceeds prospecting 4:1',
    description: 'Retargeting campaigns are delivering 8.2x ROAS vs 2.1x for prospecting. Current retargeting budget is only 12% of total ad spend — significant room to scale this high-performing segment.',
    priority: 60,
    signalsJson: [
      { metric: 'roas_retargeting', currentValue: 8.2, previousValue: 7.8, changePercent: 5.1, direction: 'up', severity: 'info' },
      { metric: 'roas_prospecting', currentValue: 2.1, previousValue: 2.3, changePercent: -8.7, direction: 'down', severity: 'info' },
    ],
    suggestions: [
      {
        type: 'RULE_BASED',
        title: 'Scale retargeting spend from 12% to 20% of ad budget',
        hypothesis: 'If we increase retargeting budget share from 12% to 20%, then blended ROAS will improve by 15% because retargeting yields 4x higher returns than prospecting at current scale.',
        suggestedChannel: 'meta',
        suggestedMetric: 'revenue',
        suggestedTargetLift: 15,
        impactScore: 6,
        confidenceScore: 8,
        effortScore: 2,
        riskScore: 3,
        reasoning: 'Retargeting campaigns have consistent 7-9x ROAS over the past 8 weeks with no signs of audience saturation. At 12% budget share, the retargeting audience pool is <30% utilized. Scaling to 20% stays well within the addressable audience.',
        driverAnalysis: 'Retargeting outperformance is driven by a growing mid-funnel audience (site visitors up 18% MoM) that is under-monetized. Current retargeting frequency is only 1.4x/week vs optimal 2-3x/week, indicating headroom.',
        actionsJson: [
          'Increase retargeting daily budget by $150/day (from $360 to $510)',
          'Segment retargeting audiences: PDP viewers vs cart abandoners vs past purchasers',
          'Set frequency cap at 3x/week and monitor for diminishing returns after 14 days',
        ],
      },
      {
        type: 'PLAYBOOK_MATCH',
        title: 'Launch dynamic product retargeting on Google Display',
        hypothesis: 'If we add Google Dynamic Remarketing alongside Meta retargeting, then total retargeting revenue will grow 20% because we reach users across both platforms with personalized product ads.',
        suggestedChannel: 'google_ads',
        suggestedMetric: 'revenue',
        suggestedTargetLift: 20,
        impactScore: 7,
        confidenceScore: 5,
        effortScore: 4,
        riskScore: 2,
        reasoning: 'Google Dynamic Remarketing reaches users who search and browse outside of Meta. Product feed is already synced for Shopping campaigns, so setup is incremental.',
        driverAnalysis: 'Currently, retargeting runs exclusively on Meta. Google Display Network reaches 90%+ of internet users. Cross-platform retargeting reduces dependency on a single channel and captures incremental conversions.',
        actionsJson: [
          'Set up Google Dynamic Remarketing campaign with existing product feed',
          'Start with $100/day test budget, target 5x ROAS minimum',
          'Compare cross-platform overlap with Meta retargeting to avoid audience cannibalization',
        ],
      },
    ],
  },
];

export async function seedDemoOpportunities(): Promise<number> {
  let count = 0;

  for (const opp of DEMO_OPPORTUNITIES) {
    const opportunity = await prisma.opportunity.create({
      data: {
        type: opp.type,
        title: opp.title,
        description: opp.description,
        priority: opp.priority,
        status: 'NEW',
        signalsJson: opp.signalsJson,
      },
    });

    for (const sug of opp.suggestions) {
      await prisma.suggestion.create({
        data: {
          opportunityId: opportunity.id,
          type: sug.type,
          title: sug.title,
          hypothesis: sug.hypothesis,
          suggestedChannel: sug.suggestedChannel,
          suggestedMetric: sug.suggestedMetric,
          suggestedTargetLift: sug.suggestedTargetLift,
          impactScore: sug.impactScore,
          confidenceScore: sug.confidenceScore,
          effortScore: sug.effortScore,
          riskScore: sug.riskScore,
          reasoning: sug.reasoning,
          driverAnalysis: sug.driverAnalysis,
          actionsJson: sug.actionsJson,
        },
      });
    }

    count++;
  }

  return count;
}
