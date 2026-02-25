import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { orgWhere, orgData, orgSqlParam, getOrgId } from './tenant.js';

function fakeRequest(organizationId?: string): FastifyRequest {
  return { organizationId } as unknown as FastifyRequest;
}

describe('tenant helpers', () => {
  describe('orgWhere', () => {
    it('returns organizationId when present', () => {
      expect(orgWhere(fakeRequest('org-1'))).toEqual({ organizationId: 'org-1' });
    });

    it('returns empty object when no org', () => {
      expect(orgWhere(fakeRequest())).toEqual({});
    });
  });

  describe('orgData', () => {
    it('returns organizationId when present', () => {
      expect(orgData(fakeRequest('org-1'))).toEqual({ organizationId: 'org-1' });
    });

    it('returns empty object when no org', () => {
      expect(orgData(fakeRequest())).toEqual({});
    });
  });

  describe('orgSqlParam', () => {
    it('returns parameterized clause and param when org set', () => {
      const result = orgSqlParam(fakeRequest('org-1'), 3);
      expect(result.clause).toBe(' AND organization_id = $3');
      expect(result.params).toEqual(['org-1']);
    });

    it('returns empty clause and no params when no org', () => {
      const result = orgSqlParam(fakeRequest(), 3);
      expect(result.clause).toBe('');
      expect(result.params).toEqual([]);
    });

    it('uses correct index parameter', () => {
      const result = orgSqlParam(fakeRequest('org-1'), 5);
      expect(result.clause).toBe(' AND organization_id = $5');
    });
  });

  describe('getOrgId', () => {
    it('returns organizationId when present', () => {
      expect(getOrgId(fakeRequest('org-1'))).toBe('org-1');
    });

    it('returns undefined when no org', () => {
      expect(getOrgId(fakeRequest())).toBeUndefined();
    });
  });
});
