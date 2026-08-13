"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { db } from "@/db";
import { consent, faceRef, person } from "@/db/schema";
import { deleteObject, keys, putObject } from "@/lib/storage";
import { recognitionEnabled } from "@/lib/env";
import { detectFaces, indexFace } from "@/lib/recognition";
import { requireRole } from "@/lib/access";
import { MAX_PORTRAITS } from "@/lib/enrolment";

/**
 * Enrolment: giving the system a face it can recognise someone by.
 *
 * This is the highest-return twenty minutes of the whole project. Without a
 * reference face the archive can group a person's photos together but cannot
 * put a name to them, so nothing files itself. Ten seconds per person at
 * accreditation solves it for the season.
 */

const Input = z.object({
  personId: z.string().uuid(),
  /** A data URL from the webcam, or an uploaded file's bytes. */
  imageBase64: z.string().min(100).max(12_000_000),
});

export type EnrolOutcome =
  | { ok: true; faces: number; total: number }
  | { ok: false; error: string };

export async function addPortrait(input: unknown): Promise<EnrolOutcome> {
  await requireRole("admin", "media");

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "datos inválidos" };

  const [subject] = await db
    .select({ id: person.id, fullName: person.fullName })
    .from(person)
    .where(eq(person.id, parsed.data.personId))
    .limit(1);
  if (!subject) return { ok: false, error: "no existe esa persona" };

  // The consent gate, checked here as well as in the worker. A reference face
  // IS the biometric datum — enrolling without consent would be the exact
  // thing Article 9 prohibits, and doing it from a friendlier screen does not
  // make it different.
  const [permission] = await db
    .select({ id: consent.id })
    .from(consent)
    .where(
      and(
        eq(consent.personId, subject.id),
        eq(consent.scope, "biometric"),
        eq(consent.granted, true),
        isNull(consent.revokedAt),
      ),
    )
    .limit(1);

  if (!permission) {
    return {
      ok: false,
      error: `${subject.fullName} no tiene consentimiento biométrico registrado. Regístralo antes de tomar el retrato.`,
    };
  }

  const existing = await db
    .select({ id: faceRef.id })
    .from(faceRef)
    .where(eq(faceRef.personId, subject.id));

  if (existing.length >= MAX_PORTRAITS) {
    return { ok: false, error: `Ya tiene ${MAX_PORTRAITS} retratos, que es de sobra.` };
  }

  const raw = Buffer.from(
    parsed.data.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
    "base64",
  );

  // Normalise before storing: honour the orientation flag, cap the size, and
  // re-encode. A camera roll photo can be 12MP, and none of that resolution
  // survives into a face vector.
  let portrait: Buffer;
  try {
    portrait = await sharp(raw)
      .rotate()
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return { ok: false, error: "no se ha podido leer la imagen" };
  }

  const meta = await sharp(portrait).metadata();

  // Reject at capture time rather than storing something the recogniser will
  // quietly ignore. Telling someone to retake a photo while they are standing
  // in front of you costs seconds; discovering it in February costs the season.
  if (recognitionEnabled()) {
    const faces = await detectFaces(portrait, meta.width ?? 0, meta.height ?? 0);
    if (faces.length === 0) {
      return { ok: false, error: "No se ve ninguna cara clara. Repite la foto." };
    }
    if (faces.length > 1) {
      return {
        ok: false,
        error: `Se ven ${faces.length} caras. En el retrato tiene que salir sólo ${subject.fullName}.`,
      };
    }
  }

  const cropId = `enrolment-${subject.id}-${existing.length + 1}`;
  await putObject(keys.crop(cropId), portrait, "image/jpeg");

  const awsFaceId = recognitionEnabled() ? await indexFace(portrait, subject.id) : null;

  await db.insert(faceRef).values({
    personId: subject.id,
    awsFaceId,
    cropKey: keys.crop(cropId),
    origin: "enrolment",
  });

  revalidatePath("/enrolment");
  revalidatePath(`/person/${subject.id}`);

  return { ok: true, faces: 1, total: existing.length + 1 };
}

export async function removePortrait(faceRefId: string) {
  await requireRole("admin", "media");

  const [row] = await db
    .select({ cropKey: faceRef.cropKey, personId: faceRef.personId })
    .from(faceRef)
    .where(eq(faceRef.id, faceRefId))
    .limit(1);
  if (!row) return { ok: false, error: "no existe" };

  await db.delete(faceRef).where(eq(faceRef.id, faceRefId));

  // Best effort: an orphaned object costs a fraction of a cent, a failed
  // delete that blocks the database row costs a confusing bug.
  try {
    await deleteObject(row.cropKey);
  } catch {
    /* ignore */
  }

  revalidatePath("/enrolment");
  return { ok: true };
}
