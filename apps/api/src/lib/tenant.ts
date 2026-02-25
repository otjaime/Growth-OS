// ──────────────────────────────────────────────────────────────
// Multi-tenancy helpers for route handlers
// ──────────────────────────────────────────────────────────────

import type { FastifyRequest } from 'fastify';

/**
 * Returns a Prisma `where` fragment that scopes queries to the
 * authenticated organization. If no org is set (legacy / dev mode),
 * returns an empty object so all data is visible.
 *
 * Usage:
 *   prisma.factOrder.findMany({ where: { ...orgWhere(request), orderDate: { gte } } })
 */
export function orgWhere(request: FastifyRequest): { organizationId?: string } {
  return request.organizationId ? { organizationId: request.organizationId } : {};
}

/**
 * Returns data fields to include when creating tenant-scoped records.
 * Spreads `organizationId` into the `data` block only when present.
 *
 * Usage:
 *   prisma.experiment.create({ data: { ...orgData(request), name, hypothesis } })
 */
export function orgData(request: FastifyRequest): { organizationId?: string } {
  return request.organizationId ? { organizationId: request.organizationId } : {};
}

/**
 * Returns a parameterized SQL fragment and params for $queryRawUnsafe.
 *
 * Usage:
 *   const org = orgSqlParam(request, 3); // next positional param is $3
 *   prisma.$queryRawUnsafe(
 *     `SELECT ... WHERE x = $1 AND y = $2${org.clause}`,
 *     a, b, ...org.params
 *   )
 */
export interface OrgSqlParam {
  clause: string;
  params: readonly string[];
}

export function orgSqlParam(request: FastifyRequest, nextIndex: number): OrgSqlParam {
  if (request.organizationId) {
    return {
      clause: ` AND organization_id = $${nextIndex}`,
      params: [request.organizationId],
    };
  }
  return { clause: '', params: [] };
}

/**
 * Returns the organizationId or undefined. Useful for passing into
 * helper functions like gatherWeekOverWeekData().
 */
export function getOrgId(request: FastifyRequest): string | undefined {
  return request.organizationId;
}
