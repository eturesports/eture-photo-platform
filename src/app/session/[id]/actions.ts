"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { photo } from "@/db/schema";
import { findSessionForTimestamp } from "@/lib/sessions";
import { requireRole } from "@/lib/access";

/**
 * Fixing a camera whose clock was wrong.
 *
 * This is the one failure that ruins a whole upload rather than one photo: a
 * camera set to the wrong timezone, or never adjusted after a flight, shifts
 * every frame on the card by the same amount. The photos then match the wrong
 * session, or none at all, and there is no way to fix that photo by photo
 * without it taking longer than the shoot did.
 *
 * The offset is applied to whole batches and the sessions are recomputed from
 * the corrected times, so the fix goes through exactly the same matching the
 * ingest used.
 */

const ShiftInput = z.object({
  sessionId: z.string().uuid().optional(),
  photographer: z.string().max(120).optional(),
  /** Signed, in minutes: -60 pulls everything back an hour. */
  minutes: z.coerce.number().int().min(-72 * 60).max(72 * 60),
});

export type ShiftOutcome =
  | { ok: true; moved: number; reassigned: number; orphaned: number }
  | { ok: false; error: string };

export async function shiftCaptureTimes(formData: FormData): Promise<ShiftOutcome> {
  await requireRole("admin", "media");

  const parsed = ShiftInput.safeParse({
    sessionId: formData.get("sessionId") || undefined,
    photographer: formData.get("photographer") || undefined,
    minutes: formData.get("minutes"),
  });
  if (!parsed.success) return { ok: false, error: "desfase inválido" };

  const { sessionId, photographer, minutes } = parsed.data;
  if (minutes === 0) return { ok: false, error: "el desfase es cero" };
  if (!sessionId && !photographer) {
    return { ok: false, error: "hay que acotar a una sesión o a un fotógrafo" };
  }

  const scope = sessionId
    ? eq(photo.sessionId, sessionId)
    : eq(photo.photographer, photographer!);

  const affected = await db
    .select({ id: photo.id, shotAt: photo.shotAt })
    .from(photo)
    .where(scope);

  const withTimes = affected.filter((p) => p.shotAt);
  if (withTimes.length === 0) {
    return { ok: false, error: "ninguna de esas fotos tiene hora de captura" };
  }

  // One statement for the shift; doing it row by row would be slower and would
  // leave the batch half-corrected if it failed midway.
  await db
    .update(photo)
    .set({ shotAt: sql`${photo.shotAt} + make_interval(mins => ${minutes})` })
    .where(and(scope, sql`${photo.shotAt} is not null`));

  // Re-run the same session matching the ingest uses, so a correction cannot
  // drift from how the photos were filed in the first place.
  let reassigned = 0;
  let orphaned = 0;

  const moved = await db
    .select({ id: photo.id, shotAt: photo.shotAt, sessionId: photo.sessionId })
    .from(photo)
    .where(and(scope, sql`${photo.shotAt} is not null`));

  for (const row of moved) {
    const target = await findSessionForTimestamp(row.shotAt!);
    if (target === row.sessionId) continue;
    await db.update(photo).set({ sessionId: target }).where(eq(photo.id, row.id));
    if (target) reassigned++;
    else orphaned++;
  }

  revalidatePath("/sessions");
  if (sessionId) revalidatePath(`/session/${sessionId}`);

  return { ok: true, moved: withTimes.length, reassigned, orphaned };
}
