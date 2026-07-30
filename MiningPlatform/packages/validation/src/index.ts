import { z } from 'zod';

export const workerNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/);

export const btcAddressInputSchema = z.object({
  address: z.string().min(14).max(90),
  label: z.string().max(80).optional(),
});
