import pino from 'pino';
import crypto from 'crypto';

export function createLogger(name: string) {
  const correlationId = crypto.randomUUID().slice(0, 8);
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    mixin() {
      return { correlationId };
    },
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}
