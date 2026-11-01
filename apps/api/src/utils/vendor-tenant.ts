import logger from './logger';

/**
 * The operator's own tenant, if they run one.
 *
 * Some deployments keep a tenant for the operating organisation itself, whose
 * administrators are allowed to see across all client tenants. That is a
 * deliberate, configured escalation, so it is **off unless set**:
 *
 *   VENDOR_CUSTOMER_ID=7
 *
 * Why this matters: if the privileged tenant id were hardcoded, then in any
 * deployment where a real practice happened to land on that id, every
 * `role='Admin'` user there would silently gain cross-tenant visibility and
 * bypass product entitlement checks. Install order would decide who owns the
 * estate. So an unset, empty, non-numeric or non-positive value disables the
 * concept entirely rather than falling back to a default.
 */

let warned = false;

export function vendorTenantId(): number | null {
  const raw = process.env['VENDOR_CUSTOMER_ID'];
  if (raw == null || raw.trim() === '') return null;

  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    if (!warned) {
      warned = true;
      logger.error(
        '[VendorTenant] VENDOR_CUSTOMER_ID is set but is not a positive integer - ' +
        'cross-tenant administration stays disabled',
        { value: raw, alert: 'VENDOR_TENANT_MISCONFIGURED' },
      );
    }
    return null;
  }

  return id;
}

/** True when this user is an administrator of the operator's own tenant. */
export function isVendorAdmin(role: string, customerId: number | null): boolean {
  const vendor = vendorTenantId();
  if (vendor == null || customerId == null) return false;
  return customerId === vendor && (role === 'Admin' || role === 'Super Admin');
}
