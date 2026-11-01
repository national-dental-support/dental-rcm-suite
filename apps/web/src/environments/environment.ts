// Dental RCM Suite - runtime configuration.
//
// This file ships with safe defaults and contains no tenant-, directory- or
// deployment-specific identifiers. Copy it, do not edit it in place, if you
// need per-environment values.
//
// Authentication: the suite authenticates against its own user table by
// default. The first install logs in with the seeded superadmin account and is
// forced to change that password before anything else is reachable. See
// docs/auth.md.
//
// Single sign-on is optional and is configured entirely through server-side
// environment variables (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_AUDIENCE,
// OIDC_JWKS_URL). No identity-provider values belong in this file or in the
// browser bundle.

export const environment = {
  production: false,

  // Short label shown in the UI to distinguish deployments. Free text.
  envName: 'local',

  // API server. Served same-origin through the dev proxy by default; see
  // proxy.conf.json.
  server: {
    baseUrl: '/api',
    socketUrl: '',
    serverSuperToken: '/superToken',
  },

  // Optional Apache Superset embedding. Leave empty to disable; the dashboard
  // panels then render an empty state rather than erroring.
  superSet: {
    origin: '',
    baseUrl: '',
  },

  // Optional object storage for claim documents and attachments. Leave empty to
  // disable uploads. The SAS endpoint is served by the API, which holds the
  // storage credential - the browser never receives one.
  storageUrl: '',
  storageAccount: '',
  container: 'documents',
  sasEndpoint: '/api/storage/sas?container=documents',

  nodeEnv: 'development',
};
