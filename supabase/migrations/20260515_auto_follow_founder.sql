-- Migration: 20260515_auto_follow_founder.sql
-- Description: Automatically make all users follow soso.andak (founder)

DO $$
DECLARE
    founder_host_id uuid;
BEGIN
    -- 1. Find the founder's host profile ID
    SELECT hp.id INTO founder_host_id
    FROM public.host_profiles hp
    JOIN public.profiles p ON p.id = hp.owner_id
    WHERE p.username = 'soso.andak'
    LIMIT 1;

    IF founder_host_id IS NOT NULL THEN
        -- 2. Catch-up for existing users
        INSERT INTO public.host_follows (follower_id, host_profile_id)
        SELECT p.id, founder_host_id
        FROM public.profiles p
        WHERE p.id NOT IN (
            SELECT follower_id 
            FROM public.host_follows 
            WHERE host_profile_id = founder_host_id
        )
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Caught up existing users for founder_host_id: %', founder_host_id;
    ELSE
        RAISE WARNING 'Founder host profile for soso.andak not found!';
    END IF;
END $$;

-- 3. Function for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_follow_founder()
RETURNS trigger AS $$
DECLARE
    founder_host_id uuid;
BEGIN
    -- Find the founder's host profile ID
    SELECT hp.id INTO founder_host_id
    FROM public.host_profiles hp
    JOIN public.profiles p ON p.id = hp.owner_id
    WHERE p.username = 'soso.andak'
    LIMIT 1;

    IF founder_host_id IS NOT NULL THEN
        INSERT INTO public.host_follows (follower_id, host_profile_id)
        VALUES (NEW.id, founder_host_id)
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger on public.profiles
DROP TRIGGER IF EXISTS trg_auto_follow_founder ON public.profiles;
CREATE TRIGGER trg_auto_follow_founder
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_follow_founder();
