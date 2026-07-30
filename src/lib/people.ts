/**
 * Creating people, and the CSV import that does it 120 at a time.
 *
 * There is no synchronisation with the Operations database. The two systems
 * track different things — Operations records college placements since 2015,
 * this records who is in the programmes this season — and building a data
 * contract between them to save typing one list a year would not pay for
 * itself. Keeping the archive isolated also keeps biometric data away from
 * everything else, which makes the GDPR audit smaller.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { consent, person, squadMember } from "@/db/schema";

const ROLES = new Set(["player", "coach", "staff"]);

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: "Martín" -> "martin"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Two players called Marco Ruiz get marco-ruiz and marco-ruiz-2, not a crash. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "persona";
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  throw new Error(`cannot find a free slug for "${name}"`);
}

export type ImportRow = {
  fullName: string;
  role: string;
  birthDate?: string | null;
  shirtNumber?: number | null;
  /** Guardian for a minor, the person themselves for an adult. Blank = no consent yet. */
  biometricConsentBy?: string | null;
};

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { line: number; message: string }[];
};

/**
 * Parses the season's sign-up list.
 *
 * Deliberately forgiving about the shape of the file — it comes out of
 * whatever spreadsheet the programme keeps — and deliberately strict about
 * the two fields that carry consequences: `role`, which decides the consent
 * regime, and `birth_date`, which decides whether a guardian must sign.
 */
export function parseCsv(text: string): { rows: ImportRow[]; errors: ImportResult["errors"] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ImportRow[] = [];
  const errors: ImportResult["errors"] = [];

  if (lines.length === 0) return { rows, errors };

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const at = (names: string[]) => header.findIndex((h) => names.includes(h));

  const iName = at(["nombre", "name", "full_name", "nombre completo"]);
  const iRole = at(["rol", "role", "tipo"]);
  const iBirth = at(["nacimiento", "birth_date", "fecha_nacimiento", "fecha de nacimiento"]);
  const iNumber = at(["dorsal", "shirt_number", "numero", "número"]);
  const iConsent = at(["consentimiento", "consent", "tutor", "consentimiento_biometrico"]);

  if (iName === -1) {
    errors.push({ line: 1, message: "falta la columna de nombre" });
    return { rows, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const fullName = cells[iName]?.trim();
    if (!fullName) {
      errors.push({ line: i + 1, message: "sin nombre" });
      continue;
    }

    const rawRole = (iRole === -1 ? "player" : (cells[iRole] ?? "player")).trim().toLowerCase();
    const role =
      { jugador: "player", entrenador: "coach", staff: "staff", cuerpo: "staff" }[rawRole] ??
      rawRole;
    if (!ROLES.has(role)) {
      errors.push({ line: i + 1, message: `rol desconocido "${rawRole}"` });
      continue;
    }

    const birthRaw = iBirth === -1 ? "" : (cells[iBirth] ?? "").trim();
    let birthDate: string | null = null;
    if (birthRaw) {
      const normalised = normaliseDate(birthRaw);
      if (!normalised) {
        errors.push({ line: i + 1, message: `fecha de nacimiento ilegible "${birthRaw}"` });
        continue;
      }
      birthDate = normalised;
    }

    const numberRaw = iNumber === -1 ? "" : (cells[iNumber] ?? "").trim();
    const shirtNumber = numberRaw ? Number(numberRaw) : null;
    if (shirtNumber !== null && (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 999)) {
      errors.push({ line: i + 1, message: `dorsal inválido "${numberRaw}"` });
      continue;
    }

    rows.push({
      fullName,
      role,
      birthDate,
      shirtNumber,
      biometricConsentBy: iConsent === -1 ? null : (cells[iConsent] ?? "").trim() || null,
    });
  }

  return { rows, errors };
}

/** Accepts 2008-04-11, 11/04/2008 and 11-04-2008; rejects anything ambiguous. */
function normaliseDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return value;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/** Minimal CSV splitting with quoted-field support — names contain commas. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === ";") {
      // Spanish Excel exports use semicolons; accept both.
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export async function importPeople(
  rows: ImportRow[],
  squadId: string | null,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    try {
      const slug = await uniqueSlug(row.fullName);

      const [created] = await db
        .insert(person)
        .values({
          fullName: row.fullName,
          slug,
          role: row.role,
          birthDate: row.birthDate ?? null,
        })
        .returning({ id: person.id });

      if (squadId) {
        await db.insert(squadMember).values({
          squadId,
          personId: created.id,
          shirtNumber: row.shirtNumber ?? null,
        });
      }

      // Consent is recorded only when the sign-up list actually carries it.
      // An absent column must never be read as a yes — that is the whole point
      // of Article 9 consent being explicit.
      if (row.biometricConsentBy) {
        await db.insert(consent).values({
          personId: created.id,
          scope: "biometric",
          granted: true,
          grantedBy: row.biometricConsentBy,
          grantedAt: new Date(),
        });
      }

      result.created++;
    } catch (error) {
      result.skipped++;
      result.errors.push({
        line: index + 2,
        message: error instanceof Error ? error.message : "error desconocido",
      });
    }
  }

  return result;
}

/** Everyone in a squad who may be recognised: live biometric consent, still on the roster. */
export async function indexablePeople(squadId: string) {
  return db
    .select({ personId: person.id, fullName: person.fullName, shirtNumber: squadMember.shirtNumber })
    .from(squadMember)
    .innerJoin(person, eq(person.id, squadMember.personId))
    .innerJoin(
      consent,
      and(
        eq(consent.personId, person.id),
        eq(consent.scope, "biometric"),
        eq(consent.granted, true),
        isNull(consent.revokedAt),
      ),
    )
    .where(and(eq(squadMember.squadId, squadId), isNull(squadMember.leftOn)));
}
