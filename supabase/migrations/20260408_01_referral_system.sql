-- Migration: Add Referral System tables and modify Profiles

-- 1. Modify Profiles Table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by text;

-- 2. Create Referrals Table
CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    referred_by_code text NOT NULL,
    referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(referred_user_id)
);

-- RLS for referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view referrals" ON public.referrals FOR SELECT USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
);

-- 3. Create Agents Table
CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    code text NOT NULL UNIQUE,
    window_start_date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    exit_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for agents
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can full access agents" ON public.agents USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
);

-- 4. Update the Profile Creation Trigger Function
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
    extracted_referred_by text;
BEGIN
    -- Extract the referral code if they entered one during signup
    extracted_referred_by := new.raw_user_meta_data->>'referred_by';

    -- Insert into default profiles
    INSERT INTO public.profiles (id, username, full_name, is_host, is_admin, referred_by)
    VALUES (
        new.id, 
        coalesce(new.raw_user_meta_data->>'username', 'user_' || substring(new.id::text from 1 for 6)),
        new.raw_user_meta_data->>'full_name',
        false,
        false,
        extracted_referred_by
    );

    -- If a referral code was passed, log it in the referrals table
    IF extracted_referred_by IS NOT NULL AND extracted_referred_by != '' THEN
        INSERT INTO public.referrals (referred_by_code, referred_user_id)
        VALUES (extracted_referred_by, new.id);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
