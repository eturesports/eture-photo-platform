/**
 * Environment access, validated on first use.
 *
 * Reading `process.env.X!` at ten call sites means a missing variable surfaces
 * as a confusing error inside whatever happened to run first. Validating here
 * makes a misconfigured deployment fail loudly, naming what is missing.
 *
 * Validation is lazy on purpose. If it ran at import time the production build
 * would need real credentials just to compile pages — which would mean putting
 * database and storage secrets into CI for no reason. Instead the build stays
 * secret-free and a missing variable fails on the first request that needs it.
 */

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "Neon connection string"),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),

  // Phase 2. Absent until the AWS account is configured, and the pipeline
  // deliberately runs without it: ingest, dedupe and filing all work first.
  AWS_REGION: z.string().default("eu-west-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  REKOGNITION_COLLECTION_ID: z.string().optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

function load(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. See .env.example.`,
    );
  }

  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get: (_target, key: string) => load()[key as keyof Env],
});

/** Face recognition only runs once AWS is wired up. Phase 1 works without it. */
export function recognitionEnabled(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.REKOGNITION_COLLECTION_ID,
  );
}
