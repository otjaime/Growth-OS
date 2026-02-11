import { prisma, decrypt } from '@growth-os/database';
import type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config } from '@growth-os/etl';
import { getGoogleOAuthConfig } from './google-oauth-config.js';

export interface ConnectorConfigs {
  shopify?: ShopifyConfig;
  meta?: MetaConfig;
  googleAds?: GoogleAdsConfig;
  ga4?: GA4Config;
}

export async function buildConnectorConfigsFromDB(demoMode: boolean): Promise<ConnectorConfigs> {
  const credentials = await prisma.connectorCredential.findMany();
  const configs: ConnectorConfigs = {};
  const googleOAuth = await getGoogleOAuthConfig();

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
          adAccountId: ((meta.adAccountId as string) ?? '').trim(),
        };
        break;

      case 'google_ads':
        configs.googleAds = {
          source: 'google_ads',
          isDemoMode: demoMode,
          accessToken: decrypted.accessToken ?? '',
          refreshToken: decrypted.refreshToken ?? '',
          clientId: googleOAuth.clientId || meta.clientId || '',
          clientSecret: googleOAuth.clientSecret,
          customerId: (meta.customerId ?? '').toString().trim().replace(/-/g, ''),
          developerToken: (decrypted.developerToken ?? process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim(),
          managerAccountId: ((meta.managerAccountId as string) ?? '').trim(),
        };
        break;

      case 'ga4':
        configs.ga4 = {
          source: 'ga4',
          isDemoMode: demoMode,
          accessToken: decrypted.accessToken ?? '',
          refreshToken: decrypted.refreshToken ?? '',
          clientId: googleOAuth.clientId || meta.clientId || '',
          clientSecret: googleOAuth.clientSecret,
          propertyId: meta.propertyId ?? '',
        };
        break;
    }
  }

  return configs;
}
