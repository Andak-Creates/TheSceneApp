-- Migration: Support guest ticket purchases (no account required)
-- Non-breaking: the mobile app always provides user_id, so nothing changes for existing inserts.

-- 1. Make user_id nullable so guests (no account) can purchase tickets
ALTER TABLE public.tickets ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add guest fields
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_email text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_name text;

-- 3. Index for looking up guest tickets by email (e.g. "resend ticket" flow)
CREATE INDEX IF NOT EXISTS tickets_guest_email_idx ON public.tickets (guest_email)
  WHERE guest_email IS NOT NULL;

-- 4. Make sure RLS still works: hosts can see all tickets for their parties
-- The existing RLS policies should already cover this since they filter by party_id,
-- not user_id. No RLS changes needed.
