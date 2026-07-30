import { safeEqual } from '@mining/security';

export function developmentDashboardEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ENABLE_DEVELOPMENT_DASHBOARD !== 'false';
}

export function developmentDashboardToken(): string {
  return process.env.DEVELOPMENT_DASHBOARD_TOKEN ?? 'local-development-dashboard';
}

export function developmentWorkerId(): string {
  return process.env.DEVELOPMENT_WORKER_ID ?? 'dev-7d9a4df2e77952c0657de069';
}

export function validDevelopmentToken(value: unknown): boolean {
  return typeof value === 'string' && safeEqual(value, developmentDashboardToken());
}
