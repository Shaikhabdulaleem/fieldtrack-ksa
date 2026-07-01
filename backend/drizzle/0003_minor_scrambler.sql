-- // NEW - persist the client queue identifier used for idempotent retries.
ALTER TABLE "leads" ADD COLUMN "client_submission_id" text;--> statement-breakpoint
-- // NEW - guarantee one server lead for every persistent client queue entry.
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_submission_id_unique" UNIQUE("client_submission_id");
