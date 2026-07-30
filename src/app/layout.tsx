import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archivo fotográfico · Eture Sports",
  description: "Archivo de fotografías de entrenamientos y partidos por jugador y entrenador.",
  // An internal tool holding personal data has no business in a search index.
  robots: { index: false, follow: false },
};

/** The nav is filtered by role, so nobody is shown a door that will not open. */
const nav = [
  { href: "/", label: "Panel", roles: ["team", "photographer", "family"] },
  { href: "/upload", label: "Subir", roles: ["team", "photographer"] },
  { href: "/review", label: "Revisión", roles: ["team"] },
  { href: "/sessions", label: "Sesiones", roles: ["team"] },
  { href: "/people", label: "Personas", roles: ["team"] },
  { href: "/admin", label: "Administración", roles: ["team"] },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;

  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-[--color-line] bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              Eture <span className="text-[--color-brand]">Archivo</span>
            </Link>

            {role && (
              <nav className="flex items-center gap-1 text-sm">
                {nav
                  .filter((item) => item.roles.includes(role))
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-[--radius-eture] px-3 py-1.5 text-[--color-muted] transition-colors hover:bg-[--color-surface] hover:text-[--color-ink]"
                    >
                      {item.label}
                    </Link>
                  ))}
              </nav>
            )}

            {session?.user && (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
                className="ml-auto flex items-center gap-3 text-sm"
              >
                <span className="text-[--color-muted]">{session.user.email}</span>
                <button className="rounded-[--radius-eture] px-3 py-1.5 text-[--color-muted] transition-colors hover:bg-[--color-surface] hover:text-[--color-ink]">
                  Salir
                </button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
