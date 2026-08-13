import { asc, count, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { appearance, person } from "@/db/schema";
import { Card, Empty, PageHeader, RoleBadge } from "@/components/ui";
import { requireRole } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await requireRole("admin", "media");

  const rows = await db
    .select({
      id: person.id,
      slug: person.slug,
      fullName: person.fullName,
      role: person.role,
      photos: count(appearance.id),
    })
    .from(person)
    .leftJoin(
      appearance,
      and(eq(appearance.personId, person.id), eq(appearance.state, "confirmed")),
    )
    .groupBy(person.id)
    .orderBy(asc(person.fullName));

  return (
    <>
      <PageHeader
        title="Personas"
        lead="Jugadores, entrenadores y staff. Se dan de alta por importación CSV al empezar la temporada o a mano."
      />

      {rows.length === 0 ? (
        <Empty>
          Todavía no hay nadie dado de alta. La importación CSV llega con el resto de la
          Fase 1.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Card
              key={p.id}
              href={`/person/${p.slug}`}
              title={p.fullName}
              meta={`${p.photos} fotos`}
            >
              <RoleBadge role={p.role} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
