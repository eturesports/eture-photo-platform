"use client";

import { useState } from "react";
import { inviteUser, setUserDisabled } from "./users";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  disabled: boolean;
  linkedTo: string | null;
};

const field =
  "mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand";
const label = "block text-sm font-medium";

const roleLabel: Record<string, string> = {
  team: "Equipo",
  photographer: "Fotógrafo",
  family: "Familia",
};

export function Users({ users }: { users: User[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState("family");

  return (
    <section className="rounded-eture border border-line p-6">
      <h2 className="font-medium">Cuentas</h2>
      <p className="mt-1 text-sm text-muted">
        El acceso es sólo por invitación: una dirección que no esté aquí no recibe enlace,
        por mucho que lo pida.
      </p>

      {message && (
        <p className="mt-4 rounded-eture bg-surface p-4 text-sm">
          {message}
        </p>
      )}

      {users.length > 0 && (
        <ul className="mt-5 divide-y divide-line text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span className={u.disabled ? "text-muted line-through" : ""}>
                {u.email}
              </span>
              <span className="rounded-eture bg-surface px-2.5 py-0.5 text-xs text-muted">
                {roleLabel[u.role] ?? u.role}
              </span>
              {u.linkedTo && (
                <span className="text-xs text-muted">ve a {u.linkedTo}</span>
              )}
              <form
                action={async (fd) => {
                  await setUserDisabled(fd);
                }}
                className="ml-auto"
              >
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="disabled" value={String(!u.disabled)} />
                <button className="text-xs text-muted underline hover:text-ink">
                  {u.disabled ? "Reactivar" : "Desactivar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={async (fd) => {
          const r = await inviteUser(fd);
          setMessage(r.ok ? (r.message ?? "Cuenta creada.") : (r.error ?? "error"));
        }}
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        <label className={label}>
          Correo
          <input type="email" name="email" required className={field} />
        </label>
        <label className={label}>
          Nombre
          <input name="name" className={field} />
        </label>
        <label className={label}>
          Tipo de cuenta
          <select
            name="role"
            className={field}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="family">Familia — sólo su jugador</option>
            <option value="photographer">Fotógrafo — sólo subir</option>
            <option value="team">Equipo — acceso completo</option>
          </select>
        </label>
        {role === "family" && (
          <label className={label}>
            Jugador vinculado
            <input
              name="personSlug"
              placeholder="marco-ruiz"
              className={field}
              required
            />
            <span className="mt-1 block text-xs font-normal text-muted">
              El identificador que aparece en la dirección de su perfil.
            </span>
          </label>
        )}
        <div className="sm:col-span-2">
          <button className="rounded-eture bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-ink">
            Crear cuenta
          </button>
        </div>
      </form>
    </section>
  );
}
