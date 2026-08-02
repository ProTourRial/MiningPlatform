/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class IdentityDeliveryService {
  async deliver(kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD', email: string, token: string): Promise<{ delivered: boolean; adapter: string }> {
    const mode = process.env.AUTH_DELIVERY_MODE ?? 'development';
    if (process.env.NODE_ENV === 'production' && mode === 'development') {
      throw new ServiceUnavailableException('Production identity delivery adapter is not configured');
    }
    if (mode === 'disabled') return { delivered: false, adapter: 'disabled' };
    const action = kind === 'VERIFY_EMAIL' ? 'verify-email' : 'reset-password';
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[identity-delivery] ${email} ${appUrl}/${action}?token=${token}`);
    }
    return { delivered: true, adapter: 'development-console' };
  }
}
