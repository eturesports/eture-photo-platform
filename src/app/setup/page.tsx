/**
 * What a deployment shows before it has been configured.
 *
 * Without this, a fresh deploy answers every request with a 500 and a stack
 * trace — technically accurate and useless to the person who just clicked
 * deploy. This names exactly which variables are missing and where they come
 * from.
 */

const REQUIRED = [
  {
    key: "DATABASE_URL",
    what: "Cadena de conexión de Neon (Fráncfort). Usa la versión pooled.",
  },
  { key: "R2_ACCOUNT_ID", what: "Cloudflare → R2 → tu Account ID" },
  { key: "R2_ACCESS_KEY_ID", what: "Token de API de R2, limitado a este bucket" },
  { key: "R2_SECRET_ACCESS_KEY", what: "El secreto de ese mismo token" },
  { key: "R2_BUCKET", what: "Nombre del bucket, p. ej. eture-photos" },
  { key: "AUTH_SECRET", what: "Genera uno con: npx auth secret" },
  { key: "AUTH_RESEND_KEY", what: "Clave de Resend, para enviar los enlaces de acceso" },
];

const OPTIONAL = [
  { key: "AWS_ACCESS_KEY_ID", what: "Reconocimiento facial. Sin esto todo funciona menos eso" },
  { key: "AWS_SECRET_ACCESS_KEY", what: "" },
  { key: "REKOGNITION_COLLECTION_ID", what: "p. ej. eture-2526" },
  { key: "INNGEST_EVENT_KEY", what: "Procesado en segundo plano" },
  { key: "INNGEST_SIGNING_KEY", what: "" },
];

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = REQUIRED.filter((v) => !process.env[v.key]);
  const missingOptional = OPTIONAL.filter((v) => !process.env[v.key]);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Falta configurar el archivo</h1>
      <p className="mt-3 text-muted">
        El despliegue funciona, pero todavía no tiene sus credenciales. Añádelas en Vercel
        → Settings → Environment Variables y vuelve a desplegar.
      </p>

      <h2 className="mt-10 font-medium">Imprescindibles</h2>
      <ul className="mt-3 divide-y divide-line rounded-eture border border-line">
        {REQUIRED.map((v) => {
          const isMissing = missing.some((m) => m.key === v.key);
          return (
            <li key={v.key} className="flex flex-wrap items-baseline gap-x-3 p-4">
              <code className={isMissing ? "font-medium text-brand" : "text-muted"}>
                {v.key}
              </code>
              <span className="text-xs text-muted">{isMissing ? "falta" : "configurada"}</span>
              <span className="w-full text-sm text-muted">{v.what}</span>
            </li>
          );
        })}
      </ul>

      {missingOptional.length > 0 && (
        <>
          <h2 className="mt-8 font-medium">Opcionales</h2>
          <ul className="mt-3 divide-y divide-line rounded-eture border border-line">
            {missingOptional.map((v) => (
              <li key={v.key} className="flex flex-wrap items-baseline gap-x-3 p-4">
                <code className="text-muted">{v.key}</code>
                {v.what && <span className="w-full text-sm text-muted">{v.what}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-10 rounded-eture bg-surface p-6 text-sm">
        <p className="font-medium">Después de configurar</p>
        <p className="mt-2 text-muted">
          Aplica las migraciones (<code>npm run db:migrate</code> con la
          <code> DATABASE_URL</code> de producción) y crea la primera cuenta a mano — no
          hay registro:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-eture bg-white p-4 text-xs">
{`insert into app_user (email, name, role)
values ('tu@eturesports.com', 'Tu nombre', 'admin');`}
        </pre>
      </div>
    </div>
  );
}
