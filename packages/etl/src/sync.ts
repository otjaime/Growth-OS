// ──────────────────────────────────────────────────────────────
// Growth OS — Sync Runner (real mode)
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { ingestRaw } from './pipeline/step1-ingest-raw.js';
import { normalizeStaging } from './pipeline/step2-normalize-staging.js';
import { buildMarts } from './pipeline/step3-build-marts.js';
import { fetchShopifyOrders, fetchShopifyCustomers } from './connectors/shopify.js';
import { fetchMetaInsights } from './connectors/meta.js';
import { fetchGoogleAdsInsights } from './connectors/google-ads.js';
import { fetchGA4Traffic } from './connectors/ga4.js';
import { createLogger } from './logger.js';
import type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config } from './types.js';

const log = createLogger('sync');
const isDemoMode = process.env.DEMO_MODE === 'true';

async function runSync() {
  log.info({ isDemoMode }, '🔄 Starting sync');
  const startTime = Date.now();

  const jobRun = await prisma.jobRun.create({
    data: { jobName: isDemoMode ? 'demo_sync' : 'real_sync', status: 'RUNNING' },
  });

  try {
    const allRecords = [];

    // Shopify
    const shopifyConfig: ShopifyConfig = {
      source: 'shopify',
      isDemoMode,
      shopDomain: process.env.SHOPIFY_SHOP_DOMAIN ?? '',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN ?? '',
    };
    const shopifyOrders = await fetchShopifyOrders(shopifyConfig);
    const shopifyCustomers = await fetchShopifyCustomers(shopifyConfig);
    allRecords.push(...shopifyOrders.records, ...shopifyCustomers.records);

    // Meta
    const metaConfig: MetaConfig = {
      source: 'meta',
      isDemoMode,
      accessToken: process.env.META_ACCESS_TOKEN ?? '',
      adAccountId: process.env.META_AD_ACCOUNT_ID ?? '',
    };
    const metaInsights = await fetchMetaInsights(metaConfig);
    allRecords.push(...metaInsights.records);

    // Google Ads
    const googleAdsConfig: GoogleAdsConfig = {
      source: 'google_ads',
      isDemoMode,
      accessToken: '',
      refreshToken: '',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? '',
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    };
    const gadsInsights = await fetchGoogleAdsInsights(googleAdsConfig);
    allRecords.push(...gadsInsights.records);

    // GA4
    const ga4Config: GA4Config = {
      source: 'ga4',
      isDemoMode,
      accessToken: '',
      refreshToken: '',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      propertyId: process.env.GA4_PROPERTY_ID ?? '',
    };
    const ga4Traffic = await fetchGA4Traffic(ga4Config);
    allRecords.push(...ga4Traffic.records);

    // Ingest + Transform
    const rowsLoaded = await ingestRaw(allRecords);
    await normalizeStaging();
    await buildMarts();

    const durationMs = Date.now() - startTime;
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        rowsLoaded,
        durationMs,
      },
    });

    log.info({ rowsLoaded, durationMs }, '✅ Sync complete');
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        durationMs,
        errorJson: { message: String(error) },
      },
    });
    log.error({ error }, '❌ Sync failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSync();
