import config from './config';

const dbConfig = {
  user: config.msSQL.username,
  password: config.msSQL.password,
  server: config.msSQL.server,
  database: config.msSQL.databaseName,
  port: config.msSQL.port,
  options: {
    encrypt: true,
    trustServerCertificate: true, // Required: remote DB uses self-signed cert
    connectTimeout: 60000, // Increase to 60 seconds for initial connection
    // S1: cap at 60s (was 300000/5min). A stuck query must not hold a pooled
    // connection for 5 minutes - that is what exhausted the request pool and
    // produced the transient 500s. (Boot-time bulk seeders use their own
    // long-timeout connections, not this request pool.)
    requestTimeout: 60000,
  },
  pool: {
    // S1: raised from 10. Requests + ~20 background schedulers + the health loop
    // all share this pool; 10 was too small under load.
    max: 25,
    min: 2,                    // Keep 2 connections alive to avoid cold-reconnect on every idle period
    idleTimeoutMillis: 300000, // 5 min - prevents pool from releasing connections too aggressively
  },
};

export { dbConfig };
