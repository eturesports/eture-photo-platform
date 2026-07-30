import { count, eq, inArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { appearance, person, photo, session } from "@/db/schema";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireViewer, visiblePersonIds } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const viewer = await requireViewer();

  if (viewer.role === "family") return <FamilyHome userId={viewer.id} />;
  // Photographers get one job and one screen.
  if (viewer.role === "photographer") redirect("/upload");
  return <TeamDashboard />;
}

/** Families land on their own children, never on a list of everyone else's. */
async function FamilyHome({ userId }: { userId: string }) {
  const ids = await visiblePersonIds({ id: userId, email: "", role: "family" });

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title="Tus fotos" />
        <Empty>
          Tu cuenta aún no está vinculada a ningún jugador. Escríbenos a
          hello@eturesports.com y lo resolvemos.
        </Empty>
      </>
    );
  }

  const people = await db
    .select({
      slug: person.slug,
      fullName: person.fullName,
      photos: count(appearance.id),
    })
    .from(person)
    .leftJoin(appearance, eq(appearance.personId, person.id))
    .where(inArray(person.id, ids))
    .groupBy(person.id);

  return (
    <>
      <PageHeader
        title="Tus fotos"
        lead="Las fotografías de entrenamientos y partidos de esta temporada."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {people.map((p) => (
          <Card
            key={p.slug}
            href={`/person/${p.slug}`}
            title={p.fullName}
            meta={`${p.photos} fotos`}
          />
        ))}
      </div>
    </>
  );
}

async function TeamDashboard() {
  const [[photos], [people], [sessions], [unassigned], [failed], [queued]] = await Promise.all([
    db.select({ n: count() }).from(photo),
    db.select({ n: count() }).from(person),
    db.select({ n: count() }).from(session),
    db.select({ n: count() }).from(photo).where(sql`${photo.sessionId} is null`),
    db.select({ n: count() }).from(photo).where(eq(photo.status, "failed")),
    db.select({ n: count() }).from(appearance).where(eq(appearance.state, "review")),
  ]);

  return (
    <>
      <PageHeader
        title="Panel"
        lead="Archivo de entrenamientos y partidos, por jugador y entrenador."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Fotos archivadas" value={photos.n} />
        <Stat label="Personas" value={people.n} />
        <Stat label="Sesiones" value={sessions.n} />
        <Stat label="Pendientes de revisar" value={queued.n} />
      </div>

      {failed.n > 0 && (
        <div className="mt-6 rounded-eture border border-brand bg-white p-6">
          <p className="font-medium text-brand">
            {failed.n} {failed.n === 1 ? "foto ha fallado" : "fotos han fallado"} al
            procesarse
          </p>
          <p className="mt-1 text-sm text-muted">
            Suelen ser archivos corruptos o formatos que sharp no reconoce. El motivo
            queda guardado en cada foto.
          </p>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card href="/upload" title="Subir fotos" meta="→">
          La selección editada de una sesión. Los duplicados se detectan antes de subirse.
        </Card>
        <Card href="/review" title="Revisar" meta={`${queued.n}`}>
          Cada confirmación enseña al sistema a reconocer a esa persona.
        </Card>
        <Card href="/sessions" title="Sesiones" meta={`${unassigned.n} sin asignar`}>
          Entrenamientos y partidos. Las fotos se asignan por su hora de captura.
        </Card>
      </div>
    </>
  );
}
