/**
 * Face and shirt-number recognition, via AWS Rekognition in eu-west-1.
 *
 * Ireland so that biometric processing stays inside the EU. (AWS is still a
 * US company, so the CLOUD Act reaches it regardless — a point for the
 * data-protection review, and the reason the schema keeps a self-hosted
 * embedding column open.)
 *
 * The thing that surprises everyone about this API: `SearchFacesByImage`
 * searches using ONE face, the largest in the image it is given. A group photo
 * therefore needs detect → crop → one search per crop, which is why cost
 * scales with faces rather than photos.
 */

import {
  DetectFacesCommand,
  DetectTextCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { env } from "./env";

let cached: RekognitionClient | null = null;

function client(): RekognitionClient {
  if (!cached) {
    cached = new RekognitionClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cached;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * Faces worth trying to identify.
 *
 * Two filters, both there to stop the review queue filling with work nobody
 * wants: anything smaller than ~80px across is a spectator in the background,
 * and anything past roughly 45° of yaw will not match reliably anyway.
 */
export async function detectFaces(
  image: Buffer,
  imageWidth: number,
  imageHeight: number,
): Promise<Box[]> {
  const res = await client().send(
    new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ["DEFAULT"] }),
  );

  const boxes: Box[] = [];
  for (const face of res.FaceDetails ?? []) {
    const b = face.BoundingBox;
    if (!b?.Width || !b.Height || b.Left == null || b.Top == null) continue;

    if (b.Width * imageWidth < 80 || b.Height * imageHeight < 80) continue;
    if (Math.abs(face.Pose?.Yaw ?? 0) > 45) continue;

    boxes.push({ x: b.Left, y: b.Top, w: b.Width, h: b.Height });
  }
  return boxes;
}

export type FaceMatch = { externalId: string; similarity: number };

/**
 * Best matches for a single cropped face, highest similarity first.
 *
 * Returns several rather than one so the caller can drop anyone who is not in
 * this session's squad before picking a winner. With a catalogue of ~120 the
 * model rarely needs that help; where it earns its keep is the case it cannot
 * solve — two people who genuinely look alike, brothers most of all — where
 * knowing only one of them was there settles it by construction.
 */
export async function searchFace(crop: Buffer, limit = 20): Promise<FaceMatch[]> {
  try {
    const res = await client().send(
      new SearchFacesByImageCommand({
        CollectionId: env.REKOGNITION_COLLECTION_ID!,
        Image: { Bytes: crop },
        MaxFaces: limit,
        FaceMatchThreshold: 70, // below this it is noise; the caller decides the real bar
      }),
    );

    return (res.FaceMatches ?? [])
      .filter((m) => m.Face?.ExternalImageId && m.Similarity != null)
      .map((m) => ({ externalId: m.Face!.ExternalImageId!, similarity: m.Similarity! }));
  } catch (error) {
    // An empty collection, or a crop with no detectable face, is an ordinary
    // outcome here — not a reason to fail the whole photo.
    if (
      error instanceof Error &&
      /InvalidParameterException|ResourceNotFoundException/.test(error.name)
    ) {
      return [];
    }
    throw error;
  }
}

/** Adds a reference face to the collection, tagged with the person's id. */
export async function indexFace(crop: Buffer, personId: string): Promise<string | null> {
  const res = await client().send(
    new IndexFacesCommand({
      CollectionId: env.REKOGNITION_COLLECTION_ID!,
      Image: { Bytes: crop },
      ExternalImageId: personId,
      MaxFaces: 1,
      QualityFilter: "AUTO",
      DetectionAttributes: [],
    }),
  );
  return res.FaceRecords?.[0]?.Face?.FaceId ?? null;
}

export type NumberRead = { value: number; confidence: number };

/**
 * Reads a shirt number from the torso below a detected face.
 *
 * Never run on the whole frame: scoreboards, advertising hoardings and the
 * opposition's numbers all read as digits. And never run at training — bibs,
 * last season's shirt, or no number at all — which is what
 * `session.numbersVisible` gates upstream.
 *
 * Realistic accuracy on a creased shirt mid-movement is 60-75%, not 95%. This
 * supports the face; it never decides alone.
 */
export async function readShirtNumber(torso: Buffer): Promise<NumberRead | null> {
  const res = await client().send(new DetectTextCommand({ Image: { Bytes: torso } }));

  let best: NumberRead | null = null;
  for (const detection of res.TextDetections ?? []) {
    if (detection.Type !== "WORD") continue;
    const text = (detection.DetectedText ?? "").trim();
    if (!/^\d{1,2}$/.test(text)) continue; // shirt numbers, not sponsor text

    const value = Number(text);
    const confidence = detection.Confidence ?? 0;
    if (!best || confidence > best.confidence) best = { value, confidence };
  }
  return best;
}
