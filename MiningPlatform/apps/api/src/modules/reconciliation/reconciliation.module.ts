/** MiningPlatform — Author: Abia Nugrahanto */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
