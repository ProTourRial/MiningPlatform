import { Module } from '@nestjs/common';
import { WorkersController } from './workers.controller';

@Module({ controllers: [WorkersController] })
export class WorkersModule {}
