/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import 'reflect-metadata';
import { getBuildInfo } from '@mining/build-info';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

const buildInfo = getBuildInfo('api');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks();
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    const method = String(request.method ?? 'GET').toUpperCase();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const cookieAuth = typeof request.headers.cookie === 'string' && /(?:^|;\s*)mp_(?:access|refresh)=/.test(request.headers.cookie);
    const bearerAuth = typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ');
    if (process.env.NODE_ENV === 'production' && mutating && cookieAuth && !bearerAuth) {
      const configured = (process.env.APP_URL ?? '').split(',').map((value) => value.trim()).filter(Boolean).map((value) => new URL(value).origin);
      const origin = typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
      if (!origin || !configured.includes(origin)) {
        response.status(403).json({ statusCode: 403, message: 'Origin validation failed' });
        return;
      }
    }
    next();
  });
  app.enableCors({
    origin: (process.env.APP_URL ?? 'http://localhost:3000').split(',').map((value) => value.trim()),
    credentials: true,
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'version', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MiningPlatform API')
      .setDescription('Mining pool management platform API')
      .setVersion(buildInfo.version)
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
}


void bootstrap();
