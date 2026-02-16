// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma, isDemoMode, setMode, encrypt, decrypt, getAppSetting, setAppSetting } from '@growth-os/database';
import { generateAllDemoData, ingestRaw, normalizeStaging, buildMarts, validateData, computeGrowthModel, DEMO_SCENARIOS } from '@growth-os/etl';
import { isSlackConfigured, sendTestSlackMessage } from '../lib/slack.js';

async function clearAllData() {
  return prisma.$transaction([
    prisma.suggestionFeedback.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.experimentMetric.deleteMany(),
    prisma.experiment.deleteMany(),
    prisma.growthScenario.deleteMany(),
    prisma.rawEvent.deleteMany(),
    prisma.factEmail.deleteMany(),
    prisma.factOrder.deleteMany(),
    prisma.factSpend.deleteMany(),
    prisma.factTraffic.deleteMany(),
    prisma.cohort.deleteMany(),
    prisma.dimCustomer.deleteMany(),
    prisma.dimCampaign.deleteMany(),
    prisma.stgEmail.deleteMany(),
    prisma.stgOrder.deleteMany(),
    prisma.stgCustomer.deleteMany(),
    prisma.stgSpend.deleteMany(),
    prisma.stgTraffic.deleteMany(),
    prisma.jobRun.deleteMany(),
  ]);
}

async function seedDimensions(): Promise<void> {
  const channels = [
    { slug: 'meta', name: 'Meta Ads' },
    { slug: 'google', name: 'Google Ads' },
    { slug: 'tiktok', name: 'TikTok Ads' },
    { slug: 'email', name: 'Email' },
    { slug: 'organic', name: 'Organic' },
    { slug: 'affiliate', name: 'Affiliate' },
    { slug: 'direct', name: 'Direct' },
    { slug: 'other', name: 'Other' },
  ];
  for (const ch of channels) {
    await prisma.dimChannel.upsert({
      where: { slug: ch.slug },
      update: { name: ch.name },
      create: ch,
    });
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2026-12-31');
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateOnly = new Date(current.toISOString().split('T')[0]! + 'T00:00:00Z');
    const dayOfWeek = current.getUTCDay();
    const d = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    await prisma.dimDate.upsert({
      where: { date: dateOnly },
      update: {},
      create: {
        date: dateOnly,
        dayOfWeek,
        dayName: dayNames[dayOfWeek]!,
        week,
        month: current.getUTCMonth() + 1,
        monthName: monthNames[current.getUTCMonth()]!,
        quarter: Math.floor(current.getUTCMonth() / 3) + 1,
        year: current.getUTCFullYear(),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      },
    });
    current.setDate(current.getDate() + 1);
  }
}

// ── Demo Experiments ──────────────────────────────────────────

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

