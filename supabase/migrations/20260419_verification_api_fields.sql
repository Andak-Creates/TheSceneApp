-- Add API verification fields to host_verifications
ALTER TABLE public.host_verifications 
ADD COLUMN IF NOT EXISTS api_verification_results JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS api_status TEXT DEFAULT 'not_checked',
ADD COLUMN IF NOT EXISTS api_verified_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN public.host_verifications.api_status IS 'not_checked, pending, success, suspicious, failed';
