-- Add location columns to user_preferences for geo-based recommendations
-- country, state, city (city may exist from onboarding), lat/lng

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'city') THEN
    ALTER TABLE public.user_preferences ADD COLUMN city text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'state') THEN
    ALTER TABLE public.user_preferences ADD COLUMN state text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'country') THEN
    ALTER TABLE public.user_preferences ADD COLUMN country text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'last_noted_lat') THEN
    ALTER TABLE public.user_preferences ADD COLUMN last_noted_lat double precision;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'last_noted_lng') THEN
    ALTER TABLE public.user_preferences ADD COLUMN last_noted_lng double precision;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'updated_at') THEN
    ALTER TABLE public.user_preferences ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;
