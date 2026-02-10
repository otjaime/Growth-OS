// ──────────────────────────────────────────────────────────────
// Growth OS — ETL Shared Types
// ──────────────────────────────────────────────────────────────

export interface ConnectorConfig {
  source: string;
  isDemoMode: boolean;
}

export interface ShopifyConfig extends ConnectorConfig {
  source: 'shopify';
  shopDomain: string;
  accessToken: string;
}

export interface MetaConfig extends ConnectorConfig {
  source: 'meta';
  accessToken: string;
  adAccountId: string;
}

export interface GoogleAdsConfig extends ConnectorConfig {
  source: 'google_ads';
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  customerId: string;
  developerToken: string;
  managerAccountId?: string;
}

export interface GA4Config extends ConnectorConfig {
  source: 'ga4';
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  propertyId: string;
}

export interface RawRecord {
  source: string;
  entity: string;
  externalId?: string;
  cursor?: string;
  payload: Record<string, unknown>;
}

export interface SyncResult {
  source: string;
  entity: string;
  rowsLoaded: number;
  cursor?: string;
  errors: string[];
}

export interface ChannelMapping {
  slug: string;
  name: string;
}

/** Category margin assumptions for COGS estimation */
export const CATEGORY_MARGINS: Record<string, number> = {
  apparel: 0.55,
  electronics: 0.30,
  beauty: 0.65,
  home: 0.50,
  food: 0.40,
  default: 0.45,
};

/** Shipping cost as % of revenue */
export const SHIPPING_COST_RATE = 0.08;

/** Ops cost as % of revenue (fulfillment, packaging, etc.) */
export const OPS_COST_RATE = 0.05;
