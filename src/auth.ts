/**
 * Authentication: emailed magic links, no passwords, no self-registration.
 *
 * Magic links because the audience includes families who will sign in twice a
 * season. A password they set in October is a password they have forgotten by
 * February, and every forgotten password is a support request — or worse, a
 * reused one.
 *
 * The security property that matters here is in `signIn` below: an address
 * that is not already an account gets nothing. Left at its default, a magic
 * link provider will happily create an account for whoever asks, which for an
 * archive of photographs of minors would be an open door.
 */

import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, appUser, authSession, verificationToken } from "@/db/schema";

export type Role = "team" | "photographer" | "family";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: appUser,
    accountsTable: account,
    sessionsTable: authSession,
    verificationTokensTable: verificationToken,
  }),

  session: {
    // Database sessions rather than JWTs: disabling an account has to take
    // effect now, not whenever a token happens to expire. Families leave the
    // programme and photographers stop working with the club.
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: { signIn: "/login", verifyRequest: "/login/check", error: "/login" },

  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM ?? "archivo@eturesports.com",
      // Short-lived: a link sitting in an inbox is a standing key to the archive.
      maxAge: 15 * 60,
    }),
  ],

  callbacks: {
    /**
     * The gate. Only addresses that already have an account may sign in, and
     * only if they have not been disabled.
     *
     * Returning false here means the link is never sent, so the endpoint
     * cannot be used to discover who has an account either.
     */
    async signIn({ user }) {
      if (!user.email) return false;

      const [existing] = await db
        .select({ id: appUser.id, disabledAt: appUser.disabledAt })
        .from(appUser)
        .where(eq(appUser.email, user.email.toLowerCase()))
        .limit(1);

      return Boolean(existing) && !existing.disabledAt;
    },

    /**
     * Runs on every request, which is what makes disabling an account bite
     * immediately rather than whenever the cookie happens to expire.
     *
     * Checking `disabledAt` only at sign-in would leave someone already
     * signed in with up to thirty days of access after being removed — which
     * is precisely the situation you disable an account to end.
     */
    async session({ session, user }) {
      const [row] = await db
        .select({ role: appUser.role, disabledAt: appUser.disabledAt })
        .from(appUser)
        .where(eq(appUser.id, user.id))
        .limit(1);

      if (!row || row.disabledAt) {
        // Destroy every session this account holds, so the cookie is dead from
        // here on rather than merely ignored once.
        await db.delete(authSession).where(eq(authSession.userId, user.id));
        // No id means no viewer: `requireViewer` sends them to the login page.
        session.user.id = "";
        session.user.role = "family";
        return session;
      }

      session.user.id = user.id;
      session.user.role = (row.role as Role) ?? "family";
      return session;
    },
  },
});
