import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { squad, squadMember } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { AdminForms } from "./AdminForms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const squads = await db
    .select({
      id: squad.id,
      name: squad.name,
      program: squad.program,
      season: squad.season,
      startsOn: squad.startsOn,
      endsOn: squad.endsOn,
      members: count(squadMember.personId),
    })
    .from(squad)
    .leftJoin(squadMember, eq(squadMember.squadId, squad.id))
    .groupBy(squad.id)
    .orderBy(asc(squad.startsOn));

  return (
    <>
      <PageHeader
        title="Administración"
        lead="Grupos, calendario de sesiones y alta de personas. Todo vive aquí: el archivo no depende de ningún otro sistema."
      />
      <AdminForms squads={squads} />
    </>
  );
}
