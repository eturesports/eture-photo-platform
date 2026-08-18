import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { consent, faceRef, person } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/access";
import { ConsentTable, type ConsentRow } from "./ConsentTable";

export const dynamic = "force-dynamic";

/**
 * The consent register: who has given what, and the buttons to change it.
 *
 * This is the screen a data-protection audit asks to see, and the screen that
 * answers a parent who has changed their mind. Both of those are the same
 * table.
 */
export default async function ConsentPage() {
  await requireRole("admin");

  const people = await db
    .select({
      id: person.id,
      fullName: person.fullName,
      slug: person.slug,
      role: person.role,
      birthDate: person.birthDate,
      // Computed by Postgres rather than in the render: the database knows
      // today's date, and reading the clock while rendering is exactly the
      // kind of impurity that makes a component's output depend on when it
      // happened to run.
      minor: sql<boolean | null>`
        case when ${person.birthDate} is null then null
             else ${person.birthDate} > current_date - interval '18 years'
        end
      `,
    })
    .from(person)
    .orderBy(asc(person.fullName));

  const consents = await db.select().from(consent);
  const refs = await db.select({ personId: faceRef.personId }).from(faceRef);

  const rows: ConsentRow[] = people.map((p) => {
    const own = consents.filter((c) => c.personId === p.id);
    const state = (scope: string) => {
      const row = own.find((c) => c.scope === scope);
      if (!row) return "none" as const;
      if (!row.granted || row.revokedAt) return "revoked" as const;
      return "granted" as const;
    };

    return {
      personId: p.id,
      fullName: p.fullName,
      slug: p.slug,
      personRole: p.role,
      minor: p.minor,
      biometric: state("biometric"),
      gallery: state("gallery"),
      marketing: state("marketing"),
      grantedBy: own.find((c) => c.scope === "biometric")?.grantedBy ?? null,
      portraits: refs.filter((r) => r.personId === p.id).length,
    };
  });

  const granted = rows.filter((r) => r.biometric === "granted").length;
  const missing = rows.filter((r) => r.biometric === "none").length;
  const revoked = rows.filter((r) => r.biometric === "revoked").length;

  return (
    <>
      <PageHeader
        title="Consentimientos"
        lead="Un vector facial es dato biométrico: categoría especial del artículo 9 del RGPD. Sin consentimiento vivo aquí, esa persona no se indexa — lo comprueba el código, no una política escrita."
      />

      {rows.length === 0 ? (
        <Empty>Todavía no hay personas dadas de alta.</Empty>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <span>
              <strong className="text-ink">{granted}</strong> con consentimiento biométrico
            </span>
            <span>{missing} sin registrar</span>
            {revoked > 0 && <span>{revoked} retirados</span>}
          </div>

          <p className="mb-6 rounded-eture bg-surface p-4 text-sm text-muted">
            Retirar el consentimiento borra los retratos de referencia, sus vectores en
            Rekognition y las identificaciones automáticas hechas con ellos. Las fotos
            <strong className="text-ink"> no</strong> se borran: no son sólo suyas, y sale
            más gente en ellas. Se le seguirán asignando a mano.
          </p>

          <ConsentTable rows={rows} />
        </>
      )}
    </>
  );
}
