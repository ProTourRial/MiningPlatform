import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';

@Module({ controllers: [PayoutsController] })
export class PayoutsModule {}
