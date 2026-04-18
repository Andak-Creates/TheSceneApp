-- Migration: Add host_follows table

CREATE TABLE public.host_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_profile_id uuid NOT NULL REFERENCES public.host_profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(follower_id, host_profile_id)
);

-- Enable RLS
ALTER TABLE public.host_follows ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read host_follows"
    ON public.host_follows FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own host_follows"
    ON public.host_follows FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own host_follows"
    ON public.host_follows FOR DELETE
    USING (auth.uid() = follower_id);

-- Create index for quick lookup
CREATE INDEX idx_host_follows_host_id ON public.host_follows(host_profile_id);
CREATE INDEX idx_host_follows_follower_id ON public.host_follows(follower_id);

-- Optional Data Migration: Copy existing legacy follows for hosts over to their primary brand
INSERT INTO public.host_follows (follower_id, host_profile_id, created_at)
SELECT 
  f.follower_id,
  hp.id AS host_profile_id,
  f.created_at
FROM public.follows f
JOIN public.profiles p ON p.id = f.following_id
JOIN public.host_profiles hp ON hp.owner_id = p.id
WHERE p.is_host = true
ON CONFLICT DO NOTHING;
