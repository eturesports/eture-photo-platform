import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { consent, faceRef, person, squad, squadMember } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { presignDownload } from "@/lib/storage";
import { requireRole } from "@/lib/access";
import { Capture, type Subject } from "./Capture";
import { TARGET_PORTRAITS } from "@/lib/enrolment";

export const dynamic = "force-dynamic";

export default async function EnrolmentPage({
  searchParams,
}: {
  searchParams: Promise<{ squad?: string; all?: string }>;
}) {
  await requireRole("admin", "media");
  const { squad: squadId, all } = await searchParams;

  const squads = await db
    .select({ id: squad.id, name: squad.name, season: squad.season })
    .from(squad)
    .orderBy(asc(squad.startsOn));

  if (squads.length === 0) {
    return (
      <>
        <PageHeader title="Retratos de referencia" />
        <Empty>
          Todavía no hay ningún grupo. Créalo en Administración y añade a sus personas
          antes de tomar retratos.
        </Empty>
      </>
    );
  }

  const selected = squadId ?? squads[0].id;

  const members = await db
    .select({
      personId: person.id,
      slug: person.slug,
      fullName: person.fullName,
      role: person.role,
    })
    .from(squadMember)
    .innerJoin(person, eq(person.id, squadMember.personId))
    .where(and(eq(squadMember.squadId, selected), isNull(squadMember.leftOn)))
    .orderBy(asc(person.fullName));

  const subjects: Subject[] = await Promise.all(
    members.map(async (m) => {
      const [permission] = await db
        .select({ id: consent.id })
        .from(consent)
        .where(
          and(
            eq(consent.personId, m.personId),
            eq(consent.scope, "biometric"),
            eq(consent.granted, true),
            isNull(consent.revokedAt),
          ),
        )
        .limit(1);

      const portraits = await db
        .select({ id: faceRef.id, cropKey: faceRef.cropKey })
        .from(faceRef)
        .where(and(eq(faceRef.personId, m.personId), eq(faceRef.origin, "enrolment")));

      return {
        ...m,
        hasConsent: Boolean(permission),
        portraits: await Promise.all(
          portraits.map(async (p) => ({
            id: p.id,
            url: await presignDownload(p.cropKey, 900),
          })),
        ),
      };
    }),
  );

  // Default to the people who still need portraits — at accreditation you work
  // the queue, and someone already done should not be in front of you.
  //
  // Anyone without consent goes last rather than first. They cannot be
  // photographed at all, so leading with them stalls a queue of people waiting
  // their turn; the missing consent is a paperwork problem to settle after the
  // camera work, not before it.
  const pending = subjects
    .filter((s) => s.portraits.length < TARGET_PORTRAITS)
    .sort((a, b) => Number(b.hasConsent) - Number(a.hasConsent));
  const showing = all === "1" ? subjects : pending;

  const withConsent = subjects.filter((s) => s.hasConsent).length;

  return (
    <>
      <PageHeader
        title="Retratos de referencia"
        lead="Diez segundos por persona el día de la acreditación, y el reconocimiento funciona desde el primer entrenamiento. Sin esto, el archivo puede agrupar las fotos de alguien pero no ponerles nombre."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        {squads.map((s) => (
          <Link
            key={s.id}
            href={`/enrolment?squad=${s.id}`}
            className={`rounded-eture px-4 py-2 transition-colors ${
              s.id === selected
                ? "bg-brand text-white"
                : "border border-line text-muted hover:border-muted"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          <strong className="text-ink">{subjects.length - pending.length}</strong> de{" "}
          {subjects.length} completos
        </span>
        <span>
          {withConsent} con consentimiento biométrico
          {withConsent < subjects.length && ` · ${subjects.length - withConsent} sin él`}
        </span>
        <Link
          href={`/enrolment?squad=${selected}&all=${all === "1" ? "0" : "1"}`}
          className="underline hover:text-ink"
        >
          {all === "1" ? "Ver sólo los pendientes" : "Ver todo el grupo"}
        </Link>
      </div>

      {showing.length === 0 ? (
        <Empty>
          Todo el grupo tiene ya sus retratos. El reconocimiento puede identificarles
          desde la próxima subida.
        </Empty>
      ) : (
        <Capture subjects={showing} target={TARGET_PORTRAITS} />
      )}
    </>
  );
}
