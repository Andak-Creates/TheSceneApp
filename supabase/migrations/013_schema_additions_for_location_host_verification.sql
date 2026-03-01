-- Run this in Supabase SQL Editor to add missing columns and tables
-- Aligns with your current schema (user_preferences, profiles, party_reposts exist)

-- 1. Add location columns to user_preferences (fixes "country column not found" error)
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS last_noted_lat double precision;
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS last_noted_lng double precision;

-- 2. Add host verification columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS host_verified_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS host_verification_status text DEFAULT 'pending';

-- 3. Create host_verifications table
CREATE TABLE IF NOT EXISTS public.host_verifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  full_name text,
  id_type text,
  id_number text,
  id_image_url text,
  address text,
  phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.host_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own verification" ON public.host_verifications;
CREATE POLICY "Users can view own verification" ON public.host_verifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own verification" ON public.host_verifications;
CREATE POLICY "Users can insert own verification" ON public.host_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own pending verification" ON public.host_verifications;
CREATE POLICY "Users can update own pending verification" ON public.host_verifications FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can manage verifications" ON public.host_verifications;
CREATE POLICY "Admins can manage verifications" ON public.host_verifications FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- 4. Ensure party_reposts has unique constraint (avoids duplicate reposts per user/party)
CREATE UNIQUE INDEX IF NOT EXISTS party_reposts_party_user_unique ON public.party_reposts(party_id, user_id);

-- 5. Create party_bookmarks table
CREATE TABLE IF NOT EXISTS public.party_bookmarks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(party_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_party_bookmarks_party ON public.party_bookmarks(party_id);
CREATE INDEX IF NOT EXISTS idx_party_bookmarks_user ON public.party_bookmarks(user_id);

ALTER TABLE public.party_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bookmarks" ON public.party_bookmarks;
CREATE POLICY "Users can view own bookmarks" ON public.party_bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own bookmarks" ON public.party_bookmarks;
CREATE POLICY "Users can manage own bookmarks" ON public.party_bookmarks FOR ALL USING (auth.uid() = user_id);
