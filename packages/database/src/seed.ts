import { prisma } from './client';

async function seed() {
  console.log('🌱 Seeding dim_channel...');
  const channels = [
    { slug: 'meta', name: 'Meta Ads' },
    { slug: 'google', name: 'Google Ads' },
    { slug: 'email', name: 'Email' },
    { slug: 'organic', name: 'Organic' },
    { slug: 'affiliate', name: 'Affiliate' },
    { slug: 'direct', name: 'Direct' },
    { slug: 'other', name: 'Other' },
  ];

  for (const ch of channels) {
    await prisma.dimChannel.upsert({
      where: { slug: ch.slug },
      update: { name: ch.name },
      create: ch,
    });
  }

  console.log('🌱 Seeding dim_date...');
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2026-12-31');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateOnly = new Date(current.toISOString().split('T')[0]!);
    await prisma.dimDate.upsert({
      where: { date: dateOnly },
      update: {},
      create: {
        date: dateOnly,
        dayOfWeek: current.getDay(),
        dayName: dayNames[current.getDay()]!,
        week: getWeekNumber(current),
        month: current.getMonth() + 1,
        monthName: monthNames[current.getMonth()]!,
        quarter: Math.floor(current.getMonth() / 3) + 1,
        year: current.getFullYear(),
        isWeekend: current.getDay() === 0 || current.getDay() === 6,
      },
    });
    current.setDate(current.getDate() + 1);
  }

  console.log('✅ Seed complete');
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
