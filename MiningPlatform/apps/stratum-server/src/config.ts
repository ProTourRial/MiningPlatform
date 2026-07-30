export interface StratumServerConfig {
  host: string;
  port: number;
  developmentMode: boolean;
  developmentWorker: string;
  developmentPassword: string;
  developmentDifficulty: string;
  socketTimeoutMs: number;
  maximumLineBytes: number;
  maximumSubmissionsPerSecond: number;
  developmentDataDirectory: string;
  eventBusDriver: 'memory' | 'redis';
  eventStoreDriver: 'jsonl' | 'postgres';
  redisUrl: string;
  eventStream: string;
  versionRollingMask: string;
  ipHashKey: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Expected a positive integer, received ${value}`);
  return parsed;
}

export function loadStratumConfig(): StratumServerConfig {
  const developmentMode = process.env.STRATUM_DEV_MODE === 'true';
  if (process.env.NODE_ENV === 'production' && developmentMode) {
    throw new Error('STRATUM_DEV_MODE cannot be enabled in production');
  }
  const eventBusDriver = process.env.EVENT_BUS_DRIVER ?? 'memory';
  if (eventBusDriver !== 'memory' && eventBusDriver !== 'redis') {
    throw new Error('EVENT_BUS_DRIVER must be memory or redis');
  }
  const eventStoreDriver = process.env.EVENT_STORE_DRIVER ?? (developmentMode ? 'jsonl' : 'postgres');
  if (eventStoreDriver !== 'jsonl' && eventStoreDriver !== 'postgres') {
    throw new Error('EVENT_STORE_DRIVER must be jsonl or postgres');
  }
  if (process.env.NODE_ENV === 'production' && eventStoreDriver !== 'postgres') {
    throw new Error('Production Stratum requires EVENT_STORE_DRIVER=postgres');
  }
  const ipHashKey = process.env.STRATUM_IP_HASH_KEY ?? (developmentMode ? 'development-only-ip-hash-key' : '');
  if (ipHashKey.length < 16) throw new Error('STRATUM_IP_HASH_KEY must contain at least 16 characters');

  return {
    host: process.env.STRATUM_HOST ?? '0.0.0.0',
    port: positiveInteger(process.env.STRATUM_PORT, 3333),
    developmentMode,
    developmentWorker: process.env.STRATUM_DEV_WORKER ?? 'demo.worker1',
    developmentPassword: process.env.STRATUM_DEV_PASSWORD ?? 'x',
    developmentDifficulty: process.env.STRATUM_DEV_DIFFICULTY ?? '0.000001',
    socketTimeoutMs: positiveInteger(process.env.STRATUM_SOCKET_TIMEOUT_MS, 120_000),
    maximumLineBytes: positiveInteger(process.env.STRATUM_MAX_LINE_BYTES, 16_384),
    maximumSubmissionsPerSecond: positiveInteger(process.env.STRATUM_MAX_SUBMISSIONS_PER_SECOND, 20),
    developmentDataDirectory: process.env.STRATUM_DEV_DATA_DIR ?? './data/stratum',
    eventBusDriver,
    eventStoreDriver,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    eventStream: process.env.EVENT_STREAM ?? 'mining:domain-events',
    versionRollingMask: process.env.STRATUM_VERSION_ROLLING_MASK ?? '1fffe000',
    ipHashKey,
  };
}
