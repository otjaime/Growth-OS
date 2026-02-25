import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
}));

import { requirePlan, PlanError } from './plan-guard.js';

describe('plan-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requirePlan', () => {
    it('passes when org plan meets minimum', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ plan: 'STARTER' });
      await expect(requirePlan('org-1', 'STARTER')).resolves.toBeUndefined();
    });

    it('passes when org plan exceeds minimum', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ plan: 'SCALE' });
      await expect(requirePlan('org-1', 'STARTER')).resolves.toBeUndefined();
    });

    it('throws PlanError when org plan is below minimum', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ plan: 'FREE' });
      await expect(requirePlan('org-1', 'STARTER')).rejects.toThrow(PlanError);
    });

    it('PlanError has correct properties', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({ plan: 'FREE' });
      try {
        await requirePlan('org-1', 'GROWTH');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PlanError);
        const pe = err as PlanError;
        expect(pe.statusCode).toBe(403);
        expect(pe.currentPlan).toBe('FREE');
        expect(pe.requiredPlan).toBe('GROWTH');
        expect(pe.message).toContain('GROWTH');
        expect(pe.message).toContain('FREE');
      }
    });

    it('throws Error when org not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(null);
      await expect(requirePlan('org-missing', 'STARTER')).rejects.toThrow('Organization not found');
    });

    it('respects full plan hierarchy: FREE < STARTER < GROWTH < SCALE', async () => {
      const plans = ['FREE', 'STARTER', 'GROWTH', 'SCALE'] as const;

      for (let i = 0; i < plans.length; i++) {
        for (let j = 0; j < plans.length; j++) {
          mockPrisma.organization.findUnique.mockResolvedValueOnce({ plan: plans[i] });
          if (i >= j) {
            await expect(requirePlan('org-1', plans[j]!)).resolves.toBeUndefined();
          } else {
            await expect(requirePlan('org-1', plans[j]!)).rejects.toThrow(PlanError);
          }
        }
      }
    });
  });
});
