import { count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { photo, session, squad } from "@/db/schema";
import { Card, Empty, PageHeader, kindLabel } from "@/components/ui";
import { requireRole } from "@/lib/access";
import { FixTimes, type Unassigned } from "./FixTimes";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  // A whole session is other people's children; team only.
  await requireRole("admin", "media");

  const rows = await db
    .select({
      id: session.id,
      kind: session.kind,
      heldOn: session.heldOn,
      opponent: session.opponent,
      squadName: squad.name,
      photos: count(photo.id),
    })
    .from(session)
    .innerJoin(squad, eq(squad.id, session.squadId))
    .leftJoin(photo, eq(photo.sessionId, session.id))
    .groupBy(session.id, squad.name)
    .orderBy(desc(session.heldOn))
    .limit(100);

  // Photos that matched no session are surfaced here rather than in a list
  // nobody visits: the cause is nearly always a camera clock, and the fix for
  // that lives on this screen.
  const unassigned: Unassigned[] = await db
    .select({
      photographer: photo.photographer,
      n: sql<number>`count(*)::int`,
      earliest: sql<string | null>`min(${photo.shotAt})`,
      latest: sql<string | null>`max(${photo.shotAt})`,
    })
    .from(photo)
    .where(isNull(photo.sessionId))
    .groupBy(photo.photographer);

  return (
    <>
      <PageHeader
        title="Sesiones"
        lead="Cada entrenamiento y cada partido. Los partidos se marcan con equipación numerada para que la lectura de dorsales se active sólo ahí."
      />

      <FixTimes unassigned={unassigned} />

      {rows.length === 0 ? (
        <Empty>
          Todavía no hay sesiones. Se crean al dar de alta un grupo y su calendario.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((s) => (
            <Card
              key={s.id}
              href={`/session/${s.id}`}
              title={`${kindLabel(s.kind)}${s.opponent ? ` · ${s.opponent}` : ""}`}
              meta={`${s.photos} fotos`}
            >
              {s.squadName} · {s.heldOn}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
