import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * postgres.js rather than the Neon driver, deliberately.
 *
 * The specification keeps a European-provider fallback open in case the
 * data-protection review rules out US-owned processors for biometric data on
 * minors. A plain Postgres client means that move is a connection string, not
 * a rewrite.
 *
 * `max: 1` because each serverless instance handles one request at a time;
 * pooling is the provider's pooler's job, not ours.
 *
 * Connected lazily so that `next build` never needs a live database — pages
 * import this module, and opening a socket at import time would make the build
 * depend on production credentials.
 */
/**
 * Parameters that belong to libpq's connection string but are not Postgres
 * server settings.
 *
 * postgres.js forwards anything it does not recognise to the server as a
 * startup parameter, and the server rejects what it has never heard of. Neon
 * hands out `channel_binding=require` by default, so pasting their connection
 * string unedited produces "unrecognized configuration parameter" — an error
 * that says nothing about the real cause. Dropping these is safe: TLS is still
 * enforced by `sslmode`, which postgres.js does understand.
 */
const LIBPQ_ONLY_PARAMS = ["channel_binding", "target_session_attrs", "gssencmode"];

function sanitise(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of LIBPQ_ONLY_PARAMS) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    // Not a URL we can parse — hand it through untouched and let the driver
    // produce its own error rather than inventing one.
    return url;
  }
}

let cached: PostgresJsDatabase<typeof schema> | null = null;

function connect(): PostgresJsDatabase<typeof schema> {
  if (!cached) {
    cached = drizzle(postgres(sanitise(env.DATABASE_URL), { max: 1, prepare: false }), {
      schema,
    });
  }
  return cached;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get: (_target, key: string) => {
    const value = connect()[key as keyof PostgresJsDatabase<typeof schema>];
    return typeof value === "function" ? value.bind(connect()) : value;
  },
  // Drizzle's `is()` — which the Auth.js adapter uses to work out the dialect —
  // walks the prototype chain looking for a brand on the constructor. Without
  // this trap it sees a bare object and refuses to build the adapter.
  getPrototypeOf: () => Object.getPrototypeOf(connect()),
  has: (_target, key) => key in connect(),
});

export { schema };
