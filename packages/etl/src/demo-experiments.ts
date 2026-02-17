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
  },
];

export async function seedDemoExperiments(): Promise<number> {
  const now = new Date();
  let count = 0;

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
