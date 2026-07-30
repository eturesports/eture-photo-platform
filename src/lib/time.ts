/**
 * Turning camera clock readings into real instants.
 *
 * EXIF `DateTimeOriginal` is wall-clock time with no timezone — "2026:03:17
 * 18:04:11" is whatever the camera's clock said. Parsers hand that back as a
 * Date built from those digits as if they were UTC, which is a lie of one or
 * two hours in Spain.
 *
 * Left alone it produces exactly the bug you would not notice until it
 * mattered: an evening training shot at 23:30 local lands on the following
 * day in UTC and matches no session, and two sessions on one day get told
 * apart by a clock that is an hour out.
 *
 * Sessions are stored as true instants, so capture times have to be too.
 */

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** Offset of `timeZone` from UTC, in ms, at a given instant. Handles DST. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - instant.valueOf();
}

/**
 * Reinterpret a naive wall-clock reading as happening in `timeZone`.
 *
 * `naive` is a Date whose UTC fields hold the wall-clock digits — which is
 * exactly what an EXIF parser returns. Applied twice because the offset
 * depends on the instant, and the instant depends on the offset: the second
 * pass settles the hour either side of a DST change.
 */
export function wallClockToInstant(naive: Date, timeZone = DEFAULT_TIMEZONE): Date {
  const first = new Date(naive.valueOf() - offsetAt(naive, timeZone));
  return new Date(naive.valueOf() - offsetAt(first, timeZone));
}

/** The calendar date an instant falls on locally — not in UTC. */
export function localDateISO(instant: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parts; // en-CA formats as YYYY-MM-DD
}
