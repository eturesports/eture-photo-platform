"use client";

import { useState, useTransition } from "react";
import { confirmAppearance, confirmBurst, rejectAppearance } from "./actions";

/**
 * The review screen decides whether the whole system gets used or abandoned.
 *
 * The design target is a reviewer clearing 400-600 faces an hour. That needs
 * the candidates pre-ranked and one keystroke per decision — with a dropdown
 * of 120 names nobody passes 60 an hour and the queue never empties.
 */

export type QueueItem = {
  appearanceId: string;
  photoUrl: string | null;
  bbox: { x: number; y: number; w: number; h: number };
  sessionLabel: string;
  numberRead: number | null;
  candidates: { personId: string; fullName: string; score: number }[];
};

export function ReviewQueue({ items, reviewer }: { items: QueueItem[]; reviewer: string }) {
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const item = items[index];
  const advance = () => {
    setIndex((i) => i + 1);
    setNote(null);
  };

  if (!item) {
    return (
      <div className="rounded-eture border border-dashed border-line p-12 text-center">
        <p className="font-medium">Cola vacía</p>
        <p className="mt-1 text-sm text-muted">
          No queda nada por revisar. Vuelve después de la próxima subida.
        </p>
      </div>
    );
  }

  const act = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      const result = (await fn()) as { alsoConfirmed?: number } | undefined;
      if (result?.alsoConfirmed) {
        setNote(`Aplicado también a ${result.alsoConfirmed} fotos de la misma ráfaga.`);
        setTimeout(advance, 900);
      } else {
        advance();
      }
    });
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (pending) return;
        const n = Number(e.key);
        if (n >= 1 && n <= item.candidates.length) {
          act(() => confirmAppearance(item.appearanceId, item.candidates[n - 1].personId, reviewer));
        } else if (e.key.toLowerCase() === "b" && item.candidates[0]) {
          act(() => confirmBurst(item.appearanceId, item.candidates[0].personId, reviewer));
        } else if (e.key.toLowerCase() === "x") {
          act(() => rejectAppearance(item.appearanceId, reviewer));
        } else if (e.key === "ArrowRight") {
          advance();
        }
      }}
      className="outline-none"
    >
      <div className="mb-4 flex items-center justify-between text-sm text-muted">
        <span>
          {index + 1} de {items.length} · {item.sessionLabel}
        </span>
        {item.numberRead !== null && <span>dorsal leído: {item.numberRead}</span>}
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="relative overflow-hidden rounded-eture bg-surface">
          {item.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt="" className="w-full" />
          )}
          {/* The face in question, marked on the full frame for context. */}
          <div
            className="pointer-events-none absolute border-2 border-brand"
            style={{
              left: `${item.bbox.x * 100}%`,
              top: `${item.bbox.y * 100}%`,
              width: `${item.bbox.w * 100}%`,
              height: `${item.bbox.h * 100}%`,
            }}
          />
        </div>

        <div className="space-y-2">
          {item.candidates.map((c, i) => (
            <button
              key={c.personId}
              disabled={pending}
              onClick={() => act(() => confirmAppearance(item.appearanceId, c.personId, reviewer))}
              className="flex w-full items-center justify-between rounded-eture border border-line px-4 py-3 text-left transition-colors hover:border-brand disabled:opacity-40"
            >
              <span>
                <span className="mr-2 text-xs text-muted">{i + 1}</span>
                {c.fullName}
              </span>
              <span className="text-sm tabular-nums text-muted">
                {c.score.toFixed(0)}%
              </span>
            </button>
          ))}

          <button
            disabled={pending || !item.candidates[0]}
            onClick={() =>
              act(() => confirmBurst(item.appearanceId, item.candidates[0].personId, reviewer))
            }
            className="w-full rounded-eture bg-brand px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-40"
          >
            Confirmar toda la ráfaga <span className="opacity-60">B</span>
          </button>

          <button
            disabled={pending}
            onClick={() => act(() => rejectAppearance(item.appearanceId, reviewer))}
            className="w-full rounded-eture border border-line px-4 py-3 text-sm transition-colors hover:border-muted disabled:opacity-40"
          >
            No es ninguno <span className="opacity-60">X</span>
          </button>

          <button
            disabled={pending}
            onClick={advance}
            className="w-full px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Saltar <span className="opacity-60">→</span>
          </button>

          {note && <p className="pt-2 text-sm text-brand">{note}</p>}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        Atajos: 1-3 asignar · B confirmar la ráfaga entera · X descartar · → saltar
      </p>
    </div>
  );
}
