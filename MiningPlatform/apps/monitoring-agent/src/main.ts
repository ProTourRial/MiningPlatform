import { createLogger } from '@mining/logger';

const logger = createLogger('monitoring-agent');

logger.info(
  {
    mode: 'outbound-only',
    access: 'no-wallet-no-ledger',
  },
  'monitoring agent scaffold started',
);

// Vendor-specific miner API adapters will be added after supported hardware is selected.
