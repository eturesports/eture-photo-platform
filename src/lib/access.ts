/**
 * Who may see what.
 *
 * Kept in one file on purpose. Access rules scattered across pages are access
 * rules that drift, and the cost of drift here is a family seeing another
 * family's children.
 */

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, type Role } from "@/auth";
import { db } from "@/db";
import { accessLog, personAccess } from "@/db/schema";

export type Viewer = { id: string; email: string; role: Role };

/** The signed-in viewer, or a redirect to the login page. */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

export async function requireRole(...allowed: Role[]): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!allowed.includes(viewer.role)) redirect("/denied");
  return viewer;
}

/**
 * The API-route equivalent: returns a 403 response to hand back, or null when
 * the caller is allowed through.
 *
 * A redirect is the wrong answer to `fetch` — it would arrive as an HTML login
 * page where JSON was expected, and the uploader would report a parse error
 * rather than "you are not signed in".
 */
export async function requireApiRole(...allowed: Role[]): Promise<Response | null> {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id) {
    return Response.json({ error: "no autenticado" }, { status: 401 });
  }
  if (!role || !allowed.includes(role)) {
    return Response.json({ error: "sin permiso" }, { status: 403 });
  }
  return null;
}

/**
 * May this viewer see this person's gallery?
 *
 * Admins and the media department may — the media department is internal
 * staff who have to see galleries to file and check them. Everyone else is
 * limited to the people explicitly linked to their account: a family to their
 * children, a player to themselves.
 */
export async function canViewPerson(viewer: Viewer, personId: string): Promise<boolean> {
  if (viewer.role === "admin" || viewer.role === "media") return true;

  const [link] = await db
    .select({ personId: personAccess.personId })
    .from(personAccess)
    .where(and(eq(personAccess.userId, viewer.id), eq(personAccess.personId, personId)))
    .limit(1);

  return Boolean(link);
}

/** The people a player or family account may see; empty for staff. */
export async function visiblePersonIds(viewer: Viewer): Promise<string[]> {
  if (viewer.role !== "family" && viewer.role !== "player") return [];
  const rows = await db
    .select({ personId: personAccess.personId })
    .from(personAccess)
    .where(eq(personAccess.userId, viewer.id));
  return rows.map((r) => r.personId);
}

/**
 * Records a view or download.
 *
 * This is the log a regulator asks for after a complaint, and the only way to
 * answer "who saw my child's photographs" with something better than a guess.
 * Failing to log must never fail the request the user made.
 */
export async function logAccess(
  viewer: Viewer,
  action: string,
  target: { photoId?: string; personId?: string },
) {
  try {
    await db.insert(accessLog).values({
      actor: viewer.email || viewer.id,
      action,
      photoId: target.photoId ?? null,
      personId: target.personId ?? null,
    });
  } catch {
    // Deliberately swallowed.
  }
}
