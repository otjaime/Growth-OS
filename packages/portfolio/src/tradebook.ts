import type { PrismaClient } from '@growth-os/database';

export interface TradeBookEntry {
  hypothesisId: string;
  clientId: string;
  clientName: string;
  vertical: string;
  trigger: string;
  awarenessLevel: string;
  budgetUSD: number;
  expectedROAS: number;
  actualROAS: number;
  delta: number;
  relativeReturn: number;
  verdict: string;
  lesson: string;
  triggerEffective: boolean;
  durationDays: number;
  openedAt: Date;
  closedAt: Date;
}

export async function getTradeBook(params: {
  clientId?: string;
  vertical?: string;
  trigger?: string;
  fromDate?: Date;
  toDate?: Date;
  db: PrismaClient;
}): Promise<TradeBookEntry[]> {
  const { db, clientId, vertical, trigger, fromDate, toDate } = params;

  const where: Record<string, unknown> = {
    status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] },
    closedAt: { not: null },
  };

  if (clientId) {
    where['clientId'] = clientId;
  }

  if (trigger) {
    where['trigger'] = trigger;
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter['gte'] = fromDate;
    if (toDate) dateFilter['lte'] = toDate;
    where['closedAt'] = { ...dateFilter, not: null };
  }

  if (vertical) {
    where['client'] = { vertical };
  }

  const hypotheses = await db.campaignHypothesis.findMany({
    where,
    include: {
      client: true,
    },
    orderBy: { closedAt: 'desc' },
  });

  return hypotheses.map((h) => {
    const actualROAS = h.actualROAS ?? 0;
    const delta = actualROAS - h.expectedROAS;
    const relativeReturn = h.expectedROAS === 0 ? 0 : delta / h.expectedROAS;

    return {
      hypothesisId: h.id,
      clientId: h.clientId,
      clientName: h.client.name,
      vertical: h.client.vertical,
      trigger: h.trigger,
      awarenessLevel: h.awarenessLevel,
      budgetUSD: h.budgetUSD,
      expectedROAS: h.expectedROAS,
      actualROAS,
      delta,
      relativeReturn,
      verdict: h.status,
      lesson: h.lesson ?? '',
      triggerEffective: h.triggerEffective ?? false,
      durationDays: h.durationDays,
      openedAt: h.launchedAt ?? h.createdAt,
      closedAt: h.closedAt!,
    };
  });
}
