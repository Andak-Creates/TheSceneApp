// Apply blocked_host_profiles migration via Supabase SQL API
// Run: node apply-blocked-host-profiles.mjs <service_role_key>

import { readFileSync } from 'fs'

const SUPABASE_URL = 'https://kxjwssyacuxvtlvszgse.supabase.co'
const SERVICE_ROLE_KEY = process.argv[2]

if (!SERVICE_ROLE_KEY) {
  console.error('Usage: node apply-blocked-host-profiles.mjs <service_role_key>')
  process.exit(1)
}

const sql = `
-- 0. Drop old policy that falsely hid all brand events when a user was blocked by user account
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

-- 4. New restrictive RLS: only filter parties by blocked host_profile_id (brand-level)
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

SELECT 'blocked_host_profiles migration applied successfully' as result;
`

const pgResponse = await fetch(`${SUPABASE_URL}/pg/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
})

console.log('Status:', pgResponse.status)
const result = await pgResponse.text()
console.log('Result:', result)
