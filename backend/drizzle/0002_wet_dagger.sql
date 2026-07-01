-- // NEW - represent Driver-deactivation holds as Grey without treating them as unassigned.
ALTER TYPE "public"."street_status" ADD VALUE 'on_hold';
