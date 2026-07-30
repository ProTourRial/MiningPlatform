import { Module } from '@nestjs/common';
import { TransparencyController } from './transparency.controller';

@Module({ controllers: [TransparencyController] })
export class TransparencyModule {}
