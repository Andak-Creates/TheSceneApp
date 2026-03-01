-- Host Verification System: First-time hosts must be verified before creating parties
-- Unverified hosts cannot withdraw until admin approves after event

-- 1. Host verification status on profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'host_verified_at') THEN
    ALTER TABLE public.profiles ADD COLUMN host_verified_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'host_verification_status') THEN
    ALTER TABLE public.profiles ADD COLUMN host_verification_status text DEFAULT 'pending' CHECK (host_verification_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- 2. Host verification submissions (ID, etc.)
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

-- 3. party_reposts (for repost feature)
CREATE TABLE IF NOT EXISTS public.party_reposts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(party_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_party_reposts_party ON public.party_reposts(party_id);
CREATE INDEX IF NOT EXISTS idx_party_reposts_user ON public.party_reposts(user_id);

ALTER TABLE public.party_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reposts" ON public.party_reposts;
CREATE POLICY "Anyone can view reposts" ON public.party_reposts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own reposts" ON public.party_reposts;
CREATE POLICY "Users can manage own reposts" ON public.party_reposts FOR ALL USING (auth.uid() = user_id);

-- 4. party_bookmarks
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
