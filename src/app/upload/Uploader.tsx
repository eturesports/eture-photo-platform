"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The upload screen.
 *
 * Every file is hashed in the browser before anything is sent. That does two
 * jobs: a card uploaded twice costs no bandwidth at all, and the batch becomes
 * resumable for free — if the laptop is closed halfway through, dropping the
 * same folder again skips everything already stored and picks up the rest.
 *
 * (True multipart resumption of a single file is not implemented. At 100-200
 * edited JPEGs of a few MB each it would add real complexity for a case the
 * hash check already covers; it becomes worth doing if raw files ever land here.)
 */

type FileState = {
  name: string;
  status: "waiting" | "hashing" | "uploading" | "done" | "duplicate" | "error";
  error?: string;
};

const CONCURRENCY = 3;

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function Uploader({ photographers }: { photographers: string[] }) {
  const [photographer, setPhotographer] = useState(photographers[0] ?? "");
  const [files, setFiles] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((index: number, patch: Partial<FileState>) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }, []);

  const run = useCallback(
    async (selected: File[]) => {
      if (!photographer.trim()) return;

      setRunning(true);
      setFiles(selected.map((f) => ({ name: f.name, status: "waiting" })));
      const uploaded: string[] = [];

      let cursor = 0;
      const worker = async () => {
        while (cursor < selected.length) {
          const index = cursor++;
          const file = selected[index];
          try {
            update(index, { status: "hashing" });
            const sha256 = await sha256Hex(file);

            const presign = await fetch("/api/uploads/presign", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type || "image/jpeg",
                sha256,
                photographer,
              }),
            });
            if (!presign.ok) throw new Error(`presign ${presign.status}`);
            const result = await presign.json();

            if (result.duplicate) {
              update(index, { status: "duplicate" });
              continue;
            }

            update(index, { status: "uploading" });
            const put = await fetch(result.uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "content-type": file.type || "image/jpeg" },
            });
            if (!put.ok) throw new Error(`upload ${put.status}`);

            uploaded.push(result.photoId);
            update(index, { status: "done" });
          } catch (error) {
            update(index, {
              status: "error",
              error: error instanceof Error ? error.message : "error desconocido",
            });
          }
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      // Queue analysis only for what actually made it into the bucket.
      if (uploaded.length > 0) {
        await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ photoIds: uploaded }),
        });
      }
      setRunning(false);
    },
    [photographer, update],
  );

  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="text-sm font-medium">Fotógrafo</span>
        <input
          value={photographer}
          onChange={(e) => setPhotographer(e.target.value)}
          placeholder="Nombre de quien ha disparado"
          className="mt-1.5 w-full max-w-sm rounded-[--radius-eture] border border-[--color-line] px-4 py-2.5 outline-none focus:border-[--color-brand]"
        />
      </label>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!running) run(Array.from(e.dataTransfer.files));
        }}
        className="rounded-[--radius-eture] border border-dashed border-[--color-line] bg-[--color-surface] p-12 text-center"
      >
        <p className="text-[--color-muted]">
          Arrastra aquí la carpeta con la selección de la sesión
        </p>
        <p className="mt-1 text-sm text-[--color-muted]">
          Entre 100 y 200 fotos ya editadas. Los duplicados se descartan sin subirse.
        </p>
        <button
          type="button"
          disabled={running || !photographer.trim()}
          onClick={() => inputRef.current?.click()}
          className="mt-5 rounded-[--radius-eture] bg-[--color-brand] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[--color-brand-ink] disabled:opacity-40"
        >
          {running ? "Subiendo…" : "Elegir archivos"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => run(Array.from(e.target.files ?? []))}
        />
      </div>

      {files.length > 0 && (
        <div className="rounded-[--radius-eture] border border-[--color-line] p-6">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">{files.length} archivos</span>
            <span className="text-[--color-muted]">{counts.done ?? 0} nuevas</span>
            <span className="text-[--color-muted]">
              {counts.duplicate ?? 0} ya estaban
            </span>
            {counts.error ? (
              <span className="text-[--color-brand]">{counts.error} con error</span>
            ) : null}
          </div>

          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex justify-between gap-4">
                <span className="truncate text-[--color-muted]">{f.name}</span>
                <span
                  className={
                    f.status === "error" ? "text-[--color-brand]" : "text-[--color-muted]"
                  }
                >
                  {f.status === "done"
                    ? "subida"
                    : f.status === "duplicate"
                      ? "ya estaba"
                      : f.status === "error"
                        ? (f.error ?? "error")
                        : f.status === "hashing"
                          ? "comprobando"
                          : f.status === "uploading"
                            ? "subiendo"
                            : "en cola"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
