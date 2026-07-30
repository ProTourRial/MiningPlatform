import pino from 'pino';

export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: ['password', 'passwordHash', 'token', 'privateKey', 'seedPhrase', 'totpSecret'],
  });
}
