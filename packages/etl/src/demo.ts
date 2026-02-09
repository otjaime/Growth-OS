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
    }, 'Demo data generated');

    // Step 2: Ingest raw
    log.info('Step 2: Ingesting raw data...');
    const allRecords = [
      ...demoData.orders,
      ...demoData.customers,
      ...demoData.metaInsights,
      ...demoData.googleAdsInsights,
      ...demoData.ga4Traffic,
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
          ? null
          : validationResults.filter((r) => !r.passed).map((r) => r.message),
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

async function seedDimensions() {
  // Seed channels
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
