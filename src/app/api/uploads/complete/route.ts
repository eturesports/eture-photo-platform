/**
 * Called once the browser's PUT to R2 has succeeded. Queues the analysis.
 *
 * Separate from presign so that a failed or abandoned upload leaves a pending
 * row and no job, rather than a job pointing at an object that never arrived.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { requireApiRole } from "@/lib/access";

const Body = z.object({ photoIds: z.array(z.string().uuid()).min(1).max(500) });

export async function POST(request: Request) {
  const denied = await requireApiRole("admin", "media");
  if (denied) return denied;

  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  await inngest.send(
    parsed.data.photoIds.map((photoId) => ({
      name: "photo/uploaded" as const,
      data: { photoId },
    })),
  );

  return NextResponse.json({ queued: parsed.data.photoIds.length });
}
