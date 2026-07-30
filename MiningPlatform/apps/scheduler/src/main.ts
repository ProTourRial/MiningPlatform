import { setTimeout as sleep } from 'node:timers/promises';
import { prisma } from '@mining/database';
import { createLogger } from '@mining/logger';

const logger = createLogger('scheduler');
const abortController = new AbortController();
const intervalMilliseconds = positiveInteger(process.env.SCHEDULER_INTERVAL_MS, 60 * 60 * 1_000);
const bucketRetentionDays = positiveInteger(process.env.HASHRATE_BUCKET_RETENTION_DAYS, 7);
const snapshotRetentionDays = positiveInteger(process.env.HASHRATE_SNAPSHOT_RETENTION_DAYS, 90);
const outboxRetentionDays = positiveInteger(process.env.OUTBOX_PUBLISHED_RETENTION_DAYS, 7);
const idempotencyRetentionDays = positiveInteger(process.env.IDEMPOTENCY_RETENTION_DAYS, 30);

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Expected positive integer, received ${value}`);
  return parsed;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

async function runRetention(): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('mining-platform:retention')) AS acquired
    `;
    if (!lockRows[0]?.acquired) return null;

    const buckets = await tx.hashrateBucket.deleteMany({
      where: { bucketStart: { lt: daysAgo(bucketRetentionDays) } },
    });
    const snapshots = await tx.hashrateSnapshot.deleteMany({
      where: { recordedAt: { lt: daysAgo(snapshotRetentionDays) } },
    });
    const publishedOutbox = await tx.outboxEvent.deleteMany({
      where: { status: 'PUBLISHED', publishedAt: { lt: daysAgo(outboxRetentionDays) } },
    });
    const expiredFingerprints = await tx.shareFingerprint.deleteMany({
      where: { shareId: null, expiresAt: { lt: new Date() } },
    });
    const expiredIdempotency = await tx.idempotencyRecord.deleteMany({
      where: {
        expiresAt: { lt: daysAgo(idempotencyRetentionDays) },
        status: { in: ['COMPLETED', 'FAILED', 'RELEASED', 'EXPIRED'] },
      },
    });

    return {
      hashrateBuckets: buckets.count,
      hashrateSnapshots: snapshots.count,
      publishedOutbox: publishedOutbox.count,
      expiredFingerprints: expiredFingerprints.count,
      expiredIdempotency: expiredIdempotency.count,
    };
  });

  if (result) logger.info(result, 'retention cycle completed');
  else logger.debug('retention cycle skipped because another scheduler owns the lock');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => abortController.abort());
}

logger.info({ intervalMilliseconds }, 'central scheduler started');
try {
  while (!abortController.signal.aborted) {
    try {
      await runRetention();
    } catch (error) {
      logger.error({ error }, 'retention cycle failed');
    }
    await sleep(intervalMilliseconds, undefined, { signal: abortController.signal }).catch(() => undefined);
  }
} finally {
  await prisma.$disconnect();
}
