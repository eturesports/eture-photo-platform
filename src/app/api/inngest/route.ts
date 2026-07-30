import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { ingestPhoto } from "@/inngest/functions/ingest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestPhoto],
});
