-- Migration: Fix check_in_ticket RPC to show guest_name for web guest purchases
-- Previously, when user_id is NULL on guest tickets, the profiles join returned nothing
-- and buyer_name defaulted to NULL. Now we use guest_name (then guest_email) as fallback.

CREATE OR REPLACE FUNCTION public.check_in_ticket(
  ticket_id_param uuid,
  host_id_param uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_party record;
  v_profile record;
  v_scan_count int;
  v_buyer_name text;
BEGIN
  -- Fetch the ticket
  SELECT * INTO v_ticket FROM public.tickets WHERE id = ticket_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ticket not found', 'error_code', 'NOT_FOUND');
  END IF;

  -- Fetch party to verify host
  SELECT * INTO v_party FROM public.parties WHERE id = v_ticket.party_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Party not found', 'error_code', 'PARTY_NOT_FOUND');
  END IF;

  -- Check that the caller is the host (or an admin of the host profile)
  IF v_party.host_id != host_id_param THEN
    -- Also allow host_profile admins
    IF NOT EXISTS (
      SELECT 1 FROM public.host_admins
      WHERE host_profile_id = v_party.host_profile_id
        AND user_id = host_id_param
    ) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Not authorised to scan this party', 'error_code', 'UNAUTHORIZED');
    END IF;
  END IF;

  -- Check payment
  IF v_ticket.payment_status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ticket payment not completed', 'error_code', 'UNPAID');
  END IF;

  -- Check quantity
  IF v_ticket.quantity_used >= v_ticket.quantity_purchased THEN
    RETURN jsonb_build_object('success', false, 'message', 'All entries for this ticket have been used', 'error_code', 'FULLY_USED');
  END IF;

  -- Update quantity_used
  UPDATE public.tickets
  SET quantity_used = quantity_used + 1
  WHERE id = ticket_id_param;

  -- Record the check-in
  SELECT COUNT(*) + 1 INTO v_scan_count
  FROM public.ticket_check_ins
  WHERE ticket_id = ticket_id_param;

  INSERT INTO public.ticket_check_ins (ticket_id, checked_in_at, scan_number)
  VALUES (ticket_id_param, NOW(), v_scan_count);

  -- Resolve buyer name: prefer profile full_name/username, fallback to guest_name, then guest_email
  IF v_ticket.user_id IS NOT NULL THEN
    SELECT full_name, username INTO v_profile
    FROM public.profiles
    WHERE id = v_ticket.user_id;

    v_buyer_name := COALESCE(v_profile.full_name, v_profile.username);
  END IF;

  -- For guest tickets (or if profile lookup returned nothing), use guest fields
  IF v_buyer_name IS NULL OR v_buyer_name = '' THEN
    v_buyer_name := COALESCE(v_ticket.guest_name, v_ticket.guest_email, 'Guest');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Check-in successful',
    'scan_number', v_scan_count,
    'total_tickets', v_ticket.quantity_purchased,
    'remaining', v_ticket.quantity_purchased - v_ticket.quantity_used - 1,
    'buyer_name', v_buyer_name,
    'party_title', v_party.title
  );
END;
$$;
