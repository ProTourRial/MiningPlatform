/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DEFAULT_PAYMENT_RECEIVER_ADDRESSES, PAYMENT_RECEIVER_POLICY } from '@mining/shared';

@ApiTags('wallets')
@Controller({ path: 'wallets', version: '1' })
export class WalletsController {
  @Get('status')
  getStatus() {
    return {
      module: 'wallets',
      status: 'scaffolded-disabled',
      userDepositsEnabled: false,
      payoutsEnabled: false,
    };
  }

  @Get('support-addresses')
  getSupportAddresses() {
    const enabled = process.env.SUPPORT_PAYMENTS_ENABLED === 'true';
    return {
      enabled,
      policy: PAYMENT_RECEIVER_POLICY,
      warning: enabled
        ? 'Send only the matching asset on the exact network shown. Transfers are not credited to user balances.'
        : 'Support payments are disabled. Addresses are configured but intentionally not published by the API.',
      addresses: enabled ? DEFAULT_PAYMENT_RECEIVER_ADDRESSES : [],
      configuredNetworks: DEFAULT_PAYMENT_RECEIVER_ADDRESSES.map(({ asset, network, networkLabel }) => ({
        asset,
        network,
        networkLabel,
      })),
    };
  }
}
