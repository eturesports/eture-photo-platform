"use client";

import { useState } from "react";
import Link from "next/link";
import { grantConsent, revokeConsent } from "./actions";

export type ConsentState = "granted" | "revoked" | "none";

export type ConsentRow = {
  personId: string;
  fullName: string;
  slug: string;
  personRole: string;
  /** null when no birth date is on file, which is itself worth showing. */
  minor: boolean | null;
  biometric: ConsentState;
  gallery: ConsentState;
  marketing: ConsentState;
  grantedBy: string | null;
  portraits: number;
};

const stateLabel: Record<ConsentState, string> = {
  granted: "Sí",
  revoked: "Retirado",
  none: "—",
};

function Badge({ state }: { state: ConsentState }) {
  const tone =
    state === "granted"
      ? "bg-surface text-ink"
      : state === "revoked"
        ? "border border-brand text-brand"
        : "text-muted";
  return (
    <span className={`rounded-eture px-2.5 py-0.5 text-xs ${tone}`}>
      {stateLabel[state]}
    </span>
  );
}

export function ConsentTable({ rows }: { rows: ConsentRow[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {message && (
        <p className="rounded-eture bg-surface p-4 text-sm">{message}</p>
      )}

      <div className="overflow-x-auto rounded-eture border border-line">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="p-4 font-medium">Persona</th>
              <th className="p-4 font-medium">Biométrico</th>
              <th className="p-4 font-medium">Otorgado por</th>
              <th className="p-4 font-medium">Retratos</th>
              <th className="p-4 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.personId}>
                <td className="p-4">
                  <Link href={`/person/${r.slug}`} className="hover:underline">
                    {r.fullName}
                  </Link>
                  <span className="ml-2 text-xs text-muted">
                    {r.personRole === "player"
                      ? "jugador"
                      : r.personRole === "coach"
                        ? "entrenador"
                        : "staff"}
                    {r.minor === true && " · menor"}
                    {r.minor === null && " · sin fecha de nacimiento"}
                  </span>
                </td>
                <td className="p-4">
                  <Badge state={r.biometric} />
                </td>
                <td className="p-4 text-muted">{r.grantedBy ?? "—"}</td>
                <td className="p-4 tabular-nums text-muted">{r.portraits}</td>
                <td className="p-4 text-right">
                  {r.biometric === "granted" ? (
                    confirming === r.personId ? (
                      <form
                        action={async (fd) => {
                          const result = await revokeConsent(fd);
                          setMessage(result.ok ? result.message : result.error);
                          setConfirming(null);
                        }}
                        className="flex items-center justify-end gap-3"
                      >
                        <input type="hidden" name="personId" value={r.personId} />
                        <input type="hidden" name="scope" value="biometric" />
                        <span className="text-xs text-brand">
                          ¿Borrar sus datos biométricos?
                        </span>
                        <button className="rounded-eture bg-brand px-3 py-1.5 text-xs text-white">
                          Sí, retirar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="text-xs text-muted underline"
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => setConfirming(r.personId)}
                        className="text-xs text-muted underline hover:text-brand"
                      >
                        Retirar
                      </button>
                    )
                  ) : editing === r.personId ? (
                    <form
                      action={async (fd) => {
                        const result = await grantConsent(fd);
                        setMessage(result.ok ? result.message : result.error);
                        setEditing(null);
                      }}
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      <input type="hidden" name="personId" value={r.personId} />
                      <input type="hidden" name="scope" value="biometric" />
                      <input
                        name="grantedBy"
                        required
                        placeholder={
                          r.minor === false
                            ? "Nombre de la persona"
                            : "Nombre del padre, madre o tutor"
                        }
                        className="w-56 rounded-eture border border-line px-3 py-1.5 text-xs outline-none focus:border-brand"
                      />
                      <input
                        name="evidenceUrl"
                        type="url"
                        placeholder="Enlace al documento firmado (opcional)"
                        className="w-64 rounded-eture border border-line px-3 py-1.5 text-xs outline-none focus:border-brand"
                      />
                      <button className="rounded-eture bg-brand px-3 py-1.5 text-xs text-white">
                        Registrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-xs text-muted underline"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setEditing(r.personId)}
                      className="text-xs text-muted underline hover:text-ink"
                    >
                      Registrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
