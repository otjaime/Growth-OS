// ──────────────────────────────────────────────────────────────
// Growth OS — Meta Ads Sync Job
// Fetches ad-level creative data from Meta Marketing API
// and upserts into MetaAdAccount / MetaCampaign / MetaAdSet / MetaAd
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt, isDemoMode } from '@growth-os/database';
import { fetchMetaAdCreatives } from '@growth-os/etl';
import type { MetaAdCreativeConfig, MetaAdInsight } from '@growth-os/etl';

export interface SyncMetaAdsResult {
  accountsUpserted: number;
  campaignsUpserted: number;
  adSetsUpserted: number;
  adsUpserted: number;
  snapshotsUpserted: number;
  durationMs: number;
}

export async function syncMetaAds(organizationId: string): Promise<SyncMetaAdsResult> {
  const start = Date.now();

  // 1. Get Meta credentials for this org (fallback: any meta_ads cred if org-scoped fails)
  let credential = await prisma.connectorCredential.findFirst({
    where: { connectorType: 'meta_ads', organizationId },
  });
  if (!credential) {
    credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads' },
    });
    // Claim the orphaned credential for this org
    if (credential && !credential.organizationId) {
      await prisma.connectorCredential.update({
        where: { id: credential.id },
        data: { organizationId },
      });
    }
  }

  const demoMode = await isDemoMode();

  if (!credential && !demoMode) {
    throw new Error('No Meta Ads credentials found for this organization');
  }

  // Build config
  let config: MetaAdCreativeConfig;
  if (demoMode || !credential) {
    config = {
      source: 'meta',
      isDemoMode: true,
      accessToken: '',
      adAccountId: 'act_demo_123',
      organizationId,
    };
  } else {
    let decrypted: Record<string, string> = {};
    try {
      decrypted = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch {
      throw new Error('Failed to decrypt Meta Ads credentials');
    }
    const meta = (credential.metadata ?? {}) as Record<string, string>;
    const accessToken = decrypted.accessToken ?? '';
    const adAccountId = ((meta.adAccountId as string) ?? '').trim();

    if (!accessToken) {
      throw new Error(
        'Meta Ads access token is empty. Please reconnect Meta Ads in Data Connections.',
      );
    }
    if (!adAccountId) {
      throw new Error(
        'Meta Ads ad account ID is missing. Please reconnect Meta Ads and provide your Ad Account ID (e.g. act_123456789).',
      );
    }

    config = {
      source: 'meta',
      isDemoMode: false,
      accessToken,
      adAccountId,
      organizationId,
    };
  }

  // 2. Fetch ad-level data
  const result = await fetchMetaAdCreatives(config);

  // 3. Upsert MetaAdAccount
  const rawId = config.adAccountId.trim().replace(/^act_/, '');
  const adAccountId = `act_${rawId}`;
  const account = await prisma.metaAdAccount.upsert({
    where: {
      organizationId_adAccountId: { organizationId, adAccountId },
    },
    create: {
      organizationId,
      adAccountId,
      name: `Meta Ad Account (${adAccountId})`,
    },
    update: {
      updatedAt: new Date(),
    },
  });

  // 4. Upsert campaigns
  let campaignsUpserted = 0;
  const campaignIdMap = new Map<string, string>(); // externalId → internal id
  for (const camp of result.campaigns) {
    const record = await prisma.metaCampaign.upsert({
      where: {
        organizationId_campaignId: { organizationId, campaignId: camp.campaignId },
      },
      create: {
        organizationId,
        accountId: account.id,
        campaignId: camp.campaignId,
        name: camp.name,
        status: mapStatus(camp.status),
        objective: camp.objective,
        dailyBudget: camp.dailyBudget,
      },
      update: {
        name: camp.name,
        status: mapStatus(camp.status),
        objective: camp.objective,
        dailyBudget: camp.dailyBudget,
      },
    });
    campaignIdMap.set(camp.campaignId, record.id);
    campaignsUpserted++;
  }

  // 5. Upsert ad sets
  let adSetsUpserted = 0;
  const adSetIdMap = new Map<string, string>(); // externalId → internal id
  for (const adSet of result.adSets) {
    const internalCampaignId = campaignIdMap.get(adSet.campaignId);
    if (!internalCampaignId) continue;

    const record = await prisma.metaAdSet.upsert({
      where: {
        organizationId_adSetId: { organizationId, adSetId: adSet.adSetId },
      },
      create: {
        organizationId,
        accountId: account.id,
        campaignId: internalCampaignId,
        adSetId: adSet.adSetId,
        name: adSet.name,
        status: mapStatus(adSet.status),
        dailyBudget: adSet.dailyBudget,
        targetingJson: adSet.targeting as never,
      },
      update: {
        name: adSet.name,
        status: mapStatus(adSet.status),
        dailyBudget: adSet.dailyBudget,
        targetingJson: adSet.targeting as never,
      },
    });
    adSetIdMap.set(adSet.adSetId, record.id);
    adSetsUpserted++;
  }

  // Index insights by ad ID for quick lookup
  const insights7dMap = new Map<string, MetaAdInsight>();
  for (const i of result.insights7d) insights7dMap.set(i.adId, i);
  const insights14dMap = new Map<string, MetaAdInsight>();
  for (const i of result.insights14d) insights14dMap.set(i.adId, i);

  // 6. Upsert ads with creative + metrics
  let adsUpserted = 0;
  const adIdMap = new Map<string, string>(); // externalAdId → internal id
  for (const ad of result.ads) {
    const internalCampaignId = campaignIdMap.get(ad.campaignId);
    const internalAdSetId = adSetIdMap.get(ad.adSetId);
    if (!internalCampaignId || !internalAdSetId) continue;

    const i7 = insights7dMap.get(ad.adId);
    const i14 = insights14dMap.get(ad.adId);

    // Use effective_status for the stored status — it reflects actual delivery state
    // (e.g. CAMPAIGN_PAUSED when the ad's campaign is off, even if ad.status=ACTIVE)
    const data = {
      name: ad.name,
      status: mapStatus(ad.effectiveStatus),
      headline: ad.headline,
      primaryText: ad.primaryText,
      description: ad.description,
      imageUrl: ad.imageUrl,
      thumbnailUrl: ad.thumbnailUrl,
      callToAction: ad.callToAction,
      creativeType: ad.creativeType,
      // 7d metrics
      spend7d: i7?.spend ?? 0,
      impressions7d: i7?.impressions ?? 0,
      clicks7d: i7?.clicks ?? 0,
      conversions7d: i7?.conversions ?? 0,
      revenue7d: i7?.revenue ?? 0,
      roas7d: i7?.roas ?? null,
      ctr7d: i7?.ctr ?? null,
      cpc7d: i7?.cpc ?? null,
      frequency7d: i7?.frequency ?? null,
      // 14d metrics
      spend14d: i14?.spend ?? 0,
      impressions14d: i14?.impressions ?? 0,
      clicks14d: i14?.clicks ?? 0,
      conversions14d: i14?.conversions ?? 0,
      revenue14d: i14?.revenue ?? 0,
      roas14d: i14?.roas ?? null,
      ctr14d: i14?.ctr ?? null,
      cpc14d: i14?.cpc ?? null,
      frequency14d: i14?.frequency ?? null,
      lastSyncAt: new Date(),
    };

    // Use the real Meta creation date if available (overrides @default(now()))
    const metaCreatedAt = ad.createdTime ? new Date(ad.createdTime) : undefined;

    const record = await prisma.metaAd.upsert({
      where: {
        organizationId_adId: { organizationId, adId: ad.adId },
      },
      create: {
        organizationId,
        accountId: account.id,
        campaignId: internalCampaignId,
        adSetId: internalAdSetId,
        adId: ad.adId,
        ...data,
        ...(metaCreatedAt && !isNaN(metaCreatedAt.getTime()) ? { createdAt: metaCreatedAt } : {}),
      },
      update: data,
    });
    adIdMap.set(ad.adId, record.id);
    adsUpserted++;
  }

  // 7. Persist daily MetaAdSnapshot for each ad (time-series history)
  let snapshotsUpserted = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const ad of result.ads) {
    const insight7d = insights7dMap.get(ad.adId);
    if (!insight7d) continue;

    const internalAdId = adIdMap.get(ad.adId);
    if (!internalAdId) continue;

    // Estimate daily from 7d aggregate (divide by 7)
    const dailySpend = Math.round((insight7d.spend / 7) * 100) / 100;
    const dailyRevenue = Math.round((insight7d.revenue / 7) * 100) / 100;
    const dailyImpressions = Math.round((insight7d.impressions ?? 0) / 7);
    const dailyClicks = Math.round((insight7d.clicks ?? 0) / 7);
    const dailyConversions = Math.round((insight7d.conversions ?? 0) / 7);

    await prisma.metaAdSnapshot.upsert({
      where: {
        organizationId_adId_date: {
          organizationId,
          adId: internalAdId,
          date: today,
        },
      },
      update: {
        spend: dailySpend,
        impressions: dailyImpressions,
        clicks: dailyClicks,
        conversions: dailyConversions,
        revenue: dailyRevenue,
        roas: insight7d.roas ?? null,
        ctr: insight7d.ctr ?? null,
        cpc: insight7d.cpc ?? null,
        frequency: insight7d.frequency ?? null,
      },
      create: {
        organizationId,
        adId: internalAdId,
        date: today,
        spend: dailySpend,
        impressions: dailyImpressions,
        clicks: dailyClicks,
        conversions: dailyConversions,
        revenue: dailyRevenue,
        roas: insight7d.roas ?? null,
        ctr: insight7d.ctr ?? null,
        cpc: insight7d.cpc ?? null,
        frequency: insight7d.frequency ?? null,
      },
    });
    snapshotsUpserted++;
  }

  return {
    accountsUpserted: 1,
    campaignsUpserted,
    adSetsUpserted,
    adsUpserted,
    snapshotsUpserted,
    durationMs: Date.now() - start,
  };
}

/**
 * Maps Meta API status / effective_status to our internal status.
 *
 * Meta effective_status values include:
 *   ACTIVE, PAUSED, DELETED, ARCHIVED,
 *   CAMPAIGN_PAUSED, ADSET_PAUSED, DISAPPROVED,
 *   PENDING_REVIEW, PENDING_BILLING_INFO,
 *   IN_PROCESS, WITH_ISSUES, PREAPPROVED
 *
 * Only ACTIVE maps to ACTIVE — everything else means the ad is NOT delivering.
 */
function mapStatus(status: string): 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'ACTIVE';
  if (s === 'DELETED') return 'DELETED';
  if (s === 'ARCHIVED') return 'ARCHIVED';
  // PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, DISAPPROVED, PENDING_REVIEW,
  // IN_PROCESS, WITH_ISSUES, PREAPPROVED, and any unknown → PAUSED
  return 'PAUSED';
}
