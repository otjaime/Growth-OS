import pino from 'pino';
import crypto from 'crypto';

function getPrettyTransport(): pino.TransportSingleOptions | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true } };
  } catch {
    return undefined;
  }
}

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
    transport: getPrettyTransport(),
  });
}
