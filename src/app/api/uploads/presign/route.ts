/**
 * Hands the browser a URL to PUT the original straight to R2.
 *
 * The client sends the file's SHA-256, computed locally, before uploading
 * anything. That means a card uploaded twice — which happens constantly — is
 * detected without spending the bandwidth, and the photographer sees
 * "42 new, 380 already here" instead of a duplicate-key error.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { photo } from "@/db/schema";
import { keys, presignUpload } from "@/lib/storage";

const Body = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^image\/(jpeg|png|webp|avif)$/, "images only"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  photographer: z.string().min(1).max(120),
  sessionId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { filename, contentType, sha256, photographer, sessionId, batchId } = parsed.data;

  const [existing] = await db
    .select({ id: photo.id })
    .from(photo)
    .where(eq(photo.sha256, sha256))
    .limit(1);

  if (existing) {
    return NextResponse.json({ duplicate: true, photoId: existing.id });
  }

  const extension = (filename.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);

  const [created] = await db
    .insert(photo)
    .values({
      // A placeholder that the real key is derived from; the row's own id names
      // the object, so nothing depends on the photographer's filenames.
      storageKey: "pending",
      sha256,
      photographer,
      sessionId,
      batchId,
      status: "pending",
    })
    .returning({ id: photo.id });

  const storageKey = keys.original(created.id, extension);
  await db.update(photo).set({ storageKey }).where(eq(photo.id, created.id));

  return NextResponse.json({
    duplicate: false,
    photoId: created.id,
    uploadUrl: await presignUpload(storageKey, contentType),
  });
}
