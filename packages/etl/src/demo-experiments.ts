// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Experiment Seeding
// Creates sample experiments across all 5 statuses for demo mode
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';

interface DemoExp {
  name: string;
  hypothesis: string;
  status: 'IDEA' | 'BACKLOG' | 'RUNNING' | 'COMPLETED' | 'ARCHIVED';
  channel: string | null;
  primaryMetric: string;
  targetLift: number | null;
  impact: number;
  confidence: number;
  ease: number;
  daysRunning: number | null;
  result: string | null;
  learnings: string | null;
  nextSteps: string | null;
  metricBaseline: number | null;
  metricTrend: number | null;
  // Optional A/B test data
  controlName?: string;
  variantName?: string;
  controlSampleSize?: number;
  variantSampleSize?: number;
  controlConversions?: number;
  variantConversions?: number;
}

function generateMetricSeries(
  baseline: number,
  dailyTrend: number,
  days: number,
  startDate: Date,
): Array<{ date: Date; value: number }> {
  const series: Array<{ date: Date; value: number }> = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + i);
    const value = Math.max(0, baseline + dailyTrend * i + Math.sin(i) * baseline * 0.05);
    series.push({ date, value: Math.round(value * 100) / 100 });
  }
  return series;
}

const DEMO_EXPERIMENTS: readonly DemoExp[] = [
  // ── COMPLETED (5) ──────────────────────────────────────────
  {
    name: 'UGC Video Creative on Meta',
    hypothesis: 'If we replace studio-produced ad creatives with UGC-style videos on Meta prospecting campaigns, then CAC will decrease because UGC content has higher engagement rates with cold audiences.',
    status: 'COMPLETED', channel: 'meta', primaryMetric: 'cac',
    targetLift: 25, impact: 9, confidence: 8, ease: 7, daysRunning: 21,
    result: 'CAC decreased 26% from $42 to $31. CTR improved 45%, CPM stayed flat. 3 of 4 UGC variants outperformed control.',
    learnings: 'UGC video outperforms studio content for cold audiences on Meta. Key factors: authentic testimonials, vertical format, first 3 seconds hook. Worst performer was the unboxing format.',
    nextSteps: 'Scale UGC budget to $500/day. Test UGC on Google YouTube campaigns. Build a creator roster for ongoing content.',
    metricBaseline: 42, metricTrend: -0.52,
    controlName: 'Studio Creative', variantName: 'UGC Video',
    controlSampleSize: 12000, variantSampleSize: 12000,
    controlConversions: 286, variantConversions: 389,
  },
  {
    name: 'Checkout Funnel Simplification',
    hypothesis: 'If we reduce checkout from 3 steps to 1 page with inline validation, then checkout-to-purchase conversion rate will increase because checkout abandonment is our largest funnel leak.',
    status: 'COMPLETED', channel: null, primaryMetric: 'conversion_rate',
    targetLift: 15, impact: 9, confidence: 8, ease: 5, daysRunning: 28,
    result: 'Checkout-to-purchase CVR improved 19% (from 62% to 73.8%). Overall site CVR increased from 2.1% to 2.5%. Revenue per session up 22%.',
    learnings: 'Single-page checkout with progress indicators and inline validation dramatically reduces abandonment. Guest checkout option drove 30% of the lift. Mobile saw 2x the improvement vs desktop.',
    nextSteps: 'A/B test express checkout options (Apple Pay, Shop Pay). Optimize mobile-specific layout. Add address autocomplete.',
    metricBaseline: 0.021, metricTrend: 0.00014,
    controlName: '3-Step Checkout', variantName: 'Single Page Checkout',
    controlSampleSize: 8500, variantSampleSize: 8500,
    controlConversions: 5270, variantConversions: 6273,
  },
  {
    name: 'Free Shipping Threshold Test',
    hypothesis: 'If we set a free shipping threshold at $75 (current AOV is $68), then AOV will increase because customers will add items to reach the threshold.',
    status: 'COMPLETED', channel: null, primaryMetric: 'aov',
    targetLift: 10, impact: 6, confidence: 8, ease: 9, daysRunning: 21,
    result: 'AOV increased 11% from $68 to $75.50. However, contribution margin decreased 2pp due to absorbed shipping costs. Net positive: $3.20 more margin per order.',
    learnings: 'Free shipping thresholds work best when set 10-15% above current AOV. Product recommendations at cart helped customers reach threshold. Margin impact must be monitored closely.',
    nextSteps: 'Keep threshold at $75. Add smart product recommendations in cart. Test dynamic threshold based on cart contents.',
    metricBaseline: 68, metricTrend: 0.36,
  },
  {
    name: 'TikTok Spark Ads Test',
    hypothesis: 'If we launch TikTok Spark Ads using existing creator content, then we can acquire customers at CAC under $50 because TikTok CPMs are 30% lower than Meta.',
    status: 'COMPLETED', channel: 'tiktok', primaryMetric: 'cac',
    targetLift: 20, impact: 7, confidence: 5, ease: 6, daysRunning: 28,
    result: 'TikTok CAC was $110, 2.2x our $50 target. Low intent traffic: high clicks but poor conversion (0.8% vs 2.1% site average). ROAS 0.9x vs 3.2x on Meta.',
    learnings: 'TikTok audience skews younger and browses with low purchase intent. Spark Ads drive awareness but not direct conversion. Attribution may undercount — will need holdout test. Best for top-of-funnel brand building.',
    nextSteps: 'Pause direct response campaigns. Test TikTok as awareness channel with Meta retargeting. Evaluate with 30-day attribution window.',
    metricBaseline: 50, metricTrend: 2.14,
    controlName: 'Meta Prospecting', variantName: 'TikTok Spark Ads',
    controlSampleSize: 15000, variantSampleSize: 15000,
    controlConversions: 315, variantConversions: 120,
  },
  {
    name: 'Email Win-Back Flow Optimization',
    hypothesis: 'If we redesign the win-back email flow with personalized product recommendations and a tiered discount (10% → 15% → 20%), then D60 retention will improve because lapsed customers need escalating incentives.',
    status: 'COMPLETED', channel: 'email', primaryMetric: 'retention',
    targetLift: 5, impact: 7, confidence: 7, ease: 8, daysRunning: 21,
    result: 'D60 retention improved 3pp from 18% to 21%. Win-back flow revenue increased 42%. Tiered discounts: 10% email had 8% CVR, 15% had 14% CVR, 20% had 22% CVR.',
    learnings: 'Personalized product recommendations drove most of the lift. The 15% discount tier has the best margin-adjusted ROI. Timing: 45-day lapse is optimal trigger point, not 30-day.',
    nextSteps: 'Roll out to all customer segments. Test SMS as additional win-back channel. Adjust trigger to 45-day lapse window.',
    metricBaseline: 0.18, metricTrend: 0.0014,
    controlName: 'Original Win-Back', variantName: 'Personalized Tiered',
    controlSampleSize: 3200, variantSampleSize: 3200,
    controlConversions: 576, variantConversions: 672,
  },

  // ── RUNNING (3) ────────────────────────────────────────────
  {
    name: 'Google Shopping pMax Campaign',
    hypothesis: 'If we launch Performance Max campaigns on Google Shopping with optimized product feeds, then blended CAC will decrease because Google Shopping captures high-intent searches.',
    status: 'RUNNING', channel: 'google_ads', primaryMetric: 'cac',
    targetLift: 20, impact: 8, confidence: 6, ease: 6, daysRunning: 14,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: 38, metricTrend: -0.21,
  },
  {
    name: 'Homepage Personalization Test',
    hypothesis: 'If we personalize homepage hero content based on traffic source and returning vs new visitor, then site-wide conversion rate will improve because visitors see more relevant messaging.',
    status: 'RUNNING', channel: null, primaryMetric: 'conversion_rate',
    targetLift: 12, impact: 8, confidence: 5, ease: 4, daysRunning: 10,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: 0.021, metricTrend: 0.00008,
  },
  {
    name: 'SMS Cart Abandonment Recovery',
    hypothesis: 'If we add SMS as a cart abandonment recovery channel alongside email, then cart recovery rate will increase because SMS has 98% open rates vs 20% for email.',
    status: 'RUNNING', channel: 'email', primaryMetric: 'revenue',
    targetLift: 30, impact: 7, confidence: 6, ease: 7, daysRunning: 7,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: 1200, metricTrend: 15,
  },

  // ── BACKLOG (2) ────────────────────────────────────────────
  {
    name: 'Loyalty Program Launch',
    hypothesis: 'If we launch a points-based loyalty program with tiered rewards, then D90 retention will improve by 8+ pp because customers will have financial incentive to repurchase.',
    status: 'BACKLOG', channel: null, primaryMetric: 'retention',
    targetLift: 8, impact: 9, confidence: 5, ease: 3, daysRunning: null,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: null, metricTrend: null,
  },
  {
    name: 'Influencer Partnership Program',
    hypothesis: 'If we partner with 10 micro-influencers ($5K each) on commission-based deals, then affiliate revenue will grow 40% because influencer endorsements drive high-trust traffic.',
    status: 'BACKLOG', channel: 'affiliate', primaryMetric: 'revenue',
    targetLift: 40, impact: 7, confidence: 4, ease: 4, daysRunning: null,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: null, metricTrend: null,
  },

  // ── IDEA (3) ───────────────────────────────────────────────
  {
    name: 'Subscription Box Offering',
    hypothesis: 'If we offer a curated monthly subscription box at a 15% discount, then LTV will increase because subscriptions lock in recurring revenue and increase purchase frequency.',
    status: 'IDEA', channel: null, primaryMetric: 'ltv',
    targetLift: 25, impact: 9, confidence: 4, ease: 3, daysRunning: null,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: null, metricTrend: null,
  },
  {
    name: 'Referral Program',
    hypothesis: 'If we implement a "give $10, get $10" referral program, then organic customer acquisition will increase because word-of-mouth from existing customers has the lowest CAC.',
    status: 'IDEA', channel: null, primaryMetric: 'revenue',
    targetLift: 15, impact: 8, confidence: 5, ease: 4, daysRunning: null,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: null, metricTrend: null,
  },
  {
    name: 'AI-Powered Product Recommendations',
    hypothesis: 'If we replace manual "you may also like" with ML-based recommendations, then AOV will increase because personalized suggestions surface higher-relevance cross-sells.',
    status: 'IDEA', channel: null, primaryMetric: 'aov',
    targetLift: 8, impact: 7, confidence: 4, ease: 3, daysRunning: null,
    result: null, learnings: null, nextSteps: null,
    metricBaseline: null, metricTrend: null,
  },

  // ── ARCHIVED (2) ───────────────────────────────────────────
  {
    name: 'Facebook Carousel Ads A/B Test',
    hypothesis: 'If we test carousel ads vs single-image ads on Meta, then CTR will increase because carousels allow showcasing multiple products and drive higher engagement.',
    status: 'ARCHIVED', channel: 'meta', primaryMetric: 'cac',
    targetLift: 15, impact: 5, confidence: 7, ease: 8, daysRunning: 14,
    result: 'Carousel CTR was 1.8% vs 1.6% for single image — a 12.5% lift. However, CPA was flat because carousel clicks had lower purchase intent. No meaningful CAC impact.',
    learnings: 'Carousel ads drive higher CTR but don\'t necessarily improve downstream conversion. Single-image with strong CTA outperforms on CPA. Carousel works better for retargeting than prospecting.',
    nextSteps: 'Archived — learnings folded into UGC Video experiment which showed much stronger results. Use carousels only for retargeting catalog ads.',
    metricBaseline: 42, metricTrend: -0.05,
    controlName: 'Single Image Ad', variantName: 'Carousel Ad',
    controlSampleSize: 10000, variantSampleSize: 10000,
    controlConversions: 160, variantConversions: 180,
  },
  {
    name: 'Exit-Intent Popup Discount',
    hypothesis: 'If we show a 10% discount popup when users attempt to leave the site, then bounce rate will decrease and conversion will increase because the discount creates urgency.',
    status: 'ARCHIVED', channel: null, primaryMetric: 'conversion_rate',
    targetLift: 10, impact: 4, confidence: 6, ease: 9, daysRunning: 14,
    result: 'Popup triggered for 22% of sessions. Of those, 8% claimed the code. Overall CVR unchanged — popup users who converted would have converted anyway (based on holdout analysis). Negative brand impact from survey feedback.',
    learnings: 'Exit-intent popups erode brand perception for premium products. Discount cannibalization is real — most claimers were already in purchase flow. Better to invest in value messaging than panic discounts.',
    nextSteps: 'Archived — popup removed. Focus on improving the shopping experience rather than interrupting exits.',
    metricBaseline: 0.021, metricTrend: 0.0001,
    controlName: 'No Popup', variantName: 'Exit-Intent 10% Off',
    controlSampleSize: 14000, variantSampleSize: 14000,
    controlConversions: 294, variantConversions: 287,
  },
];

