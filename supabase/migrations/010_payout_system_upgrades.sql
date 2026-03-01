-- Payout System Upgrades & Admin Privileges

-- 1. Add is_admin to profiles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'profiles' AND COLUMN_NAME = 'is_admin') THEN
    ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. Add pending_payout to host_balances
ALTER TABLE public.host_balances ADD COLUMN IF NOT EXISTS pending_payout numeric NOT NULL DEFAULT 0;

-- 3. Update RLS for withdrawal_requests to allow admins to see all
DROP POLICY IF EXISTS "Hosts can manage their own withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY "Users can view their own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = host_id OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create their own withdrawal requests"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Admins can update withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

-- 4. Trigger to handle balance logic on withdrawal request
-- When 'pending': deduct from current_balance, add to pending_payout
-- When 'completed': deduct from pending_payout, add to total_withdrawn
-- When 'rejected': move from pending_payout back to current_balance

CREATE OR REPLACE FUNCTION public.handle_withdrawal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. INITIAL REQUEST (Insert)
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'pending' THEN
      UPDATE public.host_balances
      SET 
        current_balance = current_balance - NEW.amount,
        pending_payout = pending_payout + NEW.amount,
        updated_at = now()
      WHERE user_id = NEW.host_id;
    END IF;
  
  -- 2. STATUS UPDATE
  ELSIF (TG_OP = 'UPDATE') THEN
    IF OLD.status = 'pending' AND NEW.status = 'completed' THEN
      -- Move from pending to total_withdrawn
      UPDATE public.host_balances
      SET 
        pending_payout = pending_payout - NEW.amount,
        total_withdrawn = total_withdrawn + NEW.amount,
        updated_at = now()
      WHERE user_id = NEW.host_id;
    
    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
      -- Return from pending to current_balance
      UPDATE public.host_balances
      SET 
        pending_payout = pending_payout - NEW.amount,
        current_balance = current_balance + NEW.amount,
        updated_at = now()
      WHERE user_id = NEW.host_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_handle_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER trigger_handle_withdrawal
AFTER INSERT OR UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_withdrawal_status_change();

-- 5. Cleanup OLD simple trigger if it exists
DROP TRIGGER IF EXISTS on_host_withdrawal ON public.withdrawal_requests;
