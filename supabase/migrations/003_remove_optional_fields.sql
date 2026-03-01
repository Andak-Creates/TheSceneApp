-- Drop unused party fields
ALTER TABLE public.parties DROP COLUMN IF EXISTS lineup;
ALTER TABLE public.parties DROP COLUMN IF EXISTS age_restriction;
ALTER TABLE public.parties DROP COLUMN IF EXISTS refund_policy;
