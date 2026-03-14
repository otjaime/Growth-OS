import type { PrismaClient } from '@growth-os/database';

export interface AUMSnapshot {
  totalAUM: number;
  activeAccounts: number;
  activeHypotheses: number;
  verticalBreakdown: Record<string, number>;
}

export async function getAUMSnapshot(db: PrismaClient): Promise<AUMSnapshot> {
  const [activeClients, activeHypothesesCount] = await Promise.all([
    db.client.findMany({
      where: { isActive: true },
      select: {
        monthlyAdSpend: true,
        vertical: true,
      },
    }),
    db.campaignHypothesis.count({
      where: { status: 'LIVE' },
    }),
  ]);

  let totalAUM = 0;
  const verticalBreakdown: Record<string, number> = {};

  for (const client of activeClients) {
    totalAUM += client.monthlyAdSpend;
    const vertical = client.vertical;
    verticalBreakdown[vertical] = (verticalBreakdown[vertical] ?? 0) + client.monthlyAdSpend;
  }

  return {
    totalAUM,
    activeAccounts: activeClients.length,
    activeHypotheses: activeHypothesesCount,
    verticalBreakdown,
  };
}
