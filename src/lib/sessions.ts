/**
 * Assigning a photo to the training or match it was taken at.
 *
 * Nobody is going to fill in a metadata form per batch, least of all a
 * freelance. The capture time does it instead: with training on a fixed
 * weekly schedule, Tuesday at 18:04 can only be one thing.
 *
 * This proposes; it never insists. The upload screen shows what was inferred
 * and lets the whole batch be corrected in one click, because the classic
 * failure here is a camera clock set to the wrong timezone — which shifts an
 * entire card, not one photo.
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { localDateISO } from "./time";

/** Tolerance around a session's stated window: people shoot warm-ups and celebrations. */
const SLACK_MS = 2 * 60 * 60 * 1000;

export async function findSessionForTimestamp(shotAt: Date): Promise<string | null> {
  // The local calendar date, not the UTC one: a 23:30 training in Madrid is
  // still that day's session even though UTC has already rolled over.
  const day = localDateISO(shotAt);

  // Same-day candidates first: cheap, indexed, and almost always the answer.
  const sameDay = await db
    .select()
    .from(session)
    .where(eq(session.heldOn, day))
    .orderBy(asc(session.startsAt));

  if (sameDay.length === 1) return sameDay[0].id;

  if (sameDay.length > 1) {
    // Two sessions in one day — pick the one whose window actually contains the
    // shot, falling back to the nearest start time.
    const within = sameDay.find(
      (s) =>
        s.startsAt &&
        s.endsAt &&
        shotAt.valueOf() >= s.startsAt.valueOf() - SLACK_MS &&
        shotAt.valueOf() <= s.endsAt.valueOf() + SLACK_MS,
    );
    if (within) return within.id;

    const dated = sameDay.filter((s) => s.startsAt);
    if (dated.length === 0) return sameDay[0].id;

    return dated.reduce((best, s) =>
      Math.abs(s.startsAt!.valueOf() - shotAt.valueOf()) <
      Math.abs(best.startsAt!.valueOf() - shotAt.valueOf())
        ? s
        : best,
    ).id;
  }

  // Nothing that day. A session that ran past midnight is the only honest
  // reason to look wider, so allow the explicit windows to catch it.
  const spanning = await db
    .select()
    .from(session)
    .where(
      and(
        lte(session.startsAt, new Date(shotAt.valueOf() + SLACK_MS)),
        gte(session.endsAt, new Date(shotAt.valueOf() - SLACK_MS)),
      ),
    )
    .limit(1);

  return spanning[0]?.id ?? null;
}
