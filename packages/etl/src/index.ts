export { ingestRaw, normalizeStaging, buildMarts, validateData, mapChannelFromOrder, mapGA4ChannelToSlug } from './pipeline/index.js';
export { generateAllDemoData, fetchShopifyOrders, fetchShopifyCustomers, fetchMetaInsights, fetchGoogleAdsInsights, fetchGA4Traffic } from './connectors/index.js';
export * as kpis from './kpis.js';
export { evaluateAlerts } from './alerts.js';
export type { Alert, AlertInput } from './alerts.js';
export type { ValidationResult } from './pipeline/validate.js';
export type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config, RawRecord } from './types.js';
