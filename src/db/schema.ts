/**
 * The archive's data model.
 *
 * Two rules run through it, both from the specification:
 *
 *  1. Consent is enforced by the schema, not by a policy document. A face
 *     vector is special-category personal data under GDPR Article 9, so
 *     nothing may be indexed for a person without a live `consent` row of
 *     scope 'biometric'. Revoking it deletes their vectors, never their
 *     photos — a photo has other people in it.
 *
 *  2. Squad membership is declared once a season, not per session. Keeping
 *     attendance for three trainings a week would be more precise and nobody
 *     would maintain it; a stale list rejects correct matches.
 */

import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Players, coaches and staff share one table: all are archived, all appear in photos. */
export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    slug: text("slug").notNull().unique(),
    /** 'player' | 'coach' | 'staff' — drives the consent regime, see docs §10. */
    role: text("role").notNull(),
    /** Not optional: it decides whether a guardian must give consent. */
    birthDate: date("birth_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("person_role_idx").on(t.role)],
);

/**
 * Consent, per scope. The worker checks this before indexing anyone.
 *
 * 'biometric' is deliberately separate from 'gallery' and 'marketing': under
 * GDPR consent must be freely given, so declining face recognition cannot cost
 * someone their place in the programme or their gallery.
 */
export const consent = pgTable(
  "consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // 'biometric' | 'gallery' | 'marketing'
    granted: boolean("granted").notNull(),
    /** The guardian for a minor, the person themselves for an adult. */
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
  },
  (t) => [uniqueIndex("consent_person_scope_idx").on(t.personId, t.scope)],
);

/** The stable group that trains together for a season. */
export const squad = pgTable("squad", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // 'Gap Year 25/26'
  program: text("program").notNull(), // 'gapyear' | 'eturefc' | 'highschool' | 'camp'
  season: text("season").notNull(), // '25/26'
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
});

export const squadMember = pgTable(
  "squad_member",
  {
    squadId: uuid("squad_id")
      .notNull()
      .references(() => squad.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    /** Stable for the whole season, which is what makes it usable for OCR. */
    shirtNumber: smallint("shirt_number"),
    joinedOn: date("joined_on"),
    /** A mid-season departure stops them being searched for later sessions. */
    leftOn: date("left_on"),
  },
  (t) => [
    primaryKey({ columns: [t.squadId, t.personId] }),
    index("squad_member_number_idx").on(t.squadId, t.shirtNumber),
  ],
);

/** A single day: a training, a match, a showcase. */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    squadId: uuid("squad_id")
      .notNull()
      .references(() => squad.id),
    kind: text("kind").notNull(), // 'training' | 'match' | 'showcase' | 'other'
    heldOn: date("held_on").notNull(),
    /** Separates two sessions on the same day when matching photos by EXIF time. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    opponent: text("opponent"),
    venue: text("venue"),
    /**
     * True only when the squad wore numbered kit. Gates the shirt-number OCR:
     * at training people wear bibs, last season's shirt or no number at all,
     * and a number read off a random bib is worse than no number.
     */
    numbersVisible: boolean("numbers_visible").notNull().default(false),
  },
  (t) => [index("session_squad_date_idx").on(t.squadId, t.heldOn)],
);

/** One upload run by one photographer, so the batch can be reported back to them. */
export const uploadBatch = pgTable("upload_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  photographer: text("photographer").notNull(),
  sessionId: uuid("session_id").references(() => session.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  received: smallint("received").notNull().default(0),
  duplicates: smallint("duplicates").notNull().default(0),
});

export const photo = pgTable(
  "photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => session.id),
    batchId: uuid("batch_id").references(() => uploadBatch.id),
    /** The original. Never modified — derivatives are regenerated, this is not. */
    storageKey: text("storage_key").notNull().unique(),
    webKey: text("web_key"),
    thumbKey: text("thumb_key"),
    /** Exact duplicate detection: the same card uploaded twice is the norm. */
    sha256: text("sha256").notNull(),
    /** Perceptual hash, for grouping near-identical burst frames. */
    phash: bigint("phash", { mode: "bigint" }),
    width: smallint("width"),
    height: smallint("height"),
    bytes: bigint("bytes", { mode: "number" }),
    /** EXIF DateTimeOriginal — this is what assigns the session. */
    shotAt: timestamp("shot_at", { withTimezone: true }),
    photographer: text("photographer"),
    /** pending | processing | done | failed | quarantined */
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    facesDetected: smallint("faces_detected"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("photo_session_status_idx").on(t.sessionId, t.status),
    index("photo_sha_idx").on(t.sha256),
    index("photo_phash_idx").on(t.phash),
  ],
);

/** The central table. One row = "this person appears in this photo". */
export const appearance = pgTable(
  "appearance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photo.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    /** {x,y,w,h} normalised 0-1, so it survives any resize. */
    bbox: jsonb("bbox").notNull(),

    faceScore: real("face_score"), // 0-100 similarity
    numberRead: smallint("number_read"), // match days only
    numberScore: real("number_score"),
    combinedScore: real("combined_score").notNull(),

    source: text("source").notNull(), // 'auto' | 'human' | 'bulk'
    state: text("state").notNull(), // 'confirmed' | 'review' | 'rejected' | 'unknown'
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appearance_person_state_idx").on(t.personId, t.state),
    index("appearance_queue_idx").on(t.state, t.combinedScore),
    // Nobody is confirmed twice in the same photo.
    uniqueIndex("appearance_unique_confirmed_idx")
      .on(t.photoId, t.personId)
      .where(sql`${t.state} = 'confirmed'`),
  ],
);

/**
 * Reference faces. Each person accumulates several — front, profile, with and
 * without a beard, different light — which is what makes recognition improve
 * with use. With weekly training the loop converges within a few sessions.
 *
 * `awsFaceId` is set when Rekognition holds the vector; `embedding` when it is
 * computed in-house. Keeping both means switching engines is a backfill, not a
 * rewrite — which matters if the data-protection review rules out US processors.
 */
export const faceRef = pgTable(
  "face_ref",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    awsFaceId: text("aws_face_id").unique(),
    embedding: vector("embedding", { dimensions: 512 }),
    cropKey: text("crop_key").notNull(),
    /** 'enrolment' | 'human_confirm' — never 'auto', or one error propagates. */
    origin: text("origin").notNull(),
    quality: real("quality"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("face_ref_person_idx").on(t.personId),
    index("face_ref_vector_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/** Who viewed or downloaded what. The first thing asked for in a complaint. */
export const accessLog = pgTable("access_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  photoId: uuid("photo_id"),
  personId: uuid("person_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type Person = typeof person.$inferSelect;
export type Squad = typeof squad.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Photo = typeof photo.$inferSelect;
export type Appearance = typeof appearance.$inferSelect;
