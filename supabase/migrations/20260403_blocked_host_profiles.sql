-- Migration: blocked_host_profiles
-- Separates host-profile-level blocking from user-level blocking.
-- Previously, blocking a host stored the host's user ID in blocked_users,
-- which would hide ALL brands owned by that person. Now we block by
-- host_profile_id so only the specific brand disappears.
-- Also drops the old block_filter_parties policy that was wrongly filtering
-- parties by host_id (user account level) from the blocked_users table.

-- 0. Drop the old policy that blocked all of a person's brands when their
--    user account was blocked. Party filtering now uses host_profile_id only.
DROP POLICY IF EXISTS "block_filter_parties" ON public.parties;

-- 1. Create the blocked_host_profiles table
CREATE TABLE IF NOT EXISTS public.blocked_host_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    blocked_host_profile_id UUID REFERENCES public.host_profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_host_profile_id)
);

-- 2. Enable RLS
ALTER TABLE public.blocked_host_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "Users can view their own host profile blocks"
  ON public.blocked_host_profiles FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can insert their own host profile blocks"
  ON public.blocked_host_profiles FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete their own host profile blocks"
  ON public.blocked_host_profiles FOR DELETE
  USING (auth.uid() = blocker_id);

-- 4. RLS policy on parties: filter out parties whose host_profile_id is blocked.
--    Blocking a user account (in blocked_users) does NOT hide their brand events.
CREATE POLICY "block_filter_parties_by_host_profile"
  ON public.parties
  AS RESTRICTIVE FOR SELECT
  USING (
    auth.uid() IS NULL OR
    host_profile_id NOT IN (
      SELECT blocked_host_profile_id
      FROM public.blocked_host_profiles
      WHERE blocker_id = auth.uid()
    )
  );
