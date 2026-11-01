// ============================================================================
// rls-context.ts - fail-closed Row-Level Security request context (Phase 0.6)
//
// The database enforces tenant isolation with a SECURITY POLICY whose predicate
// reads SESSION_CONTEXT('customer_id'), plus 'see_all' for a cross-tenant
// administrator. The policy is created by db/migrations/902_tenant_rls_policy.sql
// and the two keys below are the contract between it and this file: change one
// and you must change the other.
//
// This carries the request's tenant on an AsyncLocalStorage and wraps the shared
// mssql pool so EVERY query batch first sets that session context on the SAME
// pooled connection it runs on.
//
// Fail-closed: a request with no established context sets customer_id = NULL, so
// the DB predicate returns zero rows (unless the connection is db_owner - a
// migration/DBA path - which the predicate bypasses). Pooled connections inherit
// the prior request's context, so we set it on EVERY batch.
// ============================================================================
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  customerId: number | null;
  seeAll: boolean;
}

const store = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return store.getStore();
}

/**
 * System-path bypass (G7): run `fn` with cross-tenant see-all. For the few
 * legitimate pre-tenant / non-request DB paths - auth bootstrap (the dbo.Users
 * lookup that RESOLVES the tenant), entitlement checks, schedulers, boot seeds -
 * which would otherwise fail closed to zero rows once the app connects as a
 * non-db_owner login. Never use inside a tenant request handler.
 */
export function runAsSystem<T>(fn: () => T): T {
  return store.run({ customerId: null, seeAll: true }, fn);
}

/** Express middleware: derive tenant context from req.actor (set by resolveActor). */
export function tenantContextMiddleware(req: any, _res: any, next: (e?: any) => void): void {
  const actor = req && req.actor;
  const cid: number | null = actor && actor.customer_id != null ? Number(actor.customer_id) : null;
  // see_all is granted only to an actor that actually holds cross-tenant
  // privilege. It must NOT be inferred from a missing customer_id: that would
  // turn every request without a resolved tenant into a cross-tenant read,
  // which is the opposite of failing closed. Legitimate pre-tenant paths - the
  // dbo.Users lookup that resolves the tenant, entitlement checks, schedulers -
  // opt in explicitly with runAsSystem().
  const seeAll: boolean = !!(actor && (actor.isSuperAdmin || actor.seeAll));
  runWithTenant({ customerId: cid, seeAll }, () => next());
}

function sessionContextPrefix(): string {
  const ctx = store.getStore();
  const cid = ctx && ctx.customerId != null ? String(Math.trunc(ctx.customerId)) : 'NULL';
  const seeAll = ctx && ctx.seeAll ? '1' : 'NULL';
  return `EXEC sp_set_session_context @key=N'customer_id', @value=${cid}; ` +
         `EXEC sp_set_session_context @key=N'see_all', @value=${seeAll}; `;
}

/**
 * Wrap an mssql ConnectionPool so every Request prepends the session context to
 * its .query()/.batch() in the SAME batch. Returns the same (mutated) pool.
 */
export function installRls<TPool extends { request: (...a: any[]) => any }>(pool: TPool): TPool {
  const origRequest = pool.request.bind(pool);
  (pool as any).request = function wrappedRequest(...args: any[]) {
    const reqObj = origRequest(...args);
    const origQuery = reqObj.query.bind(reqObj);
    const origBatch = reqObj.batch ? reqObj.batch.bind(reqObj) : null;
    reqObj.query = function (command: any, ...rest: any[]) {
      if (typeof command === 'string') return origQuery(sessionContextPrefix() + command, ...rest);
      return origQuery(command, ...rest);
    };
    if (origBatch) {
      reqObj.batch = function (command: any, ...rest: any[]) {
        if (typeof command === 'string') return origBatch(sessionContextPrefix() + command, ...rest);
        return origBatch(command, ...rest);
      };
    }
    return reqObj;
  };
  return pool;
}
