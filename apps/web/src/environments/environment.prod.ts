// Dental RCM Suite - production configuration.
//
// Safe defaults only: this file contains no tenant-, directory- or
// deployment-specific identifiers, and no credentials. Override it at build or
// deploy time for a real deployment - see docs/first-install.md.
//
// Authentication is handled by the API against its own user table. Optional
// single sign-on is configured through server-side environment variables, never
// in the browser bundle.

export const environment = {
  production: true,

  envName: 'production',

  server: {
    baseUrl: '/api',
    socketUrl: '',
    serverSuperToken: '/superToken',
  },

  // Optional Apache Superset embedding. Leave empty to disable.
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

  nodeEnv: 'production',
};
