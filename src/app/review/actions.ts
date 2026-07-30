"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appearance, faceRef, photo } from "@/db/schema";
import { getObject, keys, putObject } from "@/lib/storage";
import { recognitionEnabled } from "@/lib/env";
import { indexFace } from "@/lib/recognition";
import { hammingDistance } from "@/lib/images";
import sharp from "sharp";

/** Reference faces kept per person. Past this, more adds noise, not accuracy. */
const MAX_REFERENCE_FACES = 20;

/**
 * Confirms that a queued face is who the system guessed — or who the reviewer
 * says instead.
 *
 * This is the loop that makes the archive improve: every confirmation becomes
 * a reference face, so the system learns that person under this season's
 * light, angle and haircut. With weekly training it converges within a few
 * sessions.
 *
 * Only human-confirmed crops are ever indexed. Feeding automatic matches back
 * in would let a single mistake reinforce itself.
 */
export async function confirmAppearance(appearanceId: string, personId: string, reviewer: string) {
  const [row] = await db
    .select()
    .from(appearance)
    .where(eq(appearance.id, appearanceId))
    .limit(1);
  if (!row) return { ok: false, error: "no existe" };

  await db
    .update(appearance)
    .set({
      personId,
      state: "confirmed",
      source: "human",
      reviewedBy: reviewer,
      reviewedAt: new Date(),
    })
    .where(eq(appearance.id, appearanceId));

  await enrolFromAppearance(row.photoId, personId, row.bbox as Box);

  revalidatePath("/review");
  return { ok: true };
}

export async function rejectAppearance(appearanceId: string, reviewer: string) {
  await db
    .update(appearance)
    .set({ state: "rejected", source: "human", reviewedBy: reviewer, reviewedAt: new Date() })
    .where(eq(appearance.id, appearanceId));

  revalidatePath("/review");
  return { ok: true };
}

/**
 * Applies one decision to every near-identical frame in the same burst.
 *
 * A photographer's twelve frames of one moment are one decision, not twelve.
 * This is most of why a reviewer can clear 400-600 faces an hour instead of 60.
 */
export async function confirmBurst(appearanceId: string, personId: string, reviewer: string) {
  const [row] = await db
    .select({ photoId: appearance.photoId })
    .from(appearance)
    .where(eq(appearance.id, appearanceId))
    .limit(1);
  if (!row) return { ok: false, error: "no existe" };

  const [source] = await db
    .select({ phash: photo.phash, sessionId: photo.sessionId })
    .from(photo)
    .where(eq(photo.id, row.photoId))
    .limit(1);

  await confirmAppearance(appearanceId, personId, reviewer);
  if (!source?.phash || !source.sessionId) return { ok: true, alsoConfirmed: 0 };

  // Near-identical frames from the same session, still awaiting review.
  const siblings = await db
    .select({ id: appearance.id, phash: photo.phash })
    .from(appearance)
    .innerJoin(photo, eq(photo.id, appearance.photoId))
    .where(and(eq(photo.sessionId, source.sessionId), eq(appearance.state, "review")));

  let alsoConfirmed = 0;
  for (const sibling of siblings) {
    if (!sibling.phash) continue;
    if (hammingDistance(source.phash, sibling.phash) > 10) continue;
    await confirmAppearance(sibling.id, personId, reviewer);
    alsoConfirmed++;
  }

  revalidatePath("/review");
  return { ok: true, alsoConfirmed };
}

type Box = { x: number; y: number; w: number; h: number };

/** Stores the confirmed crop and, if AWS is live, adds it to the collection. */
async function enrolFromAppearance(photoId: string, personId: string, box: Box) {
  const existing = await db
    .select({ id: faceRef.id })
    .from(faceRef)
    .where(eq(faceRef.personId, personId));
  if (existing.length >= MAX_REFERENCE_FACES) return;

  const [row] = await db
    .select({ storageKey: photo.storageKey, width: photo.width, height: photo.height })
    .from(photo)
    .where(eq(photo.id, photoId))
    .limit(1);
  if (!row?.width || !row.height) return;

  const original = await getObject(row.storageKey);
  const margin = 0.25;
  const left = Math.max(0, Math.round((box.x - box.w * margin) * row.width));
  const top = Math.max(0, Math.round((box.y - box.h * margin) * row.height));
  const width = Math.min(row.width - left, Math.round(box.w * (1 + margin * 2) * row.width));
  const height = Math.min(row.height - top, Math.round(box.h * (1 + margin * 2) * row.height));

  const crop = await sharp(original).extract({ left, top, width, height }).jpeg().toBuffer();

  const cropId = `${photoId}-${personId}`;
  await putObject(keys.crop(cropId), crop, "image/jpeg");

  const awsFaceId = recognitionEnabled() ? await indexFace(crop, personId) : null;

  await db.insert(faceRef).values({
    personId,
    awsFaceId,
    cropKey: keys.crop(cropId),
    origin: "human_confirm",
  });
}
