/** MiningPlatform — Author: Abia Nugrahanto */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({ imports: [AuthModule], controllers: [ApiKeysController], providers: [ApiKeysService] })
export class ApiKeysModule {}
