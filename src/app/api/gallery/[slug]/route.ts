import { and, eq } from "drizzle-orm";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { db } from "@/db";
import { appearance, person, photo, session, squad } from "@/db/schema";
import { getObject } from "@/lib/storage";
import { canViewPerson, logAccess, requireViewer } from "@/lib/access";

/**
 * A person's whole gallery as a ZIP.
 *
 * Streamed and stored rather than compressed. The contents are JPEGs, which
 * do not compress again — spending CPU on that would only make the download
 * slower — and streaming means a season's photos never have to fit in the
 * function's memory at once.
 */

export const dynamic = "force-dynamic";
// A couple of hundred photos fetched from R2 and streamed out takes longer
// than the default allowance.
export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const viewer = await requireViewer();

  const [subject] = await db
    .select({ id: person.id, fullName: person.fullName, slug: person.slug })
    .from(person)
    .where(eq(person.slug, slug))
    .limit(1);
  if (!subject) return new Response("no existe", { status: 404 });

  // The same check the gallery page makes. A download URL guessed by hand must
  // not be a way around it.
  if (!(await canViewPerson(viewer, subject.id))) {
    return new Response("sin permiso", { status: 403 });
  }

  const rows = await db
    .select({
      photoId: photo.id,
      webKey: photo.webKey,
      shotAt: photo.shotAt,
      sessionKind: session.kind,
      heldOn: session.heldOn,
      squadName: squad.name,
    })
    .from(appearance)
    .innerJoin(photo, eq(photo.id, appearance.photoId))
    .leftJoin(session, eq(session.id, photo.sessionId))
    .leftJoin(squad, eq(squad.id, session.squadId))
    .where(and(eq(appearance.personId, subject.id), eq(appearance.state, "confirmed")))
    .limit(1000);

  const withFiles = rows.filter((r) => r.webKey);
  if (withFiles.length === 0) {
    return new Response("no hay fotos", { status: 404 });
  }

  await logAccess(viewer, `download_gallery n=${withFiles.length}`, { personId: subject.id });

  const archive = new ZipArchive({ store: true });

  // Fill the archive as the response drains rather than before returning it,
  // so the download starts immediately instead of after every object has been
  // fetched from R2.
  void (async () => {
    try {
      const used = new Set<string>();
      for (const row of withFiles) {
        // Foldered by session, which is how someone actually looks for a photo:
        // "the match against Almería", not a hash.
        const folder = row.heldOn
          ? `${row.heldOn}-${row.sessionKind ?? "sesion"}`
          : "sin-fecha";

        let name = `${folder}/${row.photoId.slice(0, 8)}.jpg`;
        while (used.has(name)) name = `${folder}/${row.photoId.slice(0, 12)}.jpg`;
        used.add(name);

        archive.append(await getObject(row.webKey!), { name });
      }
      await archive.finalize();
    } catch (error) {
      archive.abort();
      console.error("[gallery-zip] failed", error);
    }
  })();

  const filename = `${subject.slug}-fotos.zip`;

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
