-- Four account types replacing three, and a link table that now serves both
-- families and players.
--
-- Written by hand rather than generated: drizzle-kit sees a dropped table and
-- a new one, which would throw away every family's access. A rename keeps it.

ALTER TABLE "guardian_of" RENAME TO "person_access";--> statement-breakpoint

-- 'team' becomes 'admin'; 'photographer' becomes 'media', the department the
-- photographers work through. 'family' is unchanged. 'player' is new.
UPDATE "app_user" SET "role" = 'admin' WHERE "role" = 'team';--> statement-breakpoint
UPDATE "app_user" SET "role" = 'media' WHERE "role" = 'photographer';--> statement-breakpoint

-- Anything unrecognised lands on the least privileged role rather than
-- silently keeping a value no code checks for.
UPDATE "app_user" SET "role" = 'family'
  WHERE "role" NOT IN ('admin', 'media', 'player', 'family');--> statement-breakpoint

ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_check"
  CHECK ("role" IN ('admin', 'media', 'player', 'family'));
