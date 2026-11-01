export const SEED_EMAIL = 'e2e-user@example.com';

/** Matches SESSION_TOKEN_KEY in core/services/auth.services.ts. */
export const SESSION_TOKEN_KEY = 'drs_session_token';

export const SESSION_STORAGE_SEED: Record<string, string> = {
  xUserEmail: SEED_EMAIL,
  myRCMAzureUserFirstName: 'e2e',
  myRCMAzureUserLastName: 'user',
  [SESSION_TOKEN_KEY]: 'e2e-fake-session-token',
  rcm_subscription_state: JSON.stringify({
    customerId: 1,
    subscriptions: ['insightflow', 'denial-iq', 'claim-vision', 'payer-iq', 'recon-iq', 'charge-iq', 'patient-iq'],
    role: 'Admin',
    permissions: { orgAdmin: true, techMonitoringAccess: true },
    _v: 2,
  }),
};

export const SESSION_STORAGE_SEED_NO_INSIGHTFLOW: Record<string, string> = {
  ...SESSION_STORAGE_SEED,
  rcm_subscription_state: JSON.stringify({
    customerId: 1,
    subscriptions: ['denial-iq', 'claim-vision', 'payer-iq', 'recon-iq'],
    role: 'Admin',
    permissions: { orgAdmin: true },
    _v: 2,
  }),
};

export const MOCK_ORG_SUBSCRIPTIONS = {
  customerId: 1,
  subscriptions: ['insightflow', 'denial-iq', 'claim-vision', 'payer-iq', 'recon-iq', 'charge-iq', 'patient-iq'],
  role: 'Admin',
  permissions: { orgAdmin: true },
};

export const MOCK_PRODUCTS = {
  data: [
    { id: 1, slug: 'insightflow',  name: 'InsightFlow',  icon: 'insights',       navRoute: '/app/insightflow',  navOrder: 1, isActive: true },
    { id: 2, slug: 'claim-vision', name: 'Claim Vision', icon: 'search',          navRoute: '/app/claim-vision', navOrder: 2, isActive: true },
    { id: 3, slug: 'payer-iq',     name: 'Payer IQ',     icon: 'account_balance', navRoute: '/app/payer-iq',     navOrder: 3, isActive: true },
    { id: 4, slug: 'recon-iq',     name: 'Recon IQ',     icon: 'balance',         navRoute: '/app/recon-iq',     navOrder: 4, isActive: true },
    { id: 5, slug: 'denial-iq',    name: 'Denial IQ',    icon: 'fact_check',      navRoute: '/app/denial-iq',    navOrder: 5, isActive: true },
    { id: 6, slug: 'charge-iq',   name: 'Charge IQ',    icon: 'receipt_long',    navRoute: '/app/charge-iq',    navOrder: 6, isActive: true },
    { id: 7, slug: 'patient-iq',  name: 'Patient IQ',   icon: 'person',          navRoute: '/app/patient-iq',   navOrder: 7, isActive: true },
  ],
};

export const MOCK_USER = {
  found: true,
  uid: 1,
  email: SEED_EMAIL,
  role: 'Admin',
  organization: 'E2E Org',
};

export const MOCK_INSIGHTFLOW_HEALTH = {
  sections: [
    { section: 'payer-mix', status: 'green',  metric: '98%',        updatedAt: '2026-04-22T00:00:00Z' },
    { section: 'ar',        status: 'yellow', metric: '$42k',       updatedAt: '2026-04-22T00:00:00Z' },
    { section: 'rcm',       status: 'green',  metric: 'OK',         updatedAt: '2026-04-22T00:00:00Z' },
    { section: 'denials',   status: 'red',    metric: '7 critical', updatedAt: '2026-04-22T00:00:00Z' },
    { section: 'kpi',       status: 'green',  metric: 'OK',         updatedAt: '2026-04-22T00:00:00Z' },
  ],
};

export const MOCK_INSIGHTFLOW_KPIS = {
  data: {
    period: { window: 'MTD', start: '2026-04-01', end: '2026-04-22' },
    grossCollectionRate: 0.98,
    netCollectionRate: 0.95,
    selfPayCollectionRate: 0.4,
    denialRate: 0.05,
    firstPassRate: 0.91,
    daysInAR: 32,
    avgDaysToPayment: 28,
    avgDaysToDenial: 14,
    avgDaysToWriteOff: 90,
    arAging90PlusPct: 0.12,
    writeOffRate: 0.02,
    cleanClaimRate: 0.93,
    costToCollect: 0.035,
    denialOverturnRate: 0.6,
    avgReimbursementPerClaim: 210,
  },
};

