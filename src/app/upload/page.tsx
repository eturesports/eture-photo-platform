import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { photo } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { Uploader } from "./Uploader";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const rows = await db
    .selectDistinct({ photographer: photo.photographer })
    .from(photo)
    .where(isNotNull(photo.photographer))
    .limit(20);

  return (
    <>
      <PageHeader
        title="Subir fotos"
        lead="La sesión se deduce sola de la fecha de captura de cada foto. Si la cámara tenía la hora mal puesta, se corrige después desde la sesión."
      />
      <Uploader photographers={rows.map((r) => r.photographer!).filter(Boolean)} />
    </>
  );
}
