import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser, personAccess, person, squad, squadMember } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { AdminForms } from "./AdminForms";
import { Users } from "./Users";
import { requireRole } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole("admin");

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

  const userRows = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
      disabledAt: appUser.disabledAt,
      linkedTo: person.fullName,
    })
    .from(appUser)
    .leftJoin(personAccess, eq(personAccess.userId, appUser.id))
    .leftJoin(person, eq(person.id, personAccess.personId))
    .orderBy(asc(appUser.email));

  const users = userRows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: Boolean(u.disabledAt),
    linkedTo: u.linkedTo,
  }));

  return (
    <>
      <PageHeader
        title="Administración"
        lead="Grupos, calendario de sesiones y alta de personas. Todo vive aquí: el archivo no depende de ningún otro sistema."
      />
      <AdminForms squads={squads} />
      <div className="mt-6">
        <Users users={users} />
      </div>
    </>
  );
}
