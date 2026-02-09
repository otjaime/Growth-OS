// ──────────────────────────────────────────────────────────────
// Growth OS — Step 1: Ingest Raw
// Writes raw API records into raw_events table (append-only)
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import type { RawRecord } from '../types.js';
import { createLogger } from '../logger.js';

const log = createLogger('pipeline:ingest-raw');

/**
 * Ingest raw records into the raw_events table.
 * Uses upsert on (source, entity, externalId) for idempotency.
 */
export async function ingestRaw(records: RawRecord[]): Promise<number> {
  log.info({ count: records.length }, 'Ingesting raw records');

  let loaded = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    // Use a transaction for each batch
    await prisma.$transaction(async (tx) => {
      for (const record of batch) {
        if (record.externalId) {
          // Upsert for idempotency — same source+entity+externalId won't duplicate
          await tx.rawEvent.upsert({
            where: {
              // Use compound lookup via the index
              id: await findExistingRawId(tx, record.source, record.entity, record.externalId),
            },
            create: {
              source: record.source,
              entity: record.entity,
              externalId: record.externalId,
              cursor: record.cursor,
              payloadJson: record.payload,
            },
            update: {
              cursor: record.cursor,
              payloadJson: record.payload,
              fetchedAt: new Date(),
            },
          });
        } else {
          await tx.rawEvent.create({
            data: {
              source: record.source,
              entity: record.entity,
              externalId: record.externalId,
              cursor: record.cursor,
              payloadJson: record.payload,
            },
          });
        }
        loaded++;
      }
    });

    log.info({ batch: Math.floor(i / BATCH_SIZE) + 1, loaded }, 'Batch ingested');
  }

  log.info({ loaded }, 'Raw ingestion complete');
  return loaded;
}

async function findExistingRawId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  source: string,
  entity: string,
  externalId: string,
): Promise<string> {
  const existing = await tx.rawEvent.findFirst({
    where: { source, entity, externalId },
    select: { id: true },
  });
  return existing?.id ?? 'non-existent-id-for-create';
}
