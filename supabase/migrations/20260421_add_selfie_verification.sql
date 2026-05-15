-- Add selfie_image_url column to host_verifications
ALTER TABLE public.host_verifications 
ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;

COMMENT ON COLUMN public.host_verifications.selfie_image_url IS 'URL of the selfie taken by the host (optionally holding their ID).';
