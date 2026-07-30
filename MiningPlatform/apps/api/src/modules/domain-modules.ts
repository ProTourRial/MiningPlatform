import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkersModule } from './workers/workers.module';
import { SharesModule } from './shares/shares.module';
import { RewardsModule } from './rewards/rewards.module';
import { LedgerModule } from './ledger/ledger.module';
import { PayoutsModule } from './payouts/payouts.module';
import { WalletsModule } from './wallets/wallets.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { TransparencyModule } from './transparency/transparency.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OwnerModule } from './owner/owner.module';

export const DomainModules = [
  AuthModule,
  UsersModule,
  WorkersModule,
  SharesModule,
  RewardsModule,
  LedgerModule,
  PayoutsModule,
  WalletsModule,
  MonitoringModule,
  TransparencyModule,
  NotificationsModule,
  OwnerModule,
];
