-- 1. Fix the trigger function first (EXCLUDED.net_amount bug)
CREATE OR REPLACE FUNCTION public.update_host_balance_on_earning()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.host_balances (user_id, total_earned, current_balance, currency)
  VALUES (NEW.host_id, NEW.net_amount, NEW.net_amount, NEW.currency)
  ON CONFLICT (user_id) DO UPDATE SET
    total_earned = host_balances.total_earned + EXCLUDED.total_earned,
    current_balance = host_balances.current_balance + EXCLUDED.current_balance,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Retroactively populate host_earnings_logs for completed tickets
-- Retroactive Earnings Migration
-- This script finds completed tickets that are missing earnings logs and creates the logs.
-- This will trigger the balance updates for hosts.

INSERT INTO public.host_earnings_logs (host_id, party_id, ticket_id, amount, fee_amount, net_amount, currency, created_at)
SELECT 
    p.host_id,
    t.party_id,
    t.id as ticket_id,
    t.total_paid as amount,
    t.service_fee as fee_amount,
    t.purchase_price as net_amount,
    COALESCE(p.currency_code, 'NGN') as currency,
    t.purchased_at as created_at
FROM 
    public.tickets t
JOIN 
    public.parties p ON t.party_id = p.id
LEFT JOIN 
    public.host_earnings_logs l ON t.id = l.ticket_id
WHERE 
    t.payment_status = 'completed'
    AND l.id IS NULL;
