"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addPortrait, removePortrait } from "./actions";
import { TARGET_PORTRAITS } from "@/lib/enrolment";

/**
 * The accreditation screen: a camera, a name, and a queue of people.
 *
 * Designed to be held in one hand at a folding table while a queue of players
 * files past. That means the camera stays live between people — reopening it
 * per person costs a second each time and the queue notices — and the whole
 * thing is one thumb-reachable button.
 */

export type Subject = {
  personId: string;
  slug: string;
  fullName: string;
  role: string;
  hasConsent: boolean;
  portraits: { id: string; url: string | null }[];
};

export function Capture({ subjects, target }: { subjects: Subject[]; target?: number }) {
  const goal = target ?? TARGET_PORTRAITS;
  const [index, setIndex] = useState(0);
  const [people, setPeople] = useState(subjects);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const subject = people[index];

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError(
        "No se ha podido abrir la cámara. Da permiso al navegador, o sube el retrato como archivo.",
      );
    }
  }, []);

  // Release the camera when leaving the screen: a webcam light left on is
  // both alarming and, on a laptop at an accreditation table, a battery drain.
  useEffect(() => () => stopCamera(), [stopCamera]);

  const submit = useCallback(
    async (imageBase64: string) => {
      if (!subject) return;
      setBusy(true);
      setError(null);
      setMessage(null);

      const result = await addPortrait({ personId: subject.personId, imageBase64 });

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      setPeople((prev) =>
        prev.map((p, i) =>
          i === index
            ? { ...p, portraits: [...p.portraits, { id: `new-${result.total}`, url: imageBase64 }] }
            : p,
        ),
      );
      setMessage(`Retrato ${result.total} de ${goal} guardado.`);
      setBusy(false);
    },
    [subject, index, goal],
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The preview is mirrored so it reads like a mirror to the person being
    // photographed; the stored image must not be, or every face is backwards.
    ctx.drawImage(video, 0, 0);
    submit(canvas.toDataURL("image/jpeg", 0.92));
  }, [submit]);

  const onFile = useCallback(
    async (file: File) => {
      const reader = new FileReader();
      reader.onload = () => submit(String(reader.result));
      reader.readAsDataURL(file);
    },
    [submit],
  );

  const go = (delta: number) => {
    setIndex((i) => Math.min(people.length - 1, Math.max(0, i + delta)));
    setMessage(null);
    setError(null);
  };

  if (!subject) {
    return (
      <div className="rounded-eture border border-dashed border-line p-12 text-center">
        <p className="font-medium">No hay nadie pendiente</p>
        <p className="mt-1 text-sm text-muted">
          Todo el grupo tiene ya sus retratos de referencia.
        </p>
      </div>
    );
  }

  const done = subject.portraits.length;
  const complete = done >= goal;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{subject.fullName}</h2>
          <p className="text-sm text-muted">
            {index + 1} de {people.length} · {done} de {goal} retratos
            {complete && " · completo"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="rounded-eture border border-line px-4 py-2 text-sm disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            onClick={() => go(1)}
            disabled={index >= people.length - 1}
            className="rounded-eture border border-line px-4 py-2 text-sm disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {!subject.hasConsent && (
        <p className="rounded-eture border border-brand p-4 text-sm text-brand">
          {subject.fullName} no tiene consentimiento biométrico registrado, así que no se
          le pueden tomar retratos de referencia. Regístralo primero — y recuerda que
          negarse no puede tener ninguna consecuencia: sus fotos se asignarán a mano.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <div className="overflow-hidden rounded-eture bg-surface">
          {cameraOn ? (
            <video
              ref={videoRef}
              playsInline
              muted
              // Mirrored preview only — the captured frame is not flipped.
              className="w-full -scale-x-100"
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-sm text-muted">
                Fondo neutro, cara despejada, de frente. Diez segundos por persona.
              </p>
              <button
                onClick={startCamera}
                disabled={!subject.hasConsent}
                className="rounded-eture bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-40"
              >
                Abrir la cámara
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {cameraOn && (
            <button
              onClick={capture}
              disabled={busy || !subject.hasConsent}
              className="w-full rounded-eture bg-brand px-4 py-4 text-sm font-medium text-white transition-colors hover:bg-brand-ink disabled:opacity-40"
            >
              {busy ? "Guardando…" : "Tomar retrato"}
            </button>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !subject.hasConsent}
            className="w-full rounded-eture border border-line px-4 py-3 text-sm transition-colors hover:border-muted disabled:opacity-40"
          >
            Subir un archivo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />

          {cameraOn && (
            <button
              onClick={stopCamera}
              className="w-full px-4 py-2 text-sm text-muted hover:text-ink"
            >
              Cerrar la cámara
            </button>
          )}

          {message && <p className="text-sm text-muted">{message}</p>}
          {error && <p className="text-sm text-brand">{error}</p>}

          <div>
            <p className="mb-2 text-xs text-muted">Retratos guardados</p>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: goal }).map((_, i) => {
                const portrait = subject.portraits[i];
                return (
                  <div
                    key={i}
                    className="aspect-square overflow-hidden rounded-eture border border-line bg-surface"
                  >
                    {portrait?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portrait.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        {i + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {subject.portraits.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Gestionar los retratos guardados</summary>
          <div className="mt-3 flex flex-wrap gap-3">
            {subject.portraits
              .filter((p) => !p.id.startsWith("new-"))
              .map((p) => (
                <form
                  key={p.id}
                  action={async () => {
                    await removePortrait(p.id);
                    setPeople((prev) =>
                      prev.map((s, i) =>
                        i === index
                          ? { ...s, portraits: s.portraits.filter((x) => x.id !== p.id) }
                          : s,
                      ),
                    );
                  }}
                >
                  <button className="text-xs underline hover:text-ink">
                    Borrar retrato
                  </button>
                </form>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
