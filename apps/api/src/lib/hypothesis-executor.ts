// ──────────────────────────────────────────────────────────────
// Growth OS — Hypothesis Executor
// Creates a full Meta campaign (campaign + ad set + ads) from
// an approved hypothesis with a creative brief.
// ──────────────────────────────────────────────────────────────

import type { PrismaClient } from '@growth-os/database';
import { decrypt } from '@growth-os/database';
import {
  createMetaCampaign,
  createProactiveAdSet,
  createAdvantagePlusAd,
  createAdFromVariant,
  activateMetaCampaign,
  fetchEligiblePageId,
  toSmallestUnit,
} from './meta-executor.js';
import type { CreativeBrief } from './hypothesis-brief-generator.js';
import { createLogger } from '../logger.js';

const log = createLogger('hypothesis-executor');

export interface HypothesisExecutionResult {
  success: boolean;
  campaignId?: string;
  adSetId?: string;
  adIds?: string[];
  error?: string;
}

export async function executeHypothesis(
  hypothesisId: string,
  db: PrismaClient,
): Promise<HypothesisExecutionResult> {
  // 1. Load hypothesis
  const hypothesis = await db.campaignHypothesis.findUnique({
    where: { id: hypothesisId },
    include: { client: true },
  });

  if (!hypothesis) {
    return { success: false, error: 'Hypothesis not found' };
  }
  if (hypothesis.status !== 'APPROVED') {
    return { success: false, error: `Cannot execute from status ${hypothesis.status}` };
  }
  if (!hypothesis.creativeBrief) {
    return { success: false, error: 'No creative brief found. Generate a brief first.' };
  }

  const client = hypothesis.client;
  if (!client.metaAccountId) {
    return { success: false, error: 'Client has no Meta ad account configured.' };
  }

  // 2. Get Meta credentials
  const credential = await db.connectorCredential.findFirst({
    where: { connectorType: 'meta', organizationId: client.organizationId },
  });
  if (!credential) {
    return { success: false, error: 'No Meta credentials found. Connect Meta Ads in Data Connections.' };
  }

  let accessToken: string;
  let currency = 'USD';
  try {
    const decrypted = decrypt(credential.encryptedData, credential.iv, credential.authTag);
    const parsed = JSON.parse(decrypted) as { accessToken?: string };
    accessToken = parsed.accessToken ?? '';
    if (credential.metadata) {
      const meta = credential.metadata as Record<string, unknown>;
      if (meta.currency) currency = String(meta.currency);
    }
  } catch {
    return { success: false, error: 'Failed to decrypt Meta credentials.' };
  }

  if (!accessToken) {
    return { success: false, error: 'Meta access token is empty.' };
  }

  const brief = hypothesis.creativeBrief as unknown as CreativeBrief;

  // 3. Find eligible Facebook page
  const pageResult = await fetchEligiblePageId(accessToken, client.metaAccountId);
  if (!pageResult) {
    return { success: false, error: 'No Facebook Page found. Connect a Page in Meta Business Settings.' };
  }

  // 4. Create campaign (PAUSED)
  const campaignResult = await createMetaCampaign(
    accessToken,
    client.metaAccountId,
    `GrowthOS — ${hypothesis.title}`,
    brief.pixelId ? 'OUTCOME_SALES' : 'OUTCOME_TRAFFIC',
  );
  if (!campaignResult.success) {
    return { success: false, error: `Campaign creation failed: ${campaignResult.error}` };
  }
  const campaignId = String((campaignResult.metaResponse as Record<string, unknown>)?.id ?? '');
  if (!campaignId) {
    return { success: false, error: 'Campaign created but no ID returned.' };
  }

  // 5. Create ad set with budget
  const budgetSmallestUnit = toSmallestUnit(brief.dailyBudget, currency);
  const adSetResult = await createProactiveAdSet(
    accessToken,
    client.metaAccountId,
    campaignId,
    hypothesis.title,
    budgetSmallestUnit,
    brief.targeting,
    brief.pixelId,
  );
  if (!adSetResult.success) {
    return { success: false, error: `Ad set creation failed: ${adSetResult.error}`, campaignId };
  }
  const adSetId = String((adSetResult.metaResponse as Record<string, unknown>)?.id ?? '');

  // 6. Create ads using Advantage+ (preferred) or individual variants (fallback)
  const adIds: string[] = [];
  const variants = brief.copyVariants;

  if (variants.length >= 2) {
    // Try Advantage+ first — single ad with all variants (agency best practice)
    const aPlusResult = await createAdvantagePlusAd(
      accessToken,
      client.metaAccountId,
      adSetId,
      {
        name: hypothesis.title,
        headlines: variants.map(v => v.headline),
        primaryTexts: variants.map(v => v.primaryText),
        descriptions: variants.map(v => v.description).filter(Boolean),
        imageHashes: brief.imageHash ? [brief.imageHash] : [],
        linkUrl: brief.linkUrl ?? '',
        pageId: pageResult.pageId,
      },
    );

    if (aPlusResult.success) {
      const resp = aPlusResult.metaResponse as Record<string, unknown>;
      if (resp?.adId) adIds.push(String(resp.adId));
    } else {
      // Advantage+ failed (maybe no image hash) — fall back to individual ads
      log.warn({ error: aPlusResult.error }, 'Advantage+ failed, falling back to individual ads');
      for (const variant of variants) {
        const adResult = await createAdFromVariant(
          accessToken,
          client.metaAccountId,
          adSetId,
          {
            name: `${hypothesis.title} — ${variant.angle}`,
            headline: variant.headline,
            primaryText: variant.primaryText,
            description: variant.description,
            imageHash: brief.imageHash,
            linkUrl: brief.linkUrl ?? '',
            pageId: pageResult.pageId,
          },
        );
        if (adResult.success) {
          const resp = adResult.metaResponse as Record<string, unknown>;
          if (resp?.adId) adIds.push(String(resp.adId));
        }
      }
    }
  }

  // 7. Update hypothesis with Meta IDs
  await db.campaignHypothesis.update({
    where: { id: hypothesisId },
    data: {
      metaCampaignId: campaignId,
      metaAdSetId: adSetId,
      metaAdIds: adIds,
      dailyBudget: brief.dailyBudget,
      status: 'LIVE',
      launchedAt: new Date(),
    },
  });

  // 8. Activate everything
  await activateMetaCampaign(accessToken, campaignId, [adSetId], adIds);

  log.info(
    { hypothesisId, campaignId, adSetId, adCount: adIds.length },
    'Hypothesis executed — Meta campaign live',
  );

  return {
    success: true,
    campaignId,
    adSetId,
    adIds,
  };
}
