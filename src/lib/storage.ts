/**
 * Cloudflare R2, spoken to over the S3 API.
 *
 * R2 rather than S3 or Vercel Blob for one reason: it does not charge for
 * egress. When 120 families download their season, that is hundreds of GB out
 * in a week — the largest line on the bill everywhere else, and zero here.
 *
 * The client is built on first use so that `next build` never needs
 * credentials.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let cached: S3Client | null = null;

function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return cached;
}

/**
 * A URL the browser can PUT straight to.
 *
 * The upload must never pass through a serverless function: proxying photos
 * through Vercel pays for the bandwidth twice and hits execution limits.
 */
export function presignUpload(key: string, contentType: string, expiresIn = 3600) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

/** A short-lived read URL. Nothing in the bucket is ever public. */
export function presignDownload(key: string, expiresIn = 3600) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn,
  });
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

/** Originals stay untouched forever; derivatives live beside them and are disposable. */
export const keys = {
  original: (id: string, ext: string) => `originals/${id}.${ext}`,
  web: (id: string) => `web/${id}.jpg`,
  thumb: (id: string) => `thumbs/${id}.jpg`,
  crop: (id: string) => `crops/${id}.jpg`,
};
