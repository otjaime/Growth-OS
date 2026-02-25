// ──────────────────────────────────────────────────────────────
// Growth OS — Plan Guard
// Gate features by organization plan tier.
// FREE = read-only. STARTER+ = full access.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import type { Plan } from '@growth-os/database';

const PLAN_ORDER: Record<Plan, number> = {
  FREE: 0,
  STARTER: 1,
  GROWTH: 2,
  SCALE: 3,
};

export class PlanError extends Error {
  public readonly statusCode = 403;
  constructor(
    public readonly currentPlan: Plan,
    public readonly requiredPlan: Plan,
  ) {
    super(`This feature requires the ${requiredPlan} plan or higher. Current plan: ${currentPlan}.`);
    this.name = 'PlanError';
  }
}

/**
 * Checks that the organization meets the minimum plan requirement.
 * Throws PlanError (403) if the org's plan is below the minimum.
 */
export async function requirePlan(organizationId: string, minimum: Plan): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  const currentLevel = PLAN_ORDER[org.plan];
  const requiredLevel = PLAN_ORDER[minimum];

  if (currentLevel < requiredLevel) {
    throw new PlanError(org.plan, minimum);
  }
}
