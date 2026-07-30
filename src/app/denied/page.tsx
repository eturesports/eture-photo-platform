import Link from "next/link";

export default function DeniedPage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sin acceso</h1>
      <p className="mt-3 text-muted">
        Tu cuenta no tiene permiso para esta parte del archivo.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-eture border border-line px-5 py-2.5 text-sm transition-colors hover:border-muted"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
