const DEFAULT_PORT = "5432";

// Tests truncate every table, so they must never run against a non-test database.
// Throws unless testUrl is set and differs from every non-test URL; returns testUrl.
export function assertSeparateTestDatabase(testUrl: string | undefined, nonTestUrls: (string | undefined)[]): string {
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is not set. Add it to .env.test (a dedicated test database).");
  }
  if (nonTestUrls.some((url) => url && isSameDatabase(testUrl, url))) {
    throw new Error("TEST_DATABASE_URL points at the same database as DATABASE_URL: tests wipe it. Use a separate test database.");
  }
  return testUrl;
}

// Two connection strings point at the same database when host, port and database name
// match, ignoring credentials, query options and Neon's "-pooler" endpoint suffix.
// An unparseable URL counts as "same", so the guard fails closed.
//
// Tuned for Neon, where the pooler is a different host on the same port. It does not
// catch a pooler on another port of the same host (pgbouncer :6543) or loopback
// aliases (localhost vs 127.0.0.1); a local Postgres setup should use a test database
// with its own name.
export function isSameDatabase(a: string, b: string): boolean {
  const left = databaseIdentity(a);
  const right = databaseIdentity(b);
  return left === null || right === null || left === right;
}

function databaseIdentity(connectionString: string): string | null {
  if (!URL.canParse(connectionString)) return null;
  const url = new URL(connectionString);
  const host = url.hostname.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  return `${host}:${url.port || DEFAULT_PORT}/${database}`;
}
