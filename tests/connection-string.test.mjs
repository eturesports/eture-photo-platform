// The Neon connection string arrives with libpq-only parameters that
// postgres.js forwards to the server, which rejects them. Verified here
// against a real database, because the failure is a runtime connection error
// no type check would catch.
import postgres from "postgres";

const LIBPQ_ONLY_PARAMS = ["channel_binding", "target_session_attrs", "gssencmode"];
function sanitise(url) {
  try {
    const parsed = new URL(url);
    for (const key of LIBPQ_ONLY_PARAMS) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch {
    return url;
  }
}

const BASE = process.env.TEST_DATABASE_URL;
if (!BASE) {
  console.log("SKIP  no TEST_DATABASE_URL set");
  process.exit(0);
}

const results = [];
const check = (n, p, d) => results.push({ n, p, d });

// Shape of the string Neon actually hands out.
const neonStyle = `${BASE}?sslmode=require&channel_binding=require`;

check("channel_binding is stripped", !sanitise(neonStyle).includes("channel_binding"), sanitise(neonStyle));
check("sslmode survives", sanitise(neonStyle).includes("sslmode=require"));
check("a plain url is untouched", sanitise(BASE) === new URL(BASE).toString());
check("nonsense is passed through", sanitise("not a url") === "not a url");

// The point of the exercise: it connects.
try {
  const sql = postgres(sanitise(neonStyle), { max: 1, prepare: false, ssl: false, connect_timeout: 5 });
  const [row] = await sql`select 1 as ok`;
  check("a sanitised Neon-style string connects", row.ok === 1);
  await sql.end();
} catch (e) {
  check("a sanitised Neon-style string connects", false, String(e.message).slice(0, 80));
}

// And that the raw one really would have failed, so this test keeps meaning
// something if postgres.js ever changes its behaviour.
try {
  const sql = postgres(neonStyle, { max: 1, prepare: false, ssl: false, connect_timeout: 5 });
  await sql`select 1`;
  await sql.end();
  check("the raw string still fails (guarding the fix)", false, "it succeeded — the workaround may be obsolete");
} catch (e) {
  check("the raw string still fails (guarding the fix)", /channel_binding/.test(e.message), e.message.slice(0, 60));
}

for (const r of results) console.log(`${r.p ? "PASS" : "FAIL"}  ${r.n}${r.d ? `  (${r.d})` : ""}`);
const failed = results.filter((r) => !r.p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
