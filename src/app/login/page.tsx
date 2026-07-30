import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Archivo fotográfico</h1>
      <p className="mt-3 text-muted">
        Escribe tu correo y te enviamos un enlace de acceso. No hace falta contraseña.
      </p>

      {error && (
        <p className="mt-6 rounded-eture border border-brand p-4 text-sm text-brand">
          No hemos podido iniciar sesión con ese correo. El acceso es sólo por invitación:
          si crees que deberías tenerlo, escribe a hello@eturesports.com.
        </p>
      )}

      <form
        action={async (formData) => {
          "use server";
          const email = String(formData.get("email") ?? "")
            .trim()
            .toLowerCase();
          await signIn("resend", { email, redirectTo: from || "/" });
        }}
        className="mt-8 space-y-4"
      >
        <label className="block text-sm font-medium">
          Correo electrónico
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
            className="mt-1.5 w-full rounded-eture border border-line px-4 py-2.5 outline-none focus:border-brand"
          />
        </label>

        <button className="w-full rounded-eture bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-ink">
          Enviarme el enlace
        </button>
      </form>

      <p className="mt-8 text-xs text-muted">
        El enlace caduca a los 15 minutos y sólo sirve una vez.
      </p>
    </div>
  );
}
