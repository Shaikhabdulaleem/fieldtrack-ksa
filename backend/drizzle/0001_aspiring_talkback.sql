-- // NEW - keep duplicate as a final status separate from rejected.
ALTER TYPE "public"."lead_status" ADD VALUE 'duplicate' BEFORE 'sent_to_client';--> statement-breakpoint
-- // NEW - record driver overrides that require an explicit admin duplicate decision.
ALTER TABLE "leads" ADD COLUMN "needs_duplicate_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- // NEW - retain the approved lead selected as the original when this lead is a duplicate.
ALTER TABLE "leads" ADD COLUMN "duplicate_of_lead_id" uuid;--> statement-breakpoint
-- // NEW - enforce the durable relationship between a duplicate and its approved original.
ALTER TABLE "leads" ADD CONSTRAINT "leads_duplicate_of_lead_id_leads_id_fk" FOREIGN KEY ("duplicate_of_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
