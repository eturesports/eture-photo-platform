/**
  * The outer perimeter.
 *
 * Every page-level check still runs in the page itself — this is a first
 * gate, not the only one. Middleware alone is too blunt a place to hold
 * authorisation: it cannot query the database for a family's links, and a
 * route added later would otherwise be unprotected by default.
 *
 * Note it does NOT guard /api/inngest: that endpoint authenticates itself
 * with a signing key, and a redirect to /login would silently break every
 * background job.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/denied", "/api/auth", "/api/inngest"];

/** Without these nothing can work, so say so rather than throwing a 500. */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "AUTH_SECRET",
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A deployment without credentials answers every request with a stack trace
  // otherwise, which tells whoever just deployed it nothing useful.
  if (pathname !== "/setup" && REQUIRED_ENV.some((key) => !process.env[key])) {
    return NextResponse.rewrite(new URL("/setup", request.url));
  }

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Auth.js sets one of these two depending on the deployment's protocol.
  const signedIn =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!signedIn) {
    // An API caller gets JSON. Redirecting `fetch` to a login page hands the
    // uploader HTML where it expected JSON, so it reports a parse error
    // instead of "you are not signed in".
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "no autenticado" }, { status: 401 });
    }

    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
