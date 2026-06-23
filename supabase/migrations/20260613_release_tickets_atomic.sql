-- Creates the compensating function to release tickets if something fails after reservation
CREATE OR REPLACE FUNCTION release_tickets_atomic(
  p_tier_id uuid,
  p_quantity integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ticket_tiers
  SET quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - p_quantity)
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'tier_not_found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
