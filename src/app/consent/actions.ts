"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { accessLog, appearance, consent, faceRef, person } from "@/db/schema";
import { deleteObject } from "@/lib/storage";
import { recognitionEnabled } from "@/lib/env";
import { deleteFaces } from "@/lib/recognition";
import { requireRole } from "@/lib/access";

/**
 * Recording and withdrawing consent.
 *
 * A face vector is special-category data under GDPR Article 9, so consent is
 * the thing that makes any of this lawful. Two consequences shape the code
 * below.
 *
 * Recording it must capture WHO gave it — a guardian for a minor, the person
 * themselves for an adult — because "we have consent" is not a defensible
 * answer to a regulator; "granted by this named person on this date, evidence
 * attached" is.
 *
 * Withdrawing it must actually delete the biometrics, in both the database and
 * Rekognition, on the spot. A revocation that leaves the person recognisable
 * is not a revocation.
 */

const SCOPES = ["biometric", "gallery", "marketing"] as const;

const GrantInput = z.object({
  personId: z.string().uuid(),
  scope: z.enum(SCOPES),
  grantedBy: z.string().min(2).max(160),
  evidenceUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export type ConsentOutcome =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function grantConsent(formData: FormData): Promise<ConsentOutcome> {
  const viewer = await requireRole("admin");

  const parsed = GrantInput.safeParse({
    personId: formData.get("personId"),
    scope: formData.get("scope"),
    grantedBy: formData.get("grantedBy"),
    evidenceUrl: formData.get("evidenceUrl") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Falta quién otorga el consentimiento." };
  }

  const [subject] = await db
    .select({ id: person.id, fullName: person.fullName })
    .from(person)
    .where(eq(person.id, parsed.data.personId))
    .limit(1);
  if (!subject) return { ok: false, error: "no existe esa persona" };

  // One row per person and scope: granting again after a withdrawal reopens
  // the same record rather than leaving two contradictory ones behind.
  await db
    .insert(consent)
    .values({
      personId: subject.id,
      scope: parsed.data.scope,
      granted: true,
      grantedBy: parsed.data.grantedBy.trim(),
      grantedAt: new Date(),
      revokedAt: null,
      evidenceUrl: parsed.data.evidenceUrl || null,
    })
    .onConflictDoUpdate({
      target: [consent.personId, consent.scope],
      set: {
        granted: true,
        grantedBy: parsed.data.grantedBy.trim(),
        grantedAt: new Date(),
        revokedAt: null,
        evidenceUrl: parsed.data.evidenceUrl || null,
      },
    });

  await db.insert(accessLog).values({
    actor: viewer.email || viewer.id,
    action: `consent_granted:${parsed.data.scope}`,
    personId: subject.id,
  });

  revalidatePath("/consent");
  revalidatePath("/enrolment");
  return { ok: true, message: `Consentimiento registrado para ${subject.fullName}.` };
}

/**
 * Withdrawal, which is a deletion and not a flag.
 *
 * The photographs are NOT deleted: they are not solely this person's, and
 * other people appear in them. What goes is the means of recognising them —
 * the reference faces, their vectors in Rekognition, and the stored crops —
 * plus any automatic identification that was made using them. Identifications
 * a human confirmed are kept, because those rest on a person's judgement
 * rather than on the biometric processing being withdrawn.
 */
export async function revokeConsent(formData: FormData): Promise<ConsentOutcome> {
  const viewer = await requireRole("admin");

  const personId = String(formData.get("personId") ?? "");
  const scope = String(formData.get("scope") ?? "");
  if (!personId || !SCOPES.includes(scope as (typeof SCOPES)[number])) {
    return { ok: false, error: "datos incompletos" };
  }

  const [subject] = await db
    .select({ id: person.id, fullName: person.fullName })
    .from(person)
    .where(eq(person.id, personId))
    .limit(1);
  if (!subject) return { ok: false, error: "no existe esa persona" };

  await db
    .update(consent)
    .set({ granted: false, revokedAt: new Date() })
    .where(and(eq(consent.personId, personId), eq(consent.scope, scope)));

  let removed = 0;
  if (scope === "biometric") {
    const refs = await db
      .select({ id: faceRef.id, awsFaceId: faceRef.awsFaceId, cropKey: faceRef.cropKey })
      .from(faceRef)
      .where(eq(faceRef.personId, personId));

    // Rekognition first. If this throws, the database rows survive and the
    // operation can be retried; deleting our side first would leave vectors
    // in the collection with nothing left pointing at them.
    if (recognitionEnabled()) {
      const awsIds = refs.map((r) => r.awsFaceId).filter((id): id is string => Boolean(id));
      await deleteFaces(awsIds);
    }

    await db.delete(faceRef).where(eq(faceRef.personId, personId));

    for (const ref of refs) {
      try {
        await deleteObject(ref.cropKey);
      } catch {
        /* an orphaned object is not worth failing a revocation over */
      }
    }

    // Automatic matches were produced by the processing now withdrawn.
    // Human-confirmed ones stand: a person looked and said "that is them".
    const undone = await db
      .delete(appearance)
      .where(and(eq(appearance.personId, personId), eq(appearance.source, "auto")))
      .returning({ id: appearance.id });

    removed = refs.length;

    await db.insert(accessLog).values({
      actor: viewer.email || viewer.id,
      action: `consent_revoked:biometric faces=${refs.length} auto_appearances=${undone.length}`,
      personId,
    });
  } else {
    await db.insert(accessLog).values({
      actor: viewer.email || viewer.id,
      action: `consent_revoked:${scope}`,
      personId,
    });
  }

  revalidatePath("/consent");
  revalidatePath("/enrolment");

  return {
    ok: true,
    message:
      scope === "biometric"
        ? `Consentimiento retirado para ${subject.fullName}. Borrados ${removed} retratos de referencia y sus vectores. Sus fotos siguen en el archivo y se le asignarán a mano.`
        : `Consentimiento retirado para ${subject.fullName}.`,
  };
}
