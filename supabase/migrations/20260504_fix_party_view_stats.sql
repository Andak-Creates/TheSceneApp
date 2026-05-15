-- Fix get_party_view_stats to correctly classify follower vs non-follower views.
-- The previous version only checked the legacy `follows` table, but the app
-- now uses `host_follows` for brand-level follows, causing follower views to
-- always count as 0 (non-followers), resulting in 0% shown in the chart.

CREATE OR REPLACE FUNCTION get_party_view_stats(p_party_id uuid, p_host_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_views int;
  v_follower_views int;
  v_platform_views int;
  v_host_profile_id uuid;
BEGIN
  -- Get the host_profile_id for this party so we can check brand-level follows
  SELECT host_profile_id INTO v_host_profile_id
  FROM parties
  WHERE id = p_party_id;

  -- Count total unique logged-in viewers
  SELECT count(DISTINCT user_id)
  INTO v_total_views
  FROM party_views
  WHERE party_id = p_party_id AND user_id IS NOT NULL;

  -- Count follower views — checks both legacy follows AND new host_follows
  SELECT count(DISTINCT pv.user_id)
  INTO v_follower_views
  FROM party_views pv
  WHERE pv.party_id = p_party_id
    AND pv.user_id IS NOT NULL
    AND (
      -- Legacy: viewer follows the host's user account directly
      EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = pv.user_id
          AND f.following_id = p_host_id
      )
      OR
      -- New: viewer follows the host's brand profile
      (v_host_profile_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM host_follows hf
        WHERE hf.follower_id = pv.user_id
          AND hf.host_profile_id = v_host_profile_id
      ))
    );

  -- Non-follower views = total - followers
  v_platform_views := COALESCE(v_total_views, 0) - COALESCE(v_follower_views, 0);

  RETURN json_build_object(
    'total_views',    COALESCE(v_total_views, 0),
    'follower_views', COALESCE(v_follower_views, 0),
    'platform_views', v_platform_views
  );
END;
$$;
