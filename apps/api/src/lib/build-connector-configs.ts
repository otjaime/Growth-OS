import { prisma, decrypt } from '@growth-os/database';
import type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config } from '@growth-os/etl';

export interface ConnectorConfigs {
  shopify?: ShopifyConfig;
  meta?: MetaConfig;
  googleAds?: GoogleAdsConfig;
  ga4?: GA4Config;
}

export async function buildConnectorConfigsFromDB(demoMode: boolean): Promise<ConnectorConfigs> {
  const credentials = await prisma.connectorCredential.findMany();
  const configs: ConnectorConfigs = {};

  for (const cred of credentials) {
    let decrypted: Record<string, string> = {};
    try {
      decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
    } catch {
      continue; // skip credentials that can't be decrypted
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
          clientId: process.env.GOOGLE_CLIENT_ID ?? meta.clientId ?? '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
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
          clientId: process.env.GOOGLE_CLIENT_ID ?? meta.clientId ?? '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          propertyId: meta.propertyId ?? '',
        };
        break;
    }
  }

  return configs;
}
