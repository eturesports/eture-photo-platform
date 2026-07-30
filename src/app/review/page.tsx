import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { appearance, person, photo, session, squad, squadMember } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { presignDownload } from "@/lib/storage";
import { kindLabel } from "@/components/ui";
import { ReviewQueue, type QueueItem } from "./ReviewQueue";

export const dynamic = "force-dynamic";

/** One screenful of work. Loading the whole queue would be slow and pointless. */
const BATCH = 40;

export default async function ReviewPage() {
  const queued = await db
    .select({
      appearanceId: appearance.id,
      bbox: appearance.bbox,
      faceScore: appearance.faceScore,
      numberRead: appearance.numberRead,
      suggestedId: appearance.personId,
      webKey: photo.webKey,
      sessionId: photo.sessionId,
      sessionKind: session.kind,
      heldOn: session.heldOn,
      squadId: session.squadId,
      squadName: squad.name,
    })
    .from(appearance)
    .innerJoin(photo, eq(photo.id, appearance.photoId))
    .leftJoin(session, eq(session.id, photo.sessionId))
    .leftJoin(squad, eq(squad.id, session.squadId))
    .where(eq(appearance.state, "review"))
    // Lowest confidence first: the cases a human actually adds value on.
    .orderBy(asc(appearance.combinedScore))
    .limit(BATCH);

  const items: QueueItem[] = await Promise.all(
    queued.map(async (q) => {
      // Candidates are drawn from the squad that was actually there, which is
      // what keeps the list at three names rather than a hundred and twenty.
      const squadPeople = q.squadId
        ? await db
            .select({ personId: person.id, fullName: person.fullName })
            .from(squadMember)
            .innerJoin(person, eq(person.id, squadMember.personId))
            .where(and(eq(squadMember.squadId, q.squadId), isNull(squadMember.leftOn)))
            .limit(60)
        : [];

      const suggested = squadPeople.find((p) => p.personId === q.suggestedId);
      const others = squadPeople.filter((p) => p.personId !== q.suggestedId).slice(0, 2);

      return {
        appearanceId: q.appearanceId,
        photoUrl: q.webKey ? await presignDownload(q.webKey, 900) : null,
        bbox: q.bbox as QueueItem["bbox"],
        sessionLabel: [q.squadName, q.sessionKind ? kindLabel(q.sessionKind) : null, q.heldOn]
          .filter(Boolean)
          .join(" · "),
        numberRead: q.numberRead,
        candidates: [
          ...(suggested
            ? [{ ...suggested, score: q.faceScore ?? 0 }]
            : []),
          ...others.map((p) => ({ ...p, score: 0 })),
        ],
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Revisión"
        lead="Cada confirmación se guarda como cara de referencia, así que el sistema aprende a esa persona con la luz y el ángulo de esta temporada. Tras unas pocas sesiones, esta cola casi se vacía sola."
      />
      <ReviewQueue items={items} reviewer="equipo" />
    </>
  );
}
