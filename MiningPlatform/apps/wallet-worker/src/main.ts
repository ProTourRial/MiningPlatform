import { createLogger } from '@mining/logger';

const logger = createLogger('wallet-worker');
logger.info({ status: 'scaffolded' }, 'Processes approved payouts. Broadcasting remains disabled until the blockchain adapter and approval flow are complete.');

setInterval(() => {
  logger.debug({ heartbeat: true }, 'wallet-worker heartbeat');
}, 60_000);
