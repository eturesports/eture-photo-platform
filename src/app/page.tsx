import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { person, photo, session } from "@/db/schema";
import { Card, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [[photos], [people], [sessions], [unassigned], [failed]] = await Promise.all([
    db.select({ n: count() }).from(photo),
    db.select({ n: count() }).from(person),
    db.select({ n: count() }).from(session),
    db.select({ n: count() }).from(photo).where(sql`${photo.sessionId} is null`),
    db.select({ n: count() }).from(photo).where(eq(photo.status, "failed")),
  ]);

  return (
    <>
      <PageHeader
        title="Panel"
        lead="Fase 1 del archivo: subida, sesiones y perfiles. El reconocimiento facial llega en la Fase 2, cuando esté configurada la cuenta de AWS."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Fotos archivadas" value={photos.n} />
        <Stat label="Personas" value={people.n} />
        <Stat label="Sesiones" value={sessions.n} />
        <Stat label="Sin sesión asignada" value={unassigned.n} />
      </div>

      {failed.n > 0 && (
        <div className="mt-6 rounded-[--radius-eture] border border-[--color-brand] bg-white p-6">
          <p className="font-medium text-[--color-brand]">
            {failed.n} {failed.n === 1 ? "foto ha fallado" : "fotos han fallado"} al
            procesarse
          </p>
          <p className="mt-1 text-sm text-[--color-muted]">
            Suelen ser archivos corruptos o formatos que sharp no reconoce. El motivo
            queda guardado en cada foto.
          </p>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card href="/upload" title="Subir fotos" meta="→">
          La selección editada de un entrenamiento o partido. Los duplicados se detectan
          antes de subirse.
        </Card>
        <Card href="/sessions" title="Sesiones" meta="→">
          El calendario de entrenamientos y partidos. Cada foto se asigna sola por su
          fecha de captura.
        </Card>
      </div>
    </>
  );
}
