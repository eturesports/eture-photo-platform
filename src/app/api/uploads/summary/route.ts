import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appearance, person, photo, session, squad } from "@/db/schema";
import { requireApiRole } from "@/lib/access";

/**
 * What happened to a batch after it was uploaded.
 *
 * A photographer who can see their work land and get filed uploads again next
 * week. One who drops 200 photos into a void and hears nothing starts letting
 * cards pile up, and a card that piles up for three months never gets uploaded
 * at all. This is the cheapest part of the system and the one that most keeps
 * the habit alive.
 */

export const dynamic = "force-dynamic";

const Body = z.object({ photoIds: z.array(z.string().uuid()).min(1).max(500) });

/** Translated here rather than in the client: the label is what a person reads. */
const KIND: Record<string, string> = {
  training: "entrenamiento",
  match: "partido",
  showcase: "showcase",
  other: "otro",
};

export async function POST(request: Request) {
  const denied = await requireApiRole("admin", "media");
  if (denied) return denied;

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const ids = parsed.data.photoIds;

  const rows = await db
    .select({
      status: photo.status,
      sessionId: photo.sessionId,
      sessionKind: session.kind,
      heldOn: session.heldOn,
      squadName: squad.name,
      n: sql<number>`count(*)::int`,
    })
    .from(photo)
    .leftJoin(session, eq(session.id, photo.sessionId))
    .leftJoin(squad, eq(squad.id, session.squadId))
    .where(inArray(photo.id, ids))
    .groupBy(photo.status, photo.sessionId, session.kind, session.heldOn, squad.name);

  const [identified] = await db
    .select({
      people: sql<number>`count(distinct ${appearance.personId})::int`,
      confirmed: sql<number>`count(*) filter (where ${appearance.state} = 'confirmed')::int`,
      queued: sql<number>`count(*) filter (where ${appearance.state} = 'review')::int`,
    })
    .from(appearance)
    .where(inArray(appearance.photoId, ids));

  const names = await db
    .selectDistinct({ fullName: person.fullName })
    .from(appearance)
    .innerJoin(person, eq(person.id, appearance.personId))
    .where(and(inArray(appearance.photoId, ids), eq(appearance.state, "confirmed")))
    .limit(30);

  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const processed = rows.filter((r) => r.status === "done").reduce((s, r) => s + r.n, 0);
  const failed = rows.filter((r) => r.status === "failed").reduce((s, r) => s + r.n, 0);
  const unassigned = rows.filter((r) => !r.sessionId).reduce((s, r) => s + r.n, 0);

  const sessions = rows
    .filter((r) => r.sessionId)
    .map((r) => ({
      label: [r.squadName, r.sessionKind ? KIND[r.sessionKind] ?? r.sessionKind : null, r.heldOn]
        .filter(Boolean)
        .join(" · "),
      n: r.n,
    }));

  return NextResponse.json({
    total,
    processed,
    failed,
    unassigned,
    stillWorking: total - processed - failed,
    sessions,
    identified: {
      people: identified?.people ?? 0,
      confirmed: identified?.confirmed ?? 0,
      queued: identified?.queued ?? 0,
      names: names.map((n) => n.fullName),
    },
  });
}
