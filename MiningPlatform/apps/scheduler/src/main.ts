import { createLogger } from '@mining/logger';

const logger = createLogger('scheduler');
logger.info({ status: 'scaffolded' }, 'Schedules reward closing, reconciliation, payout preparation, retention, and transparency snapshots.');

setInterval(() => {
  logger.debug({ heartbeat: true }, 'scheduler heartbeat');
}, 60_000);
