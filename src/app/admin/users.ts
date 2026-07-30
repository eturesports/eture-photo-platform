"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appUser, guardianOf, person } from "@/db/schema";
import { requireRole } from "@/lib/access";

/**
 * Account management.
 *
 * There is no sign-up form anywhere in this application: an account exists
 * because someone here created it. Everything below is that act.
 */

const InviteInput = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional(),
  role: z.enum(["team", "photographer", "family"]),
  personSlug: z.string().max(200).optional(),
});

export async function inviteUser(formData: FormData) {
  await requireRole("team");

  const parsed = InviteInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "datos incompletos" };

  const email = parsed.data.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);
  if (existing) return { ok: false, error: "esa dirección ya tiene cuenta" };

  // A family account with nobody attached can see nothing, which is a
  // confusing thing to hand someone. Insist on the link at creation.
  let personId: string | null = null;
  if (parsed.data.role === "family") {
    if (!parsed.data.personSlug) {
      return { ok: false, error: "una cuenta de familia necesita un jugador vinculado" };
    }
    const [found] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.slug, parsed.data.personSlug))
      .limit(1);
    if (!found) return { ok: false, error: "no existe ese jugador" };
    personId = found.id;
  }

  const [created] = await db
    .insert(appUser)
    .values({ email, name: parsed.data.name || null, role: parsed.data.role })
    .returning({ id: appUser.id });

  if (personId) {
    await db.insert(guardianOf).values({ userId: created.id, personId });
  }

  revalidatePath("/admin");
  return {
    ok: true,
    message: `Cuenta creada para ${email}. Ya puede pedir su enlace de acceso.`,
  };
}

/**
 * Disabling rather than deleting.
 *
 * Deleting the row would cascade the access log's meaning away — and the log
 * is precisely what answers "who saw my child's photographs". Sessions are
 * stored in the database, so this takes effect on the next request.
 */
export async function setUserDisabled(formData: FormData) {
  await requireRole("team");

  const userId = String(formData.get("userId") ?? "");
  const disabled = String(formData.get("disabled") ?? "") === "true";
  if (!userId) return { ok: false, error: "falta el usuario" };

  await db
    .update(appUser)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(appUser.id, userId));

  revalidatePath("/admin");
  return { ok: true };
}

export async function linkGuardian(formData: FormData) {
  await requireRole("team");

  const userId = String(formData.get("userId") ?? "");
  const personSlug = String(formData.get("personSlug") ?? "");
  if (!userId || !personSlug) return { ok: false, error: "datos incompletos" };

  const [found] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.slug, personSlug))
    .limit(1);
  if (!found) return { ok: false, error: "no existe ese jugador" };

  const [already] = await db
    .select({ personId: guardianOf.personId })
    .from(guardianOf)
    .where(and(eq(guardianOf.userId, userId), eq(guardianOf.personId, found.id)))
    .limit(1);
  if (already) return { ok: true };

  await db.insert(guardianOf).values({ userId, personId: found.id });
  revalidatePath("/admin");
  return { ok: true };
}
