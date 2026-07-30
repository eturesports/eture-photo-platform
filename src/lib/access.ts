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
import { accessLog, guardianOf } from "@/db/schema";

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
 * Team members may. Families may see only the people they are linked to.
 * Photographers may not see anyone's gallery — they upload, and that is all;
 * handing a freelance a browsable archive of children is not something to do
 * by omission.
 */
export async function canViewPerson(viewer: Viewer, personId: string): Promise<boolean> {
  if (viewer.role === "team") return true;
  if (viewer.role === "photographer") return false;

  const [link] = await db
    .select({ personId: guardianOf.personId })
    .from(guardianOf)
    .where(and(eq(guardianOf.userId, viewer.id), eq(guardianOf.personId, personId)))
    .limit(1);

  return Boolean(link);
}

/** The people a family account may see; empty for anyone else. */
export async function visiblePersonIds(viewer: Viewer): Promise<string[]> {
  if (viewer.role !== "family") return [];
  const rows = await db
    .select({ personId: guardianOf.personId })
    .from(guardianOf)
    .where(eq(guardianOf.userId, viewer.id));
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