async function seedDemoExperiments(): Promise<number> {
  const now = new Date();

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

  const experiments: DemoExp[] = [
    // COMPLETED (5)
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
    // RUNNING (3)
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
    // BACKLOG (2)
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
    // IDEA (3)
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
  ];

  let count = 0;

  for (const exp of experiments) {
    const iceScore = Math.round((exp.impact * exp.confidence * exp.ease / 10) * 100) / 100;

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (exp.daysRunning != null) {
      if (exp.status === 'COMPLETED') {
        endDate = new Date(now);
        endDate.setUTCDate(endDate.getUTCDate() - 3); // completed 3 days ago
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

    // Generate metric series for COMPLETED and RUNNING experiments
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

export async function settingsRoutes(app: FastifyInstance) {
  // ── GET /settings/mode — current mode + data overview ──────
  app.get('/settings/mode', async () => {
    const demoMode = await isDemoMode();

    // Demo data comes from job_name='demo_ingest' job runs
    const demoJob = await prisma.jobRun.findFirst({
      where: { jobName: 'demo_ingest' },
      orderBy: { startedAt: 'desc' },
    });

    const [totalEvents, orders, spend, traffic] = await Promise.all([
      prisma.rawEvent.count(),
      prisma.factOrder.count(),
      prisma.factSpend.count(),
      prisma.factTraffic.count(),
    ]);

    const hasData = orders > 0;

    return {
      mode: demoMode ? 'demo' : 'live',
      data: {
        hasDemoData: !!demoJob,
        hasData,
        needsSeed: demoMode && !hasData,
        totalEvents,
        marts: { orders, spend, traffic },
      },
    };
  });

  // ── POST /settings/mode — switch between demo / live ───────
  app.post<{ Body: { mode: string } }>('/settings/mode', async (req) => {
    const { mode } = req.body ?? {};

    if (mode === 'demo') {
      await setMode('demo');
      return {
        success: true,
        mode: 'demo',
        message: 'Switched to demo mode. Dashboard shows sample data.',
      };
    }

    if (mode === 'live') {
      const wasDemoMode = await isDemoMode();
      await setMode('live');

      if (wasDemoMode) {
        // Clear demo data to prevent mixing with real data
        const [rawDeleted] = await clearAllData();
        return {
          success: true,
          mode: 'live',
          message: `Switched to live mode. Cleared ${rawDeleted.count} demo records. Click Sync on your connections to fetch real data.`,
          dataCleared: true,
        };
      }

      return {
        success: true,
        mode: 'live',
        message: 'Switched to live mode.',
        dataCleared: false,
      };
    }

    return { success: false, message: 'Invalid mode. Use "demo" or "live".' };
  });

  // ── POST /settings/clear-data — purge ALL data (demo + real) ──
  app.post('/settings/clear-data', async () => {
    const [rawDeleted] = await clearAllData();
    return {
      success: true,
      message: `Cleared all data (${rawDeleted.count} raw events + all marts). Ready for fresh sync.`,
      deletedEvents: rawDeleted.count,
    };
  });

  // ── POST /settings/seed-demo — run demo pipeline ──────────
  app.post('/settings/seed-demo', async () => {
    const startTime = Date.now();
    let jobRun: { id: string } | null = null;

    try {
      await setMode('demo');
      await clearAllData();

      // Seed dimensions (channels + dates) — required before pipeline
      await seedDimensions();

      // Generate demo data
      const demoData = generateAllDemoData();
      const allRecords = [
        ...demoData.orders,
        ...demoData.customers,
        ...demoData.metaInsights,
        ...demoData.googleAdsInsights,
        ...demoData.ga4Traffic,
        ...demoData.tiktokInsights,
        ...demoData.klaviyoCampaigns,
        ...demoData.klaviyoFlows,
        ...demoData.stripeCharges,
        ...demoData.stripeRefunds,
      ];

      // Create job run so Jobs page shows this execution
      jobRun = await prisma.jobRun.create({
        data: { jobName: 'demo_ingest', status: 'RUNNING' },
      });

      // Run the 3-step ETL pipeline
      const rowsLoaded = await ingestRaw(allRecords);
      await normalizeStaging();
      await buildMarts();

      // Validate
      const validationResults = await validateData();
      const allPassed = validationResults.every((r: { passed: boolean }) => r.passed);

      // Seed demo growth scenarios
      for (const scenario of DEMO_SCENARIOS) {
        const modelOutput = computeGrowthModel(scenario.input);
        await prisma.growthScenario.create({
          data: {
            name: scenario.name,
            description: scenario.description,
            isBaseline: scenario.isBaseline,
            ...scenario.input,
            projectedRevenue: modelOutput.projectedRevenue,
            projectedOrders: modelOutput.projectedOrders,
            projectedCustomers: modelOutput.projectedCustomers,
            projectedRoas: modelOutput.projectedRoas,
            projectedMer: modelOutput.projectedMer,
            projectedLtv: modelOutput.projectedLtv,
            projectedContributionMargin: modelOutput.projectedContributionMargin,
            breakEvenMonth: modelOutput.breakEvenMonth,
          },
        });
      }

      // Seed demo experiments
      const experimentsSeeded = await seedDemoExperiments();

      const durationMs = Date.now() - startTime;

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: allPassed ? 'SUCCESS' : 'FAILED',
          finishedAt: new Date(),
          rowsLoaded,
          durationMs,
          errorJson: allPassed
            ? undefined
            : (validationResults.filter((r: { passed: boolean }) => !r.passed).map((r: { message: string }) => r.message) as unknown as string),
        },
      });

      return {
        success: true,
        message: `Demo data seeded successfully in ${(durationMs / 1000).toFixed(1)}s (${experimentsSeeded} experiments).`,
        rowsLoaded,
        durationMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // Mark job as failed if it was created
      if (jobRun) {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - startTime,
            errorJson: message as unknown as string,
          },
        }).catch(() => { /* ignore update failure */ });
      }
      return { success: false, message: `Demo seed failed: ${message}` };
    }
  });

  // ── GET /settings/google-oauth — check if Google OAuth is configured ──
  app.get('/settings/google-oauth', async () => {
    const clientId = (await getAppSetting('google_client_id')) ?? process.env.GOOGLE_CLIENT_ID ?? '';
    const secretJson = await getAppSetting('google_client_secret');
    let hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    if (secretJson) {
      try {
        const parsed = JSON.parse(secretJson) as { encrypted: string; iv: string; authTag: string };
        const val = decrypt(parsed.encrypted, parsed.iv, parsed.authTag);
        hasSecret = val.length > 0;
      } catch {
        hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
      }
    }
    const redirectUri = (await getAppSetting('google_redirect_uri')) ?? process.env.GOOGLE_REDIRECT_URI ?? '';

    return {
      configured: clientId.length > 0 && hasSecret,
      clientId,
      hasSecret,
      redirectUri,
    };
  });

  // ── POST /settings/google-oauth — save Google OAuth credentials ──
  app.post<{ Body: { clientId: string; clientSecret: string; redirectUri?: string } }>(
    '/settings/google-oauth',
    async (req) => {
      const { clientId, clientSecret, redirectUri } = req.body ?? {};
      if (!clientId || !clientSecret) {
        return { success: false, message: 'Client ID and Client Secret are required.' };
      }

      await setAppSetting('google_client_id', clientId);
      const { encrypted, iv, authTag } = encrypt(clientSecret);
      await setAppSetting('google_client_secret', JSON.stringify({ encrypted, iv, authTag }));
      if (redirectUri) {
        await setAppSetting('google_redirect_uri', redirectUri);
      }

      return {
        success: true,
        message: 'Google OAuth credentials saved. You can now connect Google Ads and GA4.',
      };
    },
  );

  // ── GET /settings/slack — check Slack integration status ──
  app.get('/settings/slack', async () => {
    return { configured: isSlackConfigured() };
  });

  // ── POST /settings/slack/test — send a test Slack message ──
  app.post('/settings/slack/test', async () => {
    if (!isSlackConfigured()) {
      return {
        success: false,
        message: 'Slack is not configured. Set SLACK_WEBHOOK_URL environment variable.',
      };
    }

    const sent = await sendTestSlackMessage();
    return {
      success: sent,
      message: sent
        ? 'Test message sent to Slack successfully.'
        : 'Failed to send test message. Check your webhook URL.',
    };
  });
}
