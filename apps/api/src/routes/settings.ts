// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma, isDemoMode, setMode, encrypt, decrypt, getAppSetting, setAppSetting } from '@growth-os/database';
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

    return {
      mode: demoMode ? 'demo' : 'live',
      data: {
        hasDemoData: !!demoJob,
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
    try {
      await setMode('demo');
      // Clear old data first to prevent stale records from persisting
      // (the demo pipeline uses upsert, so surplus old orders would remain)
      await clearAllData();
      // Import and run the demo pipeline dynamically
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('pnpm --filter @growth-os/etl demo', {
        cwd: '/app',
        env: { ...process.env, DEMO_MODE: 'true' },
        timeout: 300_000, // 5 min max
      });
      return {
        success: true,
        message: 'Demo data seeded successfully.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
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
