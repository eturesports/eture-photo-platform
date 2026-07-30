import Link from "next/link";

export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {lead && <p className="mt-2 max-w-2xl text-[--color-muted]">{lead}</p>}
    </div>
  );
}

export function Card({
  href,
  title,
  meta,
  children,
}: {
  href?: string;
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  const body = (
    <div className="h-full rounded-[--radius-eture] border border-[--color-line] bg-white p-6 transition-colors hover:border-[--color-muted]">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">{title}</h2>
        {meta && <span className="shrink-0 text-sm text-[--color-muted]">{meta}</span>}
      </div>
      {children && <div className="mt-3 text-sm text-[--color-muted]">{children}</div>}
    </div>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[--radius-eture] bg-[--color-surface] p-6">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-[--color-muted]">{label}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius-eture] border border-dashed border-[--color-line] p-10 text-center text-[--color-muted]">
      {children}
    </div>
  );
}

const roleLabels: Record<string, string> = {
  player: "Jugador",
  coach: "Entrenador",
  staff: "Staff",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-[--radius-eture] bg-[--color-surface] px-2.5 py-0.5 text-xs text-[--color-muted]">
      {roleLabels[role] ?? role}
    </span>
  );
}

const kindLabels: Record<string, string> = {
  training: "Entrenamiento",
  match: "Partido",
  showcase: "Showcase",
  other: "Otro",
};

export function kindLabel(kind: string) {
  return kindLabels[kind] ?? kind;
}
