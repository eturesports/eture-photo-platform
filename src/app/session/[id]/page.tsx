import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { photo, session, squad } from "@/db/schema";
import { Empty, PageHeader, kindLabel } from "@/components/ui";
import { presignDownload } from "@/lib/storage";
import { requireRole } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("team");
  const { id } = await params;

  const [found] = await db
    .select({
      id: session.id,
      kind: session.kind,
      heldOn: session.heldOn,
      opponent: session.opponent,
      venue: session.venue,
      numbersVisible: session.numbersVisible,
      squadName: squad.name,
    })
    .from(session)
    .innerJoin(squad, eq(squad.id, session.squadId))
    .where(eq(session.id, id))
    .limit(1);

  if (!found) notFound();

  const photos = await db
    .select({ id: photo.id, thumbKey: photo.thumbKey, status: photo.status })
    .from(photo)
    .where(eq(photo.sessionId, id))
    .limit(300);

  // Nothing in the bucket is public, so every thumbnail is a short-lived
  // signed URL minted per request.
  const withUrls = await Promise.all(
    photos.map(async (p) => ({
      ...p,
      url: p.thumbKey ? await presignDownload(p.thumbKey, 900) : null,
    })),
  );

  return (
    <>
      <PageHeader
        title={`${kindLabel(found.kind)}${found.opponent ? ` · ${found.opponent}` : ""}`}
        lead={[found.squadName, found.heldOn, found.venue].filter(Boolean).join(" · ")}
      />

      {found.kind === "match" && !found.numbersVisible && (
        <p className="mb-6 rounded-eture bg-surface p-4 text-sm text-muted">
          Esta sesión es un partido pero no está marcada con equipación numerada, así que
          no se leerán dorsales. Márcala si los jugadores llevaban número.
        </p>
      )}

      {withUrls.length === 0 ? (
        <Empty>Aún no hay fotos en esta sesión.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {withUrls.map((p) => (
            <div
              key={p.id}
              className="aspect-square overflow-hidden rounded-eture bg-surface"
            >
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  {p.status === "failed" ? "error" : "procesando"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
