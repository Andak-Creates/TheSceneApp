-- This migration adds RESTRICTIVE Row-Level Security (RLS) policies 
-- to automatically filter out content from mutually blocked users globally.

-- 1. Parties
CREATE POLICY "block_filter_parties" ON public.parties
AS RESTRICTIVE FOR SELECT
USING (
  auth.uid() IS NULL OR (
    host_id NOT IN (
      SELECT blocked_id FROM public.blocked_users WHERE blocker_id = auth.uid()
    ) AND
    host_id NOT IN (
      SELECT blocker_id FROM public.blocked_users WHERE blocked_id = auth.uid()
    )
  )
);

-- 2. Party Comments
CREATE POLICY "block_filter_comments" ON public.party_comments
AS RESTRICTIVE FOR SELECT
USING (
  auth.uid() IS NULL OR (
    user_id NOT IN (
      SELECT blocked_id FROM public.blocked_users WHERE blocker_id = auth.uid()
    ) AND
    user_id NOT IN (
      SELECT blocker_id FROM public.blocked_users WHERE blocked_id = auth.uid()
    )
  )
);


