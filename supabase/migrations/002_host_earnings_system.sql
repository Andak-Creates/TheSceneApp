-- Host Earnings & Withdrawal System Migration

-- 1. Create host_balances table
CREATE TABLE IF NOT EXISTS public.host_balances (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_earned numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create host_bank_accounts table
CREATE TABLE IF NOT EXISTS public.host_bank_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  bank_code text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  recipient_code text, -- Paystack Transfer Recipient code
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create host_earnings_logs table
CREATE TABLE IF NOT EXISTS public.host_earnings_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  amount numeric NOT NULL, -- Gross amount
  fee_amount numeric NOT NULL, -- App fee (5%)
  net_amount numeric NOT NULL, -- Host cut (95%)
  currency text NOT NULL DEFAULT 'NGN',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.host_bank_accounts(id),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  processed_at timestamptz,
  rejection_reason text,
  transaction_reference text, -- Paystack transfer reference
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE public.host_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_earnings_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Host Balances
CREATE POLICY "Users can view their own balance"
  ON public.host_balances FOR SELECT
  USING (auth.uid() = user_id);

-- Host Bank Accounts
CREATE POLICY "Users can manage their own bank accounts"
  ON public.host_bank_accounts FOR ALL
  USING (auth.uid() = user_id);

-- Host Earnings Logs
CREATE POLICY "Hosts can view their own earning logs"
  ON public.host_earnings_logs FOR SELECT
  USING (auth.uid() = host_id);

-- Withdrawal Requests
CREATE POLICY "Hosts can manage their own withdrawal requests"
  ON public.withdrawal_requests FOR ALL
  USING (auth.uid() = host_id);

-- 7. Trigger to update balance on new earning log
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

CREATE TRIGGER on_host_earning
AFTER INSERT ON public.host_earnings_logs
FOR EACH ROW EXECUTE FUNCTION public.update_host_balance_on_earning();

-- 8. Trigger to update balance on withdrawal (pending/rejected/completed)
-- Note: Balances are usually deducted when withdrawal is approved or completed.
-- For now, let's keep it simple: deduct when Status changes to 'completed'.
CREATE OR REPLACE FUNCTION public.update_host_balance_on_withdrawal()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.status != 'completed' AND NEW.status = 'completed') THEN
    UPDATE public.host_balances
    SET 
      total_withdrawn = total_withdrawn + NEW.amount,
      current_balance = current_balance - NEW.amount,
      updated_at = now()
    WHERE user_id = NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_host_withdrawal
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.update_host_balance_on_withdrawal();
