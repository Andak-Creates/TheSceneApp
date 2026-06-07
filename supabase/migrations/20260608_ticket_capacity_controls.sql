-- Add max_per_order to ticket_tiers
ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS max_per_order integer DEFAULT 2;

-- Create an atomic function to securely check and reserve tickets
CREATE OR REPLACE FUNCTION purchase_tickets_atomic(
  p_tier_id uuid,
  p_quantity integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier record;
  v_available integer;
  v_max integer;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT * INTO v_tier
  FROM ticket_tiers
  WHERE id = p_tier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'tier_not_found');
  END IF;

  v_available := v_tier.quantity - COALESCE(v_tier.quantity_sold, 0);
  
  -- If max_per_order is NULL, treat as unlimited
  v_max := COALESCE(v_tier.max_per_order, 999999);

  IF v_available < p_quantity THEN
    RETURN json_build_object('success', false, 'error', 'sold_out');
  END IF;

  IF p_quantity > v_max THEN
    RETURN json_build_object('success', false, 'error', 'exceeds_limit', 'max', v_tier.max_per_order);
  END IF;

  -- Update the quantity sold
  UPDATE ticket_tiers
  SET quantity_sold = COALESCE(quantity_sold, 0) + p_quantity
  WHERE id = p_tier_id;

  RETURN json_build_object('success', true);
END;
$$;
