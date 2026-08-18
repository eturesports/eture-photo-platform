"use client";

import { useState } from "react";
import { shiftCaptureTimes } from "../session/[id]/actions";

/**
 * The camera-clock fix.
 *
 * Deliberately phrased as "the camera was N hours behind/ahead" rather than as
 * a signed number of minutes: nobody at a club thinks in signed offsets, and
 * getting the sign backwards silently doubles the error.
 */

export type Unassigned = {
  photographer: string | null;
  n: number;
  earliest: string | null;
  latest: string | null;
};

export function FixTimes({ unassigned }: { unassigned: Unassigned[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const total = unassigned.reduce((sum, u) => sum + u.n, 0);
  if (total === 0 && !open) return null;

  return (
    <section className="mb-8 rounded-eture border border-line p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-medium">
          {total > 0
            ? `${total} ${total === 1 ? "foto sin sesión" : "fotos sin sesión"}`
            : "Corregir la hora de una cámara"}
        </h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm text-muted underline hover:text-ink"
        >
          {open ? "Cerrar" : "Corregir la hora"}
        </button>
      </div>

      {total > 0 && (
        <p className="mt-2 text-sm text-muted">
          Casi siempre es la cámara con la hora mal puesta: desplaza la tarjeta entera y
          las fotos no encuentran su sesión. Se arregla de una vez, no foto a foto.
        </p>
      )}

      {unassigned.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {unassigned.map((u) => (
            <li key={u.photographer ?? "sin-autor"}>
              {u.photographer ?? "sin fotógrafo"} · {u.n} fotos
              {u.earliest && ` · desde ${new Date(u.earliest).toLocaleString("es-ES")}`}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form
          action={async (fd) => {
            const hours = Number(fd.get("hours") ?? 0);
            const direction = String(fd.get("direction") ?? "behind");
            // "behind" means the camera said an earlier time than reality, so
            // the stored times must move forward.
            fd.set("minutes", String(Math.round(hours * 60) * (direction === "behind" ? 1 : -1)));

            const result = await shiftCaptureTimes(fd);
            setMessage(
              result.ok
                ? `Corregidas ${result.moved} fotos. ${result.reassigned} han encontrado su sesión` +
                  (result.orphaned ? `, ${result.orphaned} siguen sin encontrarla.` : ".")
                : result.error,
            );
          }}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm font-medium">
            Fotógrafo
            <select
              name="photographer"
              className="mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand"
            >
              {unassigned.map((u) => (
                <option key={u.photographer ?? ""} value={u.photographer ?? ""}>
                  {u.photographer ?? "sin fotógrafo"}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              La cámara iba
              <select
                name="direction"
                className="mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand"
              >
                <option value="behind">atrasada</option>
                <option value="ahead">adelantada</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Horas
              <input
                name="hours"
                type="number"
                step="0.25"
                min="0.25"
                max="72"
                defaultValue="1"
                required
                className="mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand"
              />
            </label>
          </div>

          <div className="sm:col-span-2">
            <button className="rounded-eture bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-ink">
              Aplicar y reasignar
            </button>
          </div>
        </form>
      )}

      {message && <p className="mt-4 rounded-eture bg-surface p-4 text-sm">{message}</p>}
    </section>
  );
}
