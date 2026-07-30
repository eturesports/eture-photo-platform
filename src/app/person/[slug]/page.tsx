import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { appearance, consent, person, photo } from "@/db/schema";
import { Empty, PageHeader, RoleBadge } from "@/components/ui";
import { presignDownload } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [found] = await db.select().from(person).where(eq(person.slug, slug)).limit(1);
  if (!found) notFound();

  const [biometric] = await db
    .select()
    .from(consent)
    .where(and(eq(consent.personId, found.id), eq(consent.scope, "biometric")))
    .limit(1);

  const indexed = Boolean(biometric?.granted && !biometric.revokedAt);

  const rows = await db
    .select({ id: photo.id, thumbKey: photo.thumbKey })
    .from(appearance)
    .innerJoin(photo, eq(photo.id, appearance.photoId))
    .where(and(eq(appearance.personId, found.id), eq(appearance.state, "confirmed")))
    .limit(300);

  const withUrls = await Promise.all(
    rows.map(async (p) => ({
      ...p,
      url: p.thumbKey ? await presignDownload(p.thumbKey, 900) : null,
    })),
  );

  return (
    <>
      <PageHeader title={found.fullName} />
      <div className="mb-8 flex items-center gap-3">
        <RoleBadge role={found.role} />
        <span className="text-sm text-[--color-muted]">
          {indexed
            ? "Con consentimiento biométrico: se le reconoce automáticamente."
            : "Sin consentimiento biométrico: sus fotos se asignan a mano."}
        </span>
      </div>

      {withUrls.length === 0 ? (
        <Empty>
          Aún no hay fotos asignadas. El archivado automático llega en la Fase 2; hasta
          entonces se asignan desde cada sesión.
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {withUrls.map((p) => (
            <div
              key={p.id}
              className="aspect-square overflow-hidden rounded-[--radius-eture] bg-[--color-surface]"
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