export async function seedDemoExperiments(): Promise<number> {
  const now = new Date();
  let count = 0;

  // Inline A/B stats computation (same formulas as apps/api/src/lib/ab-stats.ts)
  function round4(n: number): number { return Math.round(n * 10000) / 10000; }
  function normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
    return round4(0.5 * (1.0 + sign * y));
  }
  function computeAB(nC: number, nV: number, xC: number, xV: number) {
    const controlRate = xC / nC;
    const variantRate = xV / nV;
    const absoluteLift = variantRate - controlRate;
    const relativeLift = controlRate > 0 ? absoluteLift / controlRate : 0;
    const pooledP = (xC + xV) / (nC + nV);
    const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1 / nC + 1 / nV));
    const zScore = pooledSE > 0 ? absoluteLift / pooledSE : 0;
    const pValue = pooledSE > 0 ? round4(2 * (1 - normalCDF(Math.abs(zScore)))) : 1;
    const confidenceLevel = round4(1 - pValue);
    const isSignificant = pValue < 0.05;
    const unpooledSE = Math.sqrt((controlRate * (1 - controlRate)) / nC + (variantRate * (1 - variantRate)) / nV);
    const margin = 1.96 * unpooledSE;
    const confidenceInterval = { lower: round4(absoluteLift - margin), upper: round4(absoluteLift + margin) };
    const verdict = !isSignificant ? 'INCONCLUSIVE' : absoluteLift > 0 ? 'WINNER' : 'LOSER';
    return { controlRate: round4(controlRate), variantRate: round4(variantRate), absoluteLift: round4(absoluteLift), relativeLift: round4(relativeLift), pValue, confidenceLevel, isSignificant, confidenceInterval, verdict };
  }

  for (const exp of DEMO_EXPERIMENTS) {
    const iceScore = Math.round((exp.impact * exp.confidence * exp.ease / 10) * 100) / 100;

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (exp.daysRunning != null) {
      if (exp.status === 'COMPLETED' || exp.status === 'ARCHIVED') {
        endDate = new Date(now);
        endDate.setUTCDate(endDate.getUTCDate() - (exp.status === 'ARCHIVED' ? 14 : 3));
        startDate = new Date(endDate);
        startDate.setUTCDate(startDate.getUTCDate() - exp.daysRunning);
      } else if (exp.status === 'RUNNING') {
        startDate = new Date(now);
        startDate.setUTCDate(startDate.getUTCDate() - exp.daysRunning);
      }
    }

    const created = await prisma.experiment.create({
      data: {
        name: exp.name,
        hypothesis: exp.hypothesis,
        status: exp.status,
        channel: exp.channel,
        primaryMetric: exp.primaryMetric,
        targetLift: exp.targetLift,
        impact: exp.impact,
        confidence: exp.confidence,
        ease: exp.ease,
        iceScore,
        startDate,
        endDate,
        result: exp.result,
        learnings: exp.learnings,
        nextSteps: exp.nextSteps,
        // A/B test data (when present)
        ...(exp.controlSampleSize != null && exp.variantSampleSize != null &&
            exp.controlConversions != null && exp.variantConversions != null ? {
          controlName: exp.controlName ?? 'Control',
          variantName: exp.variantName ?? 'Variant',
          controlSampleSize: exp.controlSampleSize,
          variantSampleSize: exp.variantSampleSize,
          controlConversions: exp.controlConversions,
          variantConversions: exp.variantConversions,
          ...computeAB(exp.controlSampleSize, exp.variantSampleSize, exp.controlConversions, exp.variantConversions),
        } : {}),
      },
    });

    // Generate metric series for experiments that ran
    if (exp.metricBaseline != null && exp.metricTrend != null && exp.daysRunning != null && startDate) {
      const series = generateMetricSeries(exp.metricBaseline, exp.metricTrend, exp.daysRunning, startDate);
      for (const point of series) {
        await prisma.experimentMetric.create({
          data: {
            experimentId: created.id,
            date: point.date,
            metricName: exp.primaryMetric,
            value: point.value,
          },
        });
      }
    }

    count++;
  }

  return count;
}
