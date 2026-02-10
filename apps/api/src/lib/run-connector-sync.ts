import { prisma, isDemoMode } from '@growth-os/database';
import {
  ingestRaw,
  normalizeStaging,
  buildMarts,
  fetchShopifyOrders,
  fetchShopifyCustomers,
  fetchMetaInsights,
  fetchGoogleAdsInsights,
  fetchGA4Traffic,
  generateAllDemoData,
} from '@growth-os/etl';
import type { RawRecord } from '@growth-os/etl';
import { buildConnectorConfigsFromDB } from './build-connector-configs.js';

export async function runConnectorSync(connectorType: string): Promise<{ rowsLoaded: number }> {
  const demoMode = await isDemoMode();

  if (demoMode) {
    const data = generateAllDemoData();
    const all: RawRecord[] = [
      ...data.orders,
      ...data.customers,
      ...data.metaInsights,
      ...data.googleAdsInsights,
      ...data.ga4Traffic,
    ];
    const rowsLoaded = await ingestRaw(all);
    await normalizeStaging();
    await buildMarts();
    return { rowsLoaded };
  }

  const configs = await buildConnectorConfigsFromDB(false);
  const allRecords: RawRecord[] = [];

  if (connectorType === 'shopify' && configs.shopify) {
    const orders = await fetchShopifyOrders(configs.shopify);
    const customers = await fetchShopifyCustomers(configs.shopify);
    allRecords.push(...orders.records, ...customers.records);
  } else if (connectorType === 'meta_ads' && configs.meta) {
    const insights = await fetchMetaInsights(configs.meta);
    allRecords.push(...insights.records);
  } else if (connectorType === 'google_ads' && configs.googleAds) {
    const insights = await fetchGoogleAdsInsights(configs.googleAds);
    allRecords.push(...insights.records);
  } else if (connectorType === 'ga4' && configs.ga4) {
    const traffic = await fetchGA4Traffic(configs.ga4);
    allRecords.push(...traffic.records);
  }

  if (allRecords.length === 0) {
    return { rowsLoaded: 0 };
  }

  const rowsLoaded = await ingestRaw(allRecords);
  await normalizeStaging();
  await buildMarts();

  return { rowsLoaded };
}

export async function runFullSync(): Promise<{ rowsLoaded: number }> {
  const demoMode = await isDemoMode();

  if (demoMode) {
    const data = generateAllDemoData();
    const all: RawRecord[] = [
      ...data.orders,
      ...data.customers,
      ...data.metaInsights,
      ...data.googleAdsInsights,
      ...data.ga4Traffic,
    ];
    const rowsLoaded = await ingestRaw(all);
    await normalizeStaging();
    await buildMarts();
    return { rowsLoaded };
  }

  const configs = await buildConnectorConfigsFromDB(false);
  const allRecords: RawRecord[] = [];

  if (configs.shopify) {
    const orders = await fetchShopifyOrders(configs.shopify);
    const customers = await fetchShopifyCustomers(configs.shopify);
    allRecords.push(...orders.records, ...customers.records);
  }

  if (configs.meta) {
    const insights = await fetchMetaInsights(configs.meta);
    allRecords.push(...insights.records);
  }

  if (configs.googleAds) {
    const insights = await fetchGoogleAdsInsights(configs.googleAds);
    allRecords.push(...insights.records);
  }

  if (configs.ga4) {
    const traffic = await fetchGA4Traffic(configs.ga4);
    allRecords.push(...traffic.records);
  }

  if (allRecords.length === 0) {
    return { rowsLoaded: 0 };
  }

  const rowsLoaded = await ingestRaw(allRecords);
  await normalizeStaging();
  await buildMarts();

  return { rowsLoaded };
}
