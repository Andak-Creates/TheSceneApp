-- Create a view to efficiently get unique view counts per party
CREATE OR REPLACE VIEW party_view_counts AS
SELECT party_id, COUNT(DISTINCT user_id) as view_count
FROM party_views
WHERE user_id IS NOT NULL
GROUP BY party_id;

-- Create an RPC to calculate host analytics stats on the server
CREATE OR REPLACE FUNCTION get_party_view_stats(p_party_id uuid, p_host_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_views int;
  v_follower_views int;
  v_platform_views int;
BEGIN
  -- Count total unique viewers
  SELECT count(DISTINCT user_id)
  INTO v_total_views
  FROM party_views
  WHERE party_id = p_party_id AND user_id IS NOT NULL;

  -- Count follower views
  SELECT count(DISTINCT pv.user_id)
  INTO v_follower_views
  FROM party_views pv
  JOIN follows f ON pv.user_id = f.follower_id
  WHERE pv.party_id = p_party_id 
    AND pv.user_id IS NOT NULL
    AND f.following_id = p_host_id;

  -- Platform views is total minus followers
  v_platform_views := COALESCE(v_total_views, 0) - COALESCE(v_follower_views, 0);

  RETURN json_build_object(
    'total_views', COALESCE(v_total_views, 0),
    'follower_views', COALESCE(v_follower_views, 0),
    'platform_views', v_platform_views
  );
END;
$$;
