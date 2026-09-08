/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { getBuildInfo, printVersionAndExitIfRequested } from '@mining/build-info';
import { createLogger } from '@mining/logger';
import { loadRandomXGatewayConfig } from './config.js';

if (printVersionAndExitIfRequested('randomx-gateway')) process.exit(0);

const logger = createLogger('randomx-gateway');

async function main(): Promise<void> {
  const config = loadRandomXGatewayConfig();
  logger.info(
    { build: getBuildInfo('randomx-gateway'), enabled: config.enabled },
    'randomx-gateway build information',
  );
  if (!config.enabled) {
    logger.info(
      { status: 'disabled', publicListenerEnabled: false },
      'RandomX gateway is fail-closed by default',
    );
    return;
  }

  const { createRandomXGatewayRuntime } = await import('./runtime.js');
  const runtime = await createRandomXGatewayRuntime(config);
  try {
    await runtime.listen();
  } catch (error) {
    await runtime.close().catch((closeError: unknown) => {
      logger.error({ error: closeError }, 'RandomX failed-start cleanup did not complete');
    });
    throw error;
  }
  logger.info(
    { mode: config.mode, host: config.miner.host, port: runtime.listeningPort },
    'RandomX laboratory gateway started',
  );

  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'RandomX laboratory gateway stopping');
    void runtime
      .close()
      .then(() => logger.info('RandomX laboratory gateway stopped'))
      .catch((error: unknown) => {
        logger.error({ error }, 'RandomX laboratory gateway shutdown failed');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  logger.fatal({ error }, 'RandomX gateway failed to start');
  process.exitCode = 1;
});
