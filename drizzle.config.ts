import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // The archive holds special-category personal data. Never let drizzle-kit
  // push destructive changes without a reviewed migration file.
  strict: true,
  verbose: true,
} satisfies Config;
