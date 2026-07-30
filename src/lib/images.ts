/**
 * Image work: hashing, EXIF, derivatives.
 *
 * All of it runs on untrusted input — a photographer's card can contain
 * anything — so every function here treats a malformed file as an expected
 * outcome, not an exception to crash on.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import exifr from "exifr";
import { DEFAULT_TIMEZONE, wallClockToInstant } from "./time";

/** Exact-duplicate detection. The same memory card uploaded twice is routine. */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * dHash: a 64-bit perceptual hash.
 *
 * Downscale to 9x8 greyscale, then record whether each pixel is brighter than
 * the one to its right. Resolution, compression and small exposure shifts all
 * fall out; what remains is the structure of the image. Two frames from the
 * same burst land within a few bits of each other.
 *
 * Implemented here rather than pulled in as a dependency — it is fifteen lines
 * and one less package processing untrusted images.
 */
export async function dHash(buffer: Buffer): Promise<bigint> {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col];
      const right = pixels[row * 9 + col + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, hash); // Postgres bigint is signed.
}

/** Bits that differ. Under ~10 means "same moment, adjacent frame". */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a) ^ BigInt.asUintN(64, b);
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

export type ImageFacts = {
  width: number;
  height: number;
  shotAt: Date | null;
};

/**
 * Dimensions and the moment of capture.
 *
 * `DateTimeOriginal` is what assigns a photo to a session, so it matters more
 * than anything else here.
 *
 * EXIF records it as bare wall-clock digits with no timezone, and exifr hands
 * those back as if they were UTC — an hour or two out in Spain. Correcting it
 * here means everything downstream compares real instants against the real
 * instants stored on sessions.
 */
export async function readImageFacts(
  buffer: Buffer,
  timeZone = DEFAULT_TIMEZONE,
): Promise<ImageFacts> {
  const meta = await sharp(buffer).metadata();

  let shotAt: Date | null = null;
  try {
    const exif = await exifr.parse(buffer, ["DateTimeOriginal", "CreateDate"]);
    const raw = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (raw instanceof Date && !Number.isNaN(raw.valueOf())) {
      shotAt = wallClockToInstant(raw, timeZone);
    }
  } catch {
    // A photo with unreadable EXIF is still a photo. It just needs its session
    // assigning by hand, which the upload screen already allows.
  }

  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    shotAt,
  };
}

/**
 * The two sizes actually served. The original is never touched, so these can
 * be regenerated at any time — when the design changes, or when someone wants
 * AVIF in two years.
 */
export async function makeDerivatives(buffer: Buffer) {
  const base = sharp(buffer).rotate(); // honour the EXIF orientation flag

  const [web, thumb] = await Promise.all([
    base
      .clone()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
    base
      .clone()
      .resize(400, 400, { fit: "cover" })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer(),
  ]);

  return { web, thumb };
}
