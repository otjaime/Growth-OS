// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Monitor
// Monitors active CampaignStrategy records, updates performance,
// and applies auto-optimization rules.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';

const log = createLogger('campaign-monitor');

// ── Interfaces ──────────────────────────────────────────────

export interface CampaignMonitorResult {
  readonly monitored: number;
  readonly scaled: number;
  readonly paused: number;
  readonly completed: number;
  readonly errors: readonly string[];
}

// ── Helpers ─────────────────────────────────────────────────

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === 'number' ? val : Number(val);
}

// ── Main function ───────────────────────────────────────────

export async function monitorCampaigns(
  organizationId: string,
): Promise<CampaignMonitorResult> {
  log.info({ organizationId }, 'Starting campaign monitoring');

  // Load active campaigns
  const activeCampaigns = await prisma.campaignStrategy.findMany({
    where: {
      organizationId,
      status: 'ACTIVE',
    },
  });

  // Load AutopilotConfig for targets
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
  });

  const targetRoas = config?.targetRoas != null ? toNum(config.targetRoas) : 2.0;
  const dailyBudgetCap = config?.dailyBudgetCap != null ? toNum(config.dailyBudgetCap) : Infinity;

  let monitored = 0;
  let scaled = 0;
  let paused = 0;
  let completed = 0;
  const errors: string[] = [];

  const now = new Date();

  for (const campaign of activeCampaigns) {
    monitored += 1;

    try {
      const actualSpend = toNum(campaign.actualSpend);
      const actualRevenue = toNum(campaign.actualRevenue);

      // Check if campaign has ended by date
      if (campaign.endDate && campaign.endDate < now) {
        await prisma.campaignStrategy.update({
          where: { id: campaign.id },
          data: {
            status: 'COMPLETED',
            actualRoas: actualSpend > 0
              ? new Prisma.Decimal(actualRevenue / actualSpend)
              : null,
          },
        });
        completed += 1;
        log.info({ campaignId: campaign.id, name: campaign.name }, 'Campaign completed — end date passed');
        continue;
      }

      // Update actualRoas
      const computedRoas = actualSpend > 0 ? actualRevenue / actualSpend : 0;

      if (actualSpend > 0) {
        // High performer: candidate for scaling
        if (computedRoas > targetRoas * 1.5) {
          const currentBudget = toNum(campaign.dailyBudget);
          const newBudget = Math.min(currentBudget * 1.2, dailyBudgetCap);

          await prisma.campaignStrategy.update({
            where: { id: campaign.id },
            data: {
              actualRoas: new Prisma.Decimal(computedRoas),
              dailyBudget: new Prisma.Decimal(newBudget),
            },
          });
          scaled += 1;
          log.info(
            {
              campaignId: campaign.id,
              name: campaign.name,
              roas: computedRoas.toFixed(2),
              oldBudget: currentBudget.toFixed(2),
              newBudget: newBudget.toFixed(2),
            },
            'Campaign scaled — high ROAS',
          );
        }
        // Low performer: auto-pause if significant spend and poor ROAS
        else if (computedRoas < 0.5 && actualSpend > 100) {
          await prisma.campaignStrategy.update({
            where: { id: campaign.id },
            data: {
              status: 'PAUSED',
              actualRoas: new Prisma.Decimal(computedRoas),
            },
          });
          paused += 1;
          log.info(
            {
              campaignId: campaign.id,
              name: campaign.name,
              roas: computedRoas.toFixed(2),
              spend: actualSpend.toFixed(2),
            },
            'Campaign auto-paused — ROAS below 0.5 with >$100 spend',
          );
        }
        // Normal: just update ROAS
        else {
          await prisma.campaignStrategy.update({
            where: { id: campaign.id },
            data: {
              actualRoas: new Prisma.Decimal(computedRoas),
            },
          });
        }
      }
    } catch (err) {
      const msg = `Error monitoring campaign ${campaign.id}: ${String(err)}`;
      errors.push(msg);
      log.error({ campaignId: campaign.id, error: String(err) }, 'Campaign monitoring error');
    }
  }

  log.info(
    { organizationId, monitored, scaled, paused, completed, errors: errors.length },
    'Campaign monitoring complete',
  );

  return { monitored, scaled, paused, completed, errors };
}
