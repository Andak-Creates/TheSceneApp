-- PartiesAt Global Enhancement Migration
-- This migration adds support for:
-- 1. Multi-currency system
-- 2. Media gallery (images + videos)
-- 3. TBA (To Be Announced) fields
-- 4. Threaded comments (Instagram-style)
-- 5. Additional party fields (lineup, dress code, age restriction, refund policy)
-- 6. Party analytics

-- ============================================================================
-- 1. CURRENCY SUPPORT
-- ============================================================================

-- Add currency rates table
CREATE TABLE IF NOT EXISTS public.currency_rates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency text NOT NULL DEFAULT 'USD',
  target_currency text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_rates_unique UNIQUE (base_currency, target_currency)
);

-- Seed with common currencies
INSERT INTO public.currency_rates (base_currency, target_currency, rate) VALUES
  ('USD', 'USD', 1.00),
  ('USD', 'NGN', 1650.00),
  ('USD', 'EUR', 0.92),
  ('USD', 'GBP', 0.79),
  ('USD', 'CAD', 1.36),
  ('USD', 'AUD', 1.53),
  ('USD', 'KES', 129.00),
  ('USD', 'ZAR', 18.50),
  ('USD', 'GHS', 15.20),
  ('USD', 'INR', 83.00),
  ('USD', 'JPY', 149.00),
  ('USD', 'CNY', 7.24)
ON CONFLICT (base_currency, target_currency) DO NOTHING;

-- Add currency preference to user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'USD' CHECK (char_length(preferred_currency) = 3),
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- Add currency to ticket_tiers
ALTER TABLE public.ticket_tiers
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'USD' CHECK (char_length(currency_code) = 3);

-- ============================================================================
-- 2. PARTY MEDIA GALLERY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.party_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url text NOT NULL,
  thumbnail_url text,
  display_order integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_media_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.parties(id)
);

CREATE INDEX IF NOT EXISTS idx_party_media_party_id ON public.party_media(party_id);
CREATE INDEX IF NOT EXISTS idx_party_media_primary ON public.party_media(party_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_party_media_order ON public.party_media(party_id, display_order);

-- ============================================================================
-- 3. THREADED COMMENTS (Instagram-style)
-- ============================================================================

-- Add threading support to party_comments
ALTER TABLE public.party_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.party_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_party_comments_parent ON public.party_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_comments_party_created ON public.party_comments(party_id, created_at DESC);

-- Function to update reply count
CREATE OR REPLACE FUNCTION update_comment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE public.party_comments 
    SET reply_count = reply_count + 1 
    WHERE id = NEW.parent_comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_comment_id IS NOT NULL THEN
    UPDATE public.party_comments 
    SET reply_count = reply_count - 1 
    WHERE id = OLD.parent_comment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_reply_count ON public.party_comments;
CREATE TRIGGER trigger_update_reply_count
AFTER INSERT OR DELETE ON public.party_comments
FOR EACH ROW EXECUTE FUNCTION update_comment_reply_count();

-- ============================================================================
-- 4. TBA FIELDS + NEW PARTY FIELDS
-- ============================================================================

-- Add TBA support and new optional fields to parties
ALTER TABLE public.parties 
  ADD COLUMN IF NOT EXISTS date_tba boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_tba boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_price_tba boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'USD' CHECK (char_length(currency_code) = 3),
  ADD COLUMN IF NOT EXISTS lineup text[],
  ADD COLUMN IF NOT EXISTS dress_code text,
  ADD COLUMN IF NOT EXISTS age_restriction text,
  ADD COLUMN IF NOT EXISTS refund_policy text;

-- Make fields nullable when TBA
ALTER TABLE public.parties 
  ALTER COLUMN date DROP NOT NULL,
  ALTER COLUMN location DROP NOT NULL,
  ALTER COLUMN ticket_price DROP NOT NULL;

-- Make flyer_url optional (now using party_media)
ALTER TABLE public.parties 
  ALTER COLUMN flyer_url DROP NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.parties.flyer_url IS 'Deprecated: Use party_media table. Kept for backward compatibility.';

-- ============================================================================
-- 5. PARTY ANALYTICS (Materialized View)
-- ============================================================================

-- Drop existing view if it exists
DROP MATERIALIZED VIEW IF EXISTS public.party_analytics;

-- Create materialized view for party analytics
CREATE MATERIALIZED VIEW public.party_analytics AS
SELECT 
  p.id as party_id,
  p.host_id,
  p.title,
  
  -- Engagement metrics
  COUNT(DISTINCT pv.id) as total_views,
  COUNT(DISTINCT pv.user_id) as unique_views,
  COUNT(DISTINCT pl.id) as total_likes,
  COUNT(DISTINCT pc.id) as total_comments,
  COUNT(DISTINCT pr.id) as total_reposts,
  
  -- Ticket metrics
  COALESCE(SUM(tt.quantity_sold), 0) as tickets_sold,
  COALESCE(SUM(tt.quantity), 0) as total_tickets,
  
  -- Revenue metrics (in party's currency)
  COALESCE(SUM(tt.price * tt.quantity_sold), 0) as gross_revenue,
  COALESCE(SUM(t.service_fee), 0) as service_fees_collected,
  
  -- Engagement rate
  CASE 
    WHEN COUNT(DISTINCT pv.id) > 0 
    THEN (COUNT(DISTINCT pl.id)::numeric / COUNT(DISTINCT pv.id) * 100)
    ELSE 0 
  END as engagement_rate,
  
  -- Last updated
  NOW() as last_updated
  
FROM public.parties p
LEFT JOIN public.party_views pv ON p.id = pv.party_id
LEFT JOIN public.party_likes pl ON p.id = pl.party_id
LEFT JOIN public.party_comments pc ON p.id = pc.party_id
LEFT JOIN public.party_reposts pr ON p.id = pr.party_id
LEFT JOIN public.ticket_tiers tt ON p.id = tt.party_id
LEFT JOIN public.tickets t ON p.id = t.party_id AND t.payment_status = 'completed'
GROUP BY p.id, p.host_id, p.title;

-- Create indexes for fast lookups
CREATE UNIQUE INDEX idx_party_analytics_party_id ON public.party_analytics(party_id);
CREATE INDEX idx_party_analytics_host_id ON public.party_analytics(host_id);

-- Refresh function (call via cron or on-demand)
CREATE OR REPLACE FUNCTION refresh_party_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.party_analytics;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate existing flyer_url to party_media for existing parties
INSERT INTO public.party_media (party_id, media_type, media_url, is_primary, display_order)
SELECT 
  id,
  'image',
  flyer_url,
  true,
  0
FROM public.parties
WHERE flyer_url IS NOT NULL 
  AND flyer_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.party_media pm 
    WHERE pm.party_id = parties.id
  );

-- Initial refresh of analytics
SELECT refresh_party_analytics();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
