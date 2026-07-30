import { Inngest } from "inngest";

/**
 * Inngest runs the analysis as durable background work.
 *
 * It replaces the worker container this project would otherwise need: the
 * functions execute inside Vercel, each photo retries on its own, and one
 * corrupt file cannot stall a batch. At roughly six executions per photo and
 * a thousand photos a month, the volume sits well inside the free tier.
 */
export const inngest = new Inngest({ id: "eture-photo-platform" });

export type PhotoUploaded = {
  name: "photo/uploaded";
  data: { photoId: string };
};

export type Events = {
  "photo/uploaded": PhotoUploaded;
};
