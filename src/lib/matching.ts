/**
 * Turning evidence into a decision: file it, queue it, or leave it unknown.
 *
 * The asymmetry that shapes every threshold here: a false positive — someone
 * else's photo in your child's gallery, seen by their family — costs far more
 * trust than a false negative, which costs a click. So the bar leans high and
 * the doubt goes to a human.
 *
 * These numbers are a defensible starting point, not a finished calibration.
 * They should be re-tuned against a few hundred hand-labelled photos before
 * the archive is opened to families; see docs.
 */

export const THRESHOLDS = {
  /** Face alone is enough to file automatically. */
  autoFace: 92,
  /** Face plus an agreeing shirt number is enough. */
  corroboratedFace: 85,
  /** Below this a face is not worth a human's time. */
  review: 80,
  /** OCR below this is a guess. */
  numberConfidence: 90,
} as const;

export type FaceHit = { personId: string; score: number };
export type NumberHit = { personId: string | null; value: number; confidence: number; unique: boolean };

export type Decision = {
  personId: string | null;
  state: "confirmed" | "review" | "unknown";
  score: number;
};

export function decide(face: FaceHit | null, number: NumberHit | null): Decision {
  if (face && face.score >= THRESHOLDS.autoFace) {
    return { personId: face.personId, state: "confirmed", score: face.score };
  }

  // A middling face and a shirt number pointing at the same person reinforce
  // each other: two independent signals agreeing is stronger than either.
  if (
    face &&
    face.score >= THRESHOLDS.corroboratedFace &&
    number?.unique &&
    number.personId === face.personId
  ) {
    return { personId: face.personId, state: "confirmed", score: 95 };
  }

  // A number on its own never files anything. A misread digit would put
  // someone in photos that are not theirs, and one of those seen by a family
  // does more damage than a hundred unfiled photos.
  if (!face && number?.unique && number.confidence >= THRESHOLDS.numberConfidence) {
    return { personId: number.personId, state: "review", score: 70 };
  }

  if (face && face.score >= THRESHOLDS.review) {
    return { personId: face.personId, state: "review", score: face.score };
  }

  return { personId: null, state: "unknown", score: face?.score ?? 0 };
}

/**
 * Resolves a read number against the squad.
 *
 * A number identifies nobody on its own — somebody wears 10 in every squad —
 * so it only means anything inside one squad, and only when exactly one person
 * wears it.
 */
export function resolveNumber(
  value: number,
  confidence: number,
  squad: { personId: string; shirtNumber: number | null }[],
): NumberHit {
  const wearers = squad.filter((m) => m.shirtNumber === value);
  return {
    value,
    confidence,
    unique: wearers.length === 1,
    personId: wearers.length === 1 ? wearers[0].personId : null,
  };
}

/**
 * Picks the best candidate who was actually in this squad.
 *
 * Filtering before choosing — rather than taking the global best and checking
 * afterwards — is what makes the lookalike case impossible rather than
 * unlikely.
 */
export function bestInSquad(
  candidates: { externalId: string; similarity: number }[],
  squadMemberIds: Set<string>,
): FaceHit | null {
  const eligible = candidates
    .filter((c) => squadMemberIds.has(c.externalId))
    .sort((a, b) => b.similarity - a.similarity);

  const top = eligible[0];
  return top ? { personId: top.externalId, score: top.similarity } : null;
}
