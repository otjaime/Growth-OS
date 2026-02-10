import { prisma } from './client';

const MODE_KEY = 'demo_mode';

export async function isDemoMode(): Promise<boolean> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: MODE_KEY } });
    if (setting) {
      return setting.value === 'true';
    }
  } catch {
    // Table may not exist yet (before migration) — fall back to env
  }
  return process.env.DEMO_MODE === 'true';
}

export async function setMode(mode: 'demo' | 'live'): Promise<void> {
  const value = mode === 'demo' ? 'true' : 'false';
  await prisma.appSetting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value },
    update: { value },
  });
  process.env.DEMO_MODE = value;
}

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
  } catch {
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
