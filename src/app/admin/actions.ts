"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { session, squad } from "@/db/schema";
import { importPeople, parseCsv } from "@/lib/people";
import { DEFAULT_TIMEZONE, wallClockToInstant } from "@/lib/time";

const SquadInput = z.object({
  name: z.string().min(1).max(120),
  program: z.enum(["gapyear", "eturefc", "highschool", "camp", "showcase"]),
  season: z.string().min(1).max(20),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createSquad(formData: FormData) {
  const parsed = SquadInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "datos incompletos" };

  await db.insert(squad).values(parsed.data);
  revalidatePath("/admin");
  return { ok: true };
}

const SessionInput = z.object({
  squadId: z.string().uuid(),
  kind: z.enum(["training", "match", "showcase", "other"]),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  opponent: z.string().max(120).optional(),
  venue: z.string().max(120).optional(),
  numbersVisible: z.string().optional(),
});

export async function createSession(formData: FormData) {
  const parsed = SessionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "datos incompletos" };
  const input = parsed.data;

  // Times are typed as local wall clock, which is how anyone thinks about a
  // training slot. Stored as real instants so they compare correctly against
  // capture times, which get the same treatment.
  const toInstant = (time?: string) =>
    time ? wallClockToInstant(new Date(`${input.heldOn}T${time}:00Z`), DEFAULT_TIMEZONE) : null;

  await db.insert(session).values({
    squadId: input.squadId,
    kind: input.kind,
    heldOn: input.heldOn,
    startsAt: toInstant(input.startsAt),
    endsAt: toInstant(input.endsAt),
    opponent: input.opponent || null,
    venue: input.venue || null,
    // Only ever true where it is actually true: numbered kit, which in
    // practice means match days.
    numbersVisible: input.numbersVisible === "on" && input.kind !== "training",
  });

  revalidatePath("/admin");
  revalidatePath("/sessions");
  return { ok: true };
}

type ImportOutcome =
  | { ok: false; error: string; errors?: { line: number; message: string }[] }
  | {
      ok: true;
      created: number;
      skipped: number;
      errors: { line: number; message: string }[];
    };

export async function importRoster(formData: FormData): Promise<ImportOutcome> {
  const file = formData.get("csv");
  const squadId = (formData.get("squadId") as string) || null;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no se ha adjuntado ningún archivo" };
  }
  if (file.size > 1_000_000) {
    return { ok: false, error: "el archivo es demasiado grande para ser una lista" };
  }

  const { rows, errors } = parseCsv(await file.text());
  if (rows.length === 0) {
    return { ok: false, error: "no se ha podido leer ninguna fila", errors };
  }

  const result = await importPeople(rows, squadId);
  revalidatePath("/people");
  revalidatePath("/admin");

  return {
    ok: true,
    created: result.created,
    skipped: result.skipped,
    errors: [...errors, ...result.errors],
  };
}
