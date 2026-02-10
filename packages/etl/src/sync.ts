// ──────────────────────────────────────────────────────────────
// Growth OS — Sync Runner (real mode)
// Reads credentials from DB when available, falls back to env vars
// ──────────────────────────────────────────────────────────────

import { prisma, isDemoMode, decrypt, getAppSetting } from '@growth-os/database';
import { ingestRaw } from './pipeline/step1-ingest-raw.js';
import { normalizeStaging } from './pipeline/step2-normalize-staging.js';
import { buildMarts } from './pipeline/step3-build-marts.js';
import { fetchShopifyOrders, fetchShopifyCustomers } from './connectors/shopify.js';
import { fetchMetaInsights } from './connectors/meta.js';
import { fetchGoogleAdsInsights } from './connectors/google-ads.js';
import { fetchGA4Traffic } from './connectors/ga4.js';
import { createLogger } from './logger.js';
import type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config, RawRecord } from './types.js';

const log = createLogger('sync');

async function getGoogleClientSecret(): Promise<string> {
  const secretJson = await getAppSetting('google_client_secret');
  if (secretJson) {
    try {
      const parsed = JSON.parse(secretJson) as { encrypted: string; iv: string; authTag: string };
      return decrypt(parsed.encrypted, parsed.iv, parsed.authTag);
    } catch { /* fall through */ }
  }
  return process.env.GOOGLE_CLIENT_SECRET ?? '';
}

async function buildConfigsFromDB(demoMode: boolean) {
  const credentials = await prisma.connectorCredential.findMany();
  const configs: {
    shopify?: ShopifyConfig;
    meta?: MetaConfig;
    googleAds?: GoogleAdsConfig;
    ga4?: GA4Config;
  } = {};

  const googleClientId = (await getAppSetting('google_client_id')) ?? process.env.GOOGLE_CLIENT_ID ?? '';
  const googleClientSecret = await getGoogleClientSecret();

  for (const cred of credentials) {
    let decrypted: Record<string, string> = {};
    try {
      decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
    } catch {
      log.warn({ connectorType: cred.connectorType }, 'Failed to decrypt credentials, skipping');
      continue;
    }
    const meta = (cred.metadata ?? {}) as Record<string, string>;

    switch (cred.connectorType) {
      case 'shopify':
        configs.shopify = {
          source: 'shopify',
          isDemoMode: demoMode,
          shopDomain: meta.shopDomain ?? '',
          accessToken: decrypted.accessToken ?? '',
        };
        break;
      case 'meta_ads':
        configs.meta = {
          source: 'meta',
          isDemoMode: demoMode,
          accessToken: decrypted.accessToken ?? '',
          adAccountId: meta.adAccountId ?? '',
        };
        break;
      case 'google_ads':
        configs.googleAds = {
          source: 'google_ads',
          isDemoMode: demoMode,
          accessToken: decrypted.accessToken ?? '',
          refreshToken: decrypted.refreshToken ?? '',
          clientId: googleClientId || meta.clientId || '',
          clientSecret: googleClientSecret,
          customerId: (meta.customerId ?? '').replace(/-/g, ''),
          developerToken: decrypted.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        };
        break;
      case 'ga4':
        configs.ga4 = {
          source: 'ga4',
          isDemoMode: demoMode,
          accessToken: decrypted.accessToken ?? '',
          refreshToken: decrypted.refreshToken ?? '',
          clientId: googleClientId || meta.clientId || '',
          clientSecret: googleClientSecret,
          propertyId: meta.propertyId ?? '',
        };
        break;
    }
  }

  return configs;
}

function buildConfigsFromEnv(demoMode: boolean) {
  return {
    shopify: {
      source: 'shopify' as const,
      isDemoMode: demoMode,
      shopDomain: process.env.SHOPIFY_SHOP_DOMAIN ?? '',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN ?? '',
    },
    meta: {
      source: 'meta' as const,
      isDemoMode: demoMode,
      accessToken: process.env.META_ACCESS_TOKEN ?? '',
      adAccountId: process.env.META_AD_ACCOUNT_ID ?? '',
    },
    googleAds: {
      source: 'google_ads' as const,
      isDemoMode: demoMode,
      accessToken: '',
      refreshToken: '',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? '',
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    },
    ga4: {
      source: 'ga4' as const,
      isDemoMode: demoMode,
      accessToken: '',
      refreshToken: '',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      propertyId: process.env.GA4_PROPERTY_ID ?? '',
    },
  };
}

async function runSync() {
  const demoMode = await isDemoMode();
  log.info({ isDemoMode: demoMode }, 'Starting sync');
  const startTime = Date.now();

  const jobRun = await prisma.jobRun.create({
    data: { jobName: demoMode ? 'demo_sync' : 'real_sync', status: 'RUNNING' },
  });

  try {
    // Try DB credentials first, fall back to env vars
    const dbCredCount = await prisma.connectorCredential.count();
    const configs = dbCredCount > 0
      ? await buildConfigsFromDB(demoMode)
      : buildConfigsFromEnv(demoMode);

    const allRecords: RawRecord[] = [];

    // Shopify
    if (configs.shopify) {
      const shopifyOrders = await fetchShopifyOrders(configs.shopify);
      const shopifyCustomers = await fetchShopifyCustomers(configs.shopify);
      allRecords.push(...shopifyOrders.records, ...shopifyCustomers.records);
    }

    // Meta
    if (configs.meta) {
      const metaInsights = await fetchMetaInsights(configs.meta);
      allRecords.push(...metaInsights.records);
    }

    // Google Ads
    if (configs.googleAds) {
      const gadsInsights = await fetchGoogleAdsInsights(configs.googleAds);
      allRecords.push(...gadsInsights.records);
    }

    // GA4
    if (configs.ga4) {
      const ga4Traffic = await fetchGA4Traffic(configs.ga4);
      allRecords.push(...ga4Traffic.records);
    }

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

    log.info({ rowsLoaded, durationMs }, 'Sync complete');
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
    log.error({ error }, 'Sync failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSync();
