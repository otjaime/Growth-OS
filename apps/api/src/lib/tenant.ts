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
 * SQL fragment for raw queries. Returns the clause + params array.
 *
 * Usage:
 *   const org = orgSqlClause(request);
 *   prisma.$queryRaw`SELECT ... WHERE 1=1 ${org.fragment}`
 *
 * For $queryRawUnsafe, use orgSqlWhere() instead.
 */
export function orgSqlWhere(request: FastifyRequest): string {
  return request.organizationId
    ? ` AND organization_id = '${request.organizationId}'`
    : '';
}

/**
 * Returns the organizationId or undefined. Useful for passing into
 * helper functions like gatherWeekOverWeekData().
 */
export function getOrgId(request: FastifyRequest): string | undefined {
  return request.organizationId;
}
