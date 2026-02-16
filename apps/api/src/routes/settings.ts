// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma, isDemoMode, setMode, encrypt, decrypt, getAppSetting, setAppSetting } from '@growth-os/database';
import { generateAllDemoData, ingestRaw, normalizeStaging, buildMarts, validateData } from '@growth-os/etl';
import { isSlackConfigured, sendTestSlackMessage } from '../lib/slack.js';

async function clearAllData() {
  return prisma.$transaction([
    prisma.suggestionFeedback.deleteMany(),
    prisma.suggestion.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.experimentMetric.deleteMany(),
    prisma.experiment.deleteMany(),
    prisma.rawEvent.deleteMany(),
    prisma.factOrder.deleteMany(),
    prisma.factSpend.deleteMany(),
    prisma.factTraffic.deleteMany(),
    prisma.cohort.deleteMany(),
    prisma.dimCustomer.deleteMany(),
    prisma.dimCampaign.deleteMany(),
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
        message: `Demo data seeded successfully in ${(durationMs / 1000).toFixed(1)}s.`,
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
