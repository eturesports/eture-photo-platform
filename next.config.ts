import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp and the AWS SDK are native/heavy and only ever run server-side.
  // Keeping them external stops Next from trying to bundle them into the
  // serverless function, which both breaks sharp's native bindings and
  // bloats the deployment.
  serverExternalPackages: ["sharp", "postgres"],

  // Photos are served from R2 through signed URLs; nothing is public.
  images: { remotePatterns: [{ protocol: "https", hostname: "**.r2.cloudflarestorage.com" }] },
};

export default nextConfig;
