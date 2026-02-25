// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Mode Pipeline Runner
// Generates mock data, ingests through full pipeline, builds marts
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { generateAllDemoData } from './connectors/index.js';
import { ingestRaw } from './pipeline/step1-ingest-raw.js';
import { normalizeStaging } from './pipeline/step2-normalize-staging.js';
import { buildMarts } from './pipeline/step3-build-marts.js';
import { validateData } from './pipeline/validate.js';
import { seedDemoExperiments } from './demo-experiments.js';
import { seedDemoOpportunities } from './demo-opportunities.js';
import { createLogger } from './logger.js';

const log = createLogger('demo');

async function runDemo() {
  const startTime = Date.now();
  log.info('🚀 Starting demo mode pipeline');

  try {
    // Step 0: Seed dimensions (ensure dim_channel + dim_date exist)
    log.info('Step 0: Seeding dimensions...');
    await seedDimensions();

    // Step 1: Generate demo data
    log.info('Step 1: Generating demo data...');
    const demoData = generateAllDemoData();
    log.info({
      orders: demoData.orders.length,
      customers: demoData.customers.length,
      metaInsights: demoData.metaInsights.length,
      googleAdsInsights: demoData.googleAdsInsights.length,
      ga4Traffic: demoData.ga4Traffic.length,
      tiktokInsights: demoData.tiktokInsights.length,
      klaviyoCampaigns: demoData.klaviyoCampaigns.length,
      klaviyoFlows: demoData.klaviyoFlows.length,
      stripeCharges: demoData.stripeCharges.length,
      stripeRefunds: demoData.stripeRefunds.length,
    }, 'Demo data generated');

    // Step 2: Ingest raw
    log.info('Step 2: Ingesting raw data...');
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

    // Record job run
    const jobRun = await prisma.jobRun.create({
      data: { jobName: 'demo_ingest', status: 'RUNNING' },
    });

    const rowsLoaded = await ingestRaw(allRecords);

    // Step 3: Normalize staging
    log.info('Step 3: Normalizing to staging...');
    const stagingResult = await normalizeStaging();

    // Step 4: Build marts
    log.info('Step 4: Building marts...');
    const martResult = await buildMarts();

    // Step 5: Validate
    log.info('Step 5: Validating data...');
    const validationResults = await validateData();
    const allPassed = validationResults.every((r) => r.passed);

    // Step 6: Seed demo experiments (all 5 statuses)
    log.info('Step 6: Seeding demo experiments...');
    const experimentsSeeded = await seedDemoExperiments();
    log.info({ experimentsSeeded }, 'Demo experiments seeded');

    // Step 7: Seed demo opportunities & suggestions
    log.info('Step 7: Seeding demo opportunities...');
    const opportunitiesSeeded = await seedDemoOpportunities();
    log.info({ opportunitiesSeeded }, 'Demo opportunities seeded');

    // Step 8: Seed historical job runs for demo
    log.info('Step 8: Seeding demo job history...');
    await seedDemoJobRuns();

    // Update job run
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
          : (validationResults.filter((r) => !r.passed).map((r) => r.message) as unknown as string),
      },
    });

    log.info('═══════════════════════════════════════════');
    log.info('✅ Demo pipeline complete');
    log.info({
      rawRecords: rowsLoaded,
      staging: stagingResult,
      marts: martResult,
      duration: `${(durationMs / 1000).toFixed(1)}s`,
    });
    log.info('Validation results:');
    for (const v of validationResults) {
      log.info(`  ${v.passed ? '✅' : '❌'} ${v.check}: ${v.message}`);
    }
    log.info('═══════════════════════════════════════════');
  } catch (error) {
    log.error({ error }, '❌ Demo pipeline failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDemoJobRuns() {
  const now = new Date();

  const jobs = [
    {
      jobName: 'daily_sync',
      status: 'SUCCESS' as const,
      daysAgo: 1,
      durationMs: 34200,
      rowsLoaded: 1842,
    },
    {
      jobName: 'daily_sync',
      status: 'SUCCESS' as const,
      daysAgo: 2,
      durationMs: 31800,
      rowsLoaded: 1756,
    },
    {
      jobName: 'daily_sync',
      status: 'FAILED' as const,
      daysAgo: 5,
      durationMs: 8400,
      rowsLoaded: 0,
      error: 'Meta API rate limit exceeded — retry in 15 minutes',
    },
    {
      jobName: 'weekly_marts_rebuild',
      status: 'SUCCESS' as const,
      daysAgo: 3,
      durationMs: 92500,
      rowsLoaded: 14200,
    },
  ];

  for (const job of jobs) {
    const startedAt = new Date(now);
    startedAt.setUTCDate(startedAt.getUTCDate() - job.daysAgo);
    startedAt.setUTCHours(6, 0, 0, 0);
    const finishedAt = new Date(startedAt.getTime() + job.durationMs);

    await prisma.jobRun.create({
      data: {
        jobName: job.jobName,
        status: job.status,
        startedAt,
        finishedAt,
        durationMs: job.durationMs,
        rowsLoaded: job.rowsLoaded,
        errorJson: job.error ?? undefined,
      },
    });
  }
}

async function seedDimensions() {
  // Seed channels
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

  // Seed dim_date
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2026-12-31');
  const current = new Date(startDate);

  while (current <= endDate) {
    const dateOnly = new Date(current.toISOString().split('T')[0]! + 'T00:00:00Z');
    const dayOfWeek = current.getUTCDay();
    await prisma.dimDate.upsert({
      where: { date: dateOnly },
      update: {},
      create: {
        date: dateOnly,
        dayOfWeek,
        dayName: dayNames[dayOfWeek]!,
        week: getWeekNumber(current),
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

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

runDemo();
