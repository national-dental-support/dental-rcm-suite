import packageJson from '../package.json';
/**
 * Pattern for config is:
 * key: process.env['KEY'] ?? default
 */
const config = {
  version: packageJson.version,
  name: packageJson.name,
  description: packageJson.description,
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: process.env['PORT'] ?? 8080,
  apiKey: process.env['API_KEY'],
  apiUsername: process.env['API_USERNAME'] ?? '',
  apiPassword: process.env['API_PASSWORD'] ?? '',
  // IPv4 literals, not "localhost": on Windows that resolves to ::1 first and
  // misses an IPv4-only listener.
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://127.0.0.1:4200',
  clientCorsOrigins: {
    test: process.env['DEV_ORIGIN'] ?? '',
    development: process.env['DEV_ORIGIN'] ?? 'http://127.0.0.1:4200',
    production: process.env['PROD_ORIGIN'] ?? '',
  },
  // DB_* are the documented names - .env.example, docker-compose.yml and
  // db/migrate.js all use them. The MSSQL_* names are what this file read
  // originally, and they are kept as a fallback so an existing deployment's
  // environment still works.
  //
  // This mattered: while only MSSQL_* was read, setting the documented DB_*
  // variables configured nothing. The server started, every pool fell back to
  // an empty server name, and the only symptom was "Failed to connect to :1433"
  // in a log nobody reads on a first install.
  msSQL: {
    databaseName: process.env['DB_NAME'] ?? process.env['MSSQL_DB_NAME'] ?? '',
    username: process.env['DB_USER'] ?? process.env['MSSQL_USERNAME'] ?? '',
    password: process.env['DB_PASSWORD'] ?? process.env['MSSQL_PASSWORD'] ?? '',
    server: process.env['DB_SERVER'] ?? process.env['MSSQL_SERVER'] ?? '',
    port: parseInt(
      process.env['DB_PORT'] ?? process.env['MSSQL_PORT'] ?? '1433',
      10,
    ),
    connectionString:
      process.env['DB_CONNECTION_STRING'] ??
      process.env['MSSQL_CONNECTION_STRING'] ??
      '',
  },
};

export default config;
