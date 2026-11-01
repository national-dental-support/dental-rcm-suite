// The database the controllers qualify their queries with.
//
// DB_NAME is the documented setting; MSSQL_DB_NAME is kept as a fallback for an
// environment that already uses it, matching src/config.ts. The default is the
// suite's own database name - it used to be an internal database name from the
// system this code came from, which meant an unconfigured install issued queries
// against a database that does not exist here.
export const databases = [
  process.env.DB_NAME ?? process.env.MSSQL_DB_NAME ?? 'dental_rcm',
];
