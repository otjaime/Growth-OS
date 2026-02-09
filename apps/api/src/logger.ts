import pino from 'pino';

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
  return pino({
    name: `api:${name}`,
    level: process.env.LOG_LEVEL ?? 'info',
    transport: getPrettyTransport(),
  });
}
