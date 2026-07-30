"use client";

import { useState } from "react";
import { createSession, createSquad, importRoster } from "./actions";

type Squad = {
  id: string;
  name: string;
  program: string;
  season: string;
  startsOn: string;
  endsOn: string;
  members: number;
};

const field =
  "mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand";
const label = "block text-sm font-medium";
const button =
  "rounded-eture bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-40";
const panel = "rounded-eture border border-line p-6";

export function AdminForms({ squads }: { squads: Squad[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState("training");

  return (
    <div className="space-y-6">
      {message && (
        <p className="rounded-eture bg-surface p-4 text-sm">{message}</p>
      )}

      <section className={panel}>
        <h2 className="font-medium">Grupos</h2>
        {squads.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {squads.map((s) => (
              <li key={s.id}>
                {s.name} · {s.members} personas · {s.startsOn} a {s.endsOn}
              </li>
            ))}
          </ul>
        )}

        <form
          action={async (fd) => {
            const r = await createSquad(fd);
            setMessage(r.ok ? "Grupo creado." : (r.error ?? "error"));
          }}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className={label}>
            Nombre
            <input name="name" required placeholder="Gap Year 25/26" className={field} />
          </label>
          <label className={label}>
            Programa
            <select name="program" className={field} defaultValue="gapyear">
              <option value="gapyear">Gap Year</option>
              <option value="eturefc">Eture FC</option>
              <option value="highschool">High School</option>
              <option value="camp">Camp</option>
              <option value="showcase">Showcase</option>
            </select>
          </label>
          <label className={label}>
            Temporada
            <input name="season" required placeholder="25/26" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Desde
              <input type="date" name="startsOn" required className={field} />
            </label>
            <label className={label}>
              Hasta
              <input type="date" name="endsOn" required className={field} />
            </label>
          </div>
          <div className="sm:col-span-2">
            <button className={button}>Crear grupo</button>
          </div>
        </form>
      </section>

      <section className={panel}>
        <h2 className="font-medium">Nueva sesión</h2>
        <p className="mt-1 text-sm text-muted">
          Crea el entrenamiento o partido antes de subir sus fotos: la hora de captura
          las asigna solas.
        </p>

        <form
          action={async (fd) => {
            const r = await createSession(fd);
            setMessage(r.ok ? "Sesión creada." : (r.error ?? "error"));
          }}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className={label}>
            Grupo
            <select name="squadId" required className={field}>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Tipo
            <select
              name="kind"
              className={field}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="training">Entrenamiento</option>
              <option value="match">Partido</option>
              <option value="showcase">Showcase</option>
              <option value="other">Otro</option>
            </select>
          </label>
          <label className={label}>
            Fecha
            <input type="date" name="heldOn" required className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Empieza
              <input type="time" name="startsAt" className={field} />
            </label>
            <label className={label}>
              Termina
              <input type="time" name="endsAt" className={field} />
            </label>
          </div>
          {kind !== "training" && (
            <>
              <label className={label}>
                Rival
                <input name="opponent" className={field} />
              </label>
              <label className={label}>
                Lugar
                <input name="venue" className={field} />
              </label>
            </>
          )}

          {kind !== "training" && (
            <label className="flex items-start gap-3 sm:col-span-2">
              <input type="checkbox" name="numbersVisible" className="mt-1" />
              <span className="text-sm">
                Llevaban equipación numerada
                <span className="mt-0.5 block text-muted">
                  Activa la lectura de dorsales sólo en esta sesión. En entrenamiento no
                  se activa nunca: los petos y las camisetas sueltas dan números falsos.
                </span>
              </span>
            </label>
          )}

          <div className="sm:col-span-2">
            <button className={button} disabled={squads.length === 0}>
              Crear sesión
            </button>
          </div>
        </form>
      </section>

      <section className={panel}>
        <h2 className="font-medium">Importar personas</h2>
        <p className="mt-1 text-sm text-muted">
          CSV con las columnas <code>nombre</code>, <code>rol</code>,{" "}
          <code>nacimiento</code>, <code>dorsal</code> y <code>consentimiento</code>.
          Sólo se registra consentimiento biométrico donde la columna trae un nombre: una
          casilla vacía nunca se interpreta como un sí.
        </p>

        <form
          action={async (fd) => {
            const r = await importRoster(fd);
            if (!r.ok) {
              setMessage(r.error ?? "error");
              return;
            }
            const errs = r.errors?.length ? ` ${r.errors.length} líneas con problemas.` : "";
            setMessage(`Importadas ${r.created} personas.${errs}`);
          }}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className={label}>
            Añadir al grupo
            <select name="squadId" className={field}>
              <option value="">— sin grupo —</option>
              {squads.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Archivo CSV
            <input type="file" name="csv" accept=".csv,text/csv" required className={field} />
          </label>
          <div className="sm:col-span-2">
            <button className={button}>Importar</button>
          </div>
        </form>
      </section>
    </div>
  );
}
