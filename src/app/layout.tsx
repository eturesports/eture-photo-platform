import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archivo fotográfico · Eture Sports",
  description: "Archivo de fotografías de entrenamientos y partidos por jugador y entrenador.",
  // An internal tool holding personal data has no business in a search index.
  robots: { index: false, follow: false },
};

const nav = [
  { href: "/", label: "Panel" },
  { href: "/upload", label: "Subir" },
  { href: "/review", label: "Revisión" },
  { href: "/sessions", label: "Sesiones" },
  { href: "/people", label: "Personas" },
  { href: "/admin", label: "Administración" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-[--color-line] bg-white/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              Eture <span className="text-[--color-brand]">Archivo</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[--radius-eture] px-3 py-1.5 text-[--color-muted] transition-colors hover:bg-[--color-surface] hover:text-[--color-ink]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
