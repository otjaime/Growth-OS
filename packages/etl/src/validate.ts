// ──────────────────────────────────────────────────────────────
// Growth OS — Data Validation CLI
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { validateData } from './pipeline/validate.js';
import { createLogger } from './logger.js';

const log = createLogger('validate');

async function run() {
  log.info('Running data validation...');

  const results = await validateData();
  let passed = 0;
  let failed = 0;

  for (const r of results) {
    if (r.passed) {
      console.log(`  ✅ ${r.check}: ${r.message}`);
      passed++;
    } else {
      console.log(`  ❌ ${r.check}: ${r.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} checks`);

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

run();
