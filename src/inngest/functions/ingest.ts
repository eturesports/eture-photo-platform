/**
 * The ingest pipeline: everything that happens to a photo after it lands in R2.
 *
 * Recognition is one optional stage inside it, not the point of it. If AWS is
 * not configured, or the squad has nobody with biometric consent, the photo
 * still gets its derivatives, its hashes and its session — the archive works,
 * it just files by hand.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { appearance, consent, person, photo, session, squadMember } from "@/db/schema";
import { dHash, makeDerivatives, readImageFacts } from "@/lib/images";
import { getObject, keys, putObject } from "@/lib/storage";
import { findSessionForTimestamp } from "@/lib/sessions";
import { recognitionEnabled } from "@/lib/env";
import { bestInSquad, decide, resolveNumber } from "@/lib/matching";
import { detectFaces, readShirtNumber, searchFace, type Box } from "@/lib/recognition";
import sharp from "sharp";
import { inngest } from "../client";

export const ingestPhoto = inngest.createFunction(
  {
    id: "ingest-photo",
    // A session's selection lands as 100-200 photos at once. Bounded
    // concurrency keeps that from stampeding the database, and it also keeps
    // us inside Inngest's free-tier concurrency.
    concurrency: { limit: 4 },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const photoId = (event.data as { event: { data: { photoId: string } } }).event.data
        .photoId;
      await db
        .update(photo)
        .set({ status: "failed", failureReason: error.message.slice(0, 500) })
        .where(eq(photo.id, photoId));
    },
  },
  { event: "photo/uploaded" },
  async ({ event, step }) => {
    const { photoId } = event.data;

    const row = await step.run("load", async () => {
      const [found] = await db.select().from(photo).where(eq(photo.id, photoId)).limit(1);
      if (!found) throw new Error(`photo ${photoId} not found`);
      return found;
    });

    if (row.status === "done") return { skipped: "already processed" };

    await step.run("mark-processing", () =>
      db.update(photo).set({ status: "processing" }).where(eq(photo.id, photoId)),
    );

    // Download, analyse and write derivatives in one step. Buffers cannot cross
    // a step boundary, and splitting this would mean downloading three times.
    const analysis = await step.run("analyse", async () => {
      const original = await getObject(row.storageKey);

      const [facts, phash, derivatives] = await Promise.all([
        readImageFacts(original),
        dHash(original),
        makeDerivatives(original),
      ]);

      await Promise.all([
        putObject(keys.web(photoId), derivatives.web, "image/jpeg"),
        putObject(keys.thumb(photoId), derivatives.thumb, "image/jpeg"),
      ]);

      return {
        width: facts.width,
        height: facts.height,
        shotAt: facts.shotAt?.toISOString() ?? null,
        // BigInt does not survive JSON, and step results are serialised.
        phash: phash.toString(),
        bytes: original.byteLength,
      };
    });

    const sessionId = await step.run("assign-session", async () => {
      if (row.sessionId) return row.sessionId; // chosen by hand at upload time
      if (!analysis.shotAt) return null; // unreadable EXIF: assign manually
      return findSessionForTimestamp(new Date(analysis.shotAt));
    });

    const recognised = await step.run("recognise", async () => {
      // Every reason to skip is an ordinary state, not an error.
      if (!recognitionEnabled()) return { skipped: "recognition not configured", faces: 0 };
      if (!sessionId) return { skipped: "no session, so no squad to search", faces: 0 };

      const [ctx] = await db
        .select({ squadId: session.squadId, numbersVisible: session.numbersVisible })
        .from(session)
        .where(eq(session.id, sessionId))
        .limit(1);
      if (!ctx) return { skipped: "session vanished", faces: 0 };

      // Only people with live biometric consent may be recognised. This is the
      // enforcement point for GDPR Article 9 — everything else is paperwork.
      const consenting = await db
        .select({ personId: person.id, shirtNumber: squadMember.shirtNumber })
        .from(squadMember)
        .innerJoin(person, eq(person.id, squadMember.personId))
        .innerJoin(
          consent,
          and(
            eq(consent.personId, person.id),
            eq(consent.scope, "biometric"),
            eq(consent.granted, true),
            isNull(consent.revokedAt),
          ),
        )
        .where(and(eq(squadMember.squadId, ctx.squadId), isNull(squadMember.leftOn)));

      if (consenting.length === 0) {
        return { skipped: "nobody in this squad has given biometric consent", faces: 0 };
      }

      const eligible = new Set(consenting.map((c) => c.personId));
      const original = await getObject(row.storageKey);
      const boxes = await detectFaces(original, analysis.width, analysis.height);

      const rows: (typeof appearance.$inferInsert)[] = [];

      for (const box of boxes) {
        const crop = await cropFace(original, box, analysis.width, analysis.height);
        const candidates = await searchFace(crop);
        const face = bestInSquad(candidates, eligible);

        // Shirt numbers only on match days with numbered kit. At training it is
        // bibs and odd shirts, and a number read off a random bib is worse
        // than no number at all.
        let number = null;
        if (ctx.numbersVisible) {
          const torso = await cropTorso(original, box, analysis.width, analysis.height);
          if (torso) {
            const read = await readShirtNumber(torso);
            if (read) number = resolveNumber(read.value, read.confidence, consenting);
          }
        }

        const decision = decide(face, number);
        if (decision.state === "unknown" && !decision.personId) continue;

        rows.push({
          photoId,
          personId: decision.personId,
          bbox: box,
          faceScore: face?.score ?? null,
          numberRead: number?.value ?? null,
          numberScore: number?.confidence ?? null,
          combinedScore: decision.score,
          source: "auto",
          state: decision.state,
        });
      }

      if (rows.length > 0) {
        // A retry must not double-file anyone. The partial unique index guards
        // confirmed rows; this keeps review rows from stacking up too.
        await db.delete(appearance).where(
          and(eq(appearance.photoId, photoId), eq(appearance.source, "auto")),
        );
        await db.insert(appearance).values(rows);
      }

      return {
        faces: boxes.length,
        filed: rows.filter((r) => r.state === "confirmed").length,
        queued: rows.filter((r) => r.state === "review").length,
      };
    });

    await step.run("finish", () =>
      db
        .update(photo)
        .set({
          status: "done",
          width: analysis.width,
          height: analysis.height,
          bytes: analysis.bytes,
          shotAt: analysis.shotAt ? new Date(analysis.shotAt) : null,
          phash: BigInt(analysis.phash),
          sessionId,
          facesDetected: recognised.faces,
          webKey: keys.web(photoId),
          thumbKey: keys.thumb(photoId),
        })
        .where(eq(photo.id, photoId)),
    );

    return { photoId, sessionId, ...recognised };
  },
);

/** A face crop with 25% margin — cropping tight measurably hurts similarity. */
async function cropFace(image: Buffer, box: Box, width: number, height: number) {
  const margin = 0.25;
  const left = Math.max(0, Math.round((box.x - box.w * margin) * width));
  const top = Math.max(0, Math.round((box.y - box.h * margin) * height));
  const w = Math.min(width - left, Math.round(box.w * (1 + margin * 2) * width));
  const h = Math.min(height - top, Math.round(box.h * (1 + margin * 2) * height));

  return sharp(image).extract({ left, top, width: w, height: h }).jpeg().toBuffer();
}

/**
 * The upper torso, derived from the face box — the shirt number sits directly
 * below the head. Never OCR the whole frame: scoreboards, hoardings and the
 * opposition's numbers all read as digits.
 */
async function cropTorso(image: Buffer, box: Box, width: number, height: number) {
  const top = Math.round((box.y + box.h) * height);
  const h = Math.round(box.h * 2.2 * height);
  const left = Math.max(0, Math.round((box.x - box.w * 0.6) * width));
  const w = Math.min(width - left, Math.round(box.w * 2.2 * width));

  if (top >= height || h < 24 || w < 24) return null; // cropped off the frame
  return sharp(image)
    .extract({ left, top, width: w, height: Math.min(height - top, h) })
    .jpeg()
    .toBuffer();
}
