/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MINING_ASSET: z.string().default('BTC'),
  MINING_ALGORITHM: z.string().default('SHA256'),
  REWARD_METHOD: z.literal('FOLLOW_UPSTREAM').default('FOLLOW_UPSTREAM'),
  PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(100).default(0.5),
  PAYOUTS_ENABLED: z.enum(['true', 'false']).default('false'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  return environmentSchema.parse(input);
}
