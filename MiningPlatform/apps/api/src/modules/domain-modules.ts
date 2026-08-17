/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LedgerModule } from './ledger/ledger.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OwnerModule } from './owner/owner.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';
import { RewardsModule } from './rewards/rewards.module';
import { SharesModule } from './shares/shares.module';
import { TransparencyModule } from './transparency/transparency.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { WorkersModule } from './workers/workers.module';

export const DomainModules = [
  AuthModule,
  ApiKeysModule,
  AuditModule,
  UsersModule,
  WorkersModule,
  SharesModule,
  RewardsModule,
  ReconciliationModule,
  LedgerModule,
  PayoutsModule,
  WalletsModule,
  MonitoringModule,
  TransparencyModule,
  NotificationsModule,
  OwnerModule,
];
