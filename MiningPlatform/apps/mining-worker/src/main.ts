import { createLogger } from '@mining/logger';

const logger = createLogger('mining-worker');
logger.info({ status: 'scaffolded' }, 'Consumes validated share events, aggregates hashrate, closes reward periods, and starts upstream reconciliation.');

setInterval(() => {
  logger.debug({ heartbeat: true }, 'mining-worker heartbeat');
}, 60_000);
