-- ============================================================
-- Migration: auto_verify_host_profiles
-- Description: When a new host_profile row is inserted, if the
--   owner (owner_id) already has host_verification_status =
--   'approved' in the profiles table, automatically set
--   is_verified = true on the new host_profile.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_verify_host_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the owner is already a verified host
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = NEW.owner_id
      AND (
        host_verification_status = 'approved'
        OR host_verified_at IS NOT NULL
      )
  ) THEN
    NEW.is_verified := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (safe to re-run)
DROP TRIGGER IF EXISTS trg_auto_verify_host_profile ON public.host_profiles;

-- Attach the trigger — fires BEFORE INSERT so we can modify the row
CREATE TRIGGER trg_auto_verify_host_profile
  BEFORE INSERT ON public.host_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_host_profile();
