/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { readFileSync } from 'node:fs';
import { BitcoinJsonRpcClient, BitcoinWatchOnlyRpcAdapter } from '@mining/blockchain-adapters';
import { getBuildInfo } from '@mining/build-info';
import { prisma } from '@mining/database';
import { createLogger } from '@mining/logger';
import { parseArtifactEncryptionKey } from './artifact-crypto.js';
import { assertRegtestPayoutBoundary } from './payout-boundary.js';
import { WalletPayoutExecutor } from './payout-executor.js';
import { IsolatedSignerClient } from './signer-client.js';

const logger = createLogger('wallet-worker');
const enabled = process.env.PAYOUT_EXECUTOR_ENABLED === 'true';
const intervalMilliseconds = Number(process.env.PAYOUT_EXECUTOR_INTERVAL_MS ?? 5_000);
let running = false;
let timer: NodeJS.Timeout | undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when the payout executor is enabled`);
  return value;
}

function buildExecutor(): WalletPayoutExecutor {
  assertRegtestPayoutBoundary();
  if (!Number.isInteger(intervalMilliseconds) || intervalMilliseconds < 250) {
    throw new Error('PAYOUT_EXECUTOR_INTERVAL_MS must be an integer of at least 250');
  }
  const rpc = new BitcoinJsonRpcClient({
    url: required('BITCOIN_WATCH_RPC_URL'),
    username: required('BITCOIN_WATCH_RPC_USER'),
    password: required('BITCOIN_WATCH_RPC_PASSWORD'),
    walletName: required('BITCOIN_WATCH_WALLET_NAME'),
    timeoutMilliseconds: Number(process.env.BITCOIN_WATCH_RPC_TIMEOUT_MS ?? 15_000),
    maximumResponseBytes: 16 * 1024 * 1024,
    allowInsecureHttp: process.env.BITCOIN_WATCH_RPC_ALLOW_INSECURE_HTTP === 'true',
  });
  const requireMutualTls =
    (process.env.WALLET_SIGNER_REQUIRE_MTLS ?? String(process.env.NODE_ENV === 'production')) ===
    'true';
  const signer = new IsolatedSignerClient({
    url: required('ISOLATED_SIGNER_URL'),
    sharedSecret: required('SIGNER_SHARED_SECRET'),
    timeoutMilliseconds: Number(process.env.WALLET_SIGNER_TIMEOUT_MS ?? 15_000),
    allowInsecureHttp: process.env.WALLET_SIGNER_ALLOW_INSECURE_HTTP === 'true',
    mutualTls: requireMutualTls
      ? {
          certificate: readFileSync(required('WALLET_SIGNER_TLS_CERT_FILE')),
          privateKey: readFileSync(required('WALLET_SIGNER_TLS_KEY_FILE')),
          certificateAuthority: readFileSync(required('WALLET_SIGNER_TLS_CA_FILE')),
          serverName: process.env.WALLET_SIGNER_TLS_SERVER_NAME,
        }
      : undefined,
  });
  return new WalletPayoutExecutor({
    adapter: new BitcoinWatchOnlyRpcAdapter('regtest', rpc),
    signer,
    artifactEncryptionKey: parseArtifactEncryptionKey(required('WALLET_ARTIFACT_ENCRYPTION_KEY')),
    maximumSigningAttempts: Number(process.env.PAYOUT_SIGNING_MAXIMUM_ATTEMPTS ?? 3),
    batchSize: Number(process.env.PAYOUT_EXECUTOR_BATCH_SIZE ?? 20),
  });
}

const buildInfo = getBuildInfo('wallet-worker');
logger.info({ build: buildInfo, enabled }, 'wallet-worker build information');

if (!enabled) {
  logger.info(
    { status: 'disabled', mainnetEnabled: false },
    'Payout executor is fail-closed; enable only for the disposable Bitcoin regtest trace.',
  );
} else {
  const executor = buildExecutor();
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await executor.runOnce();
      logger.info({ result }, 'regtest payout executor cycle completed');
    } catch (error) {
      logger.error({ error }, 'regtest payout executor cycle failed');
    } finally {
      running = false;
    }
  };
  void tick();
  timer = setInterval(() => void tick(), intervalMilliseconds);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (timer) clearInterval(timer);
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
