-- 1. Function to notify all admins
CREATE OR REPLACE FUNCTION public.notify_admins(
    p_title text,
    p_body text,
    p_type text,
    p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    admin_id uuid;
BEGIN
    FOR admin_id IN (SELECT id FROM public.profiles WHERE is_admin = true)
    LOOP
        INSERT INTO public.notifications (user_id, title, body, type, data, is_read)
        VALUES (admin_id, p_title, p_body, p_type, p_data, false);
    END LOOP;
END;
$$;

-- 2. Trigger on host_verifications submission
CREATE OR REPLACE FUNCTION public.trg_fn_on_verification_submitted()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR (OLD.status != 'pending' AND NEW.status = 'pending') THEN
        PERFORM public.notify_admins(
            '🛡️ New Host Verification',
            'A new verification request has been submitted by ' || COALESCE(NEW.full_name, 'a host') || '.',
            'admin_verification',
            jsonb_build_object('verification_id', NEW.id, 'user_id', NEW.user_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_on_verification_submitted ON public.host_verifications;
CREATE TRIGGER trg_on_verification_submitted
AFTER INSERT OR UPDATE ON public.host_verifications
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_on_verification_submitted();

-- 3. Unified Withdrawal Lifecycle Trigger
-- This handles: 
-- A) Notifying admins on request.
-- B) Moving money to 'pending_payout' on request.
-- C) Finalizing 'total_withdrawn' on completion.
-- D) Refunding 'current_balance' on rejection.

CREATE OR REPLACE FUNCTION public.trg_fn_withdrawal_lifecycle()
RETURNS trigger AS $$
DECLARE
    h_name text;
BEGIN
    -- HANDLE NEW REQUEST (INSERT)
    IF (TG_OP = 'INSERT') THEN
        -- 1. Notify Admins
        SELECT COALESCE(full_name, username) INTO h_name FROM public.profiles WHERE id = NEW.host_id;
        PERFORM public.notify_admins(
            '💰 New Payout Request',
            'Withdrawal request of ' || NEW.currency || ' ' || NEW.amount::text || ' from ' || h_name || '.',
            'admin_withdrawal',
            jsonb_build_object('withdrawal_id', NEW.id, 'host_id', NEW.host_id)
        );

        -- 2. Move money from current_balance to pending_payout
        UPDATE public.host_balances
        SET 
            current_balance = current_balance - NEW.amount,
            pending_payout = pending_payout + NEW.amount,
            updated_at = now()
        WHERE user_id = NEW.host_id;
    END IF;

    -- HANDLE STATUS CHANGES (UPDATE)
    IF (TG_OP = 'UPDATE') AND (OLD.status = 'pending' AND NEW.status != 'pending') THEN
        
        -- A: Payout Succeeded (Completed/Approved)
        IF (NEW.status IN ('completed', 'approved')) THEN
            UPDATE public.host_balances
            SET 
                pending_payout = pending_payout - OLD.amount,
                total_withdrawn = total_withdrawn + OLD.amount,
                updated_at = now()
            WHERE user_id = NEW.host_id;
        
        -- B: Payout Rejected
        ELSIF (NEW.status = 'rejected') THEN
            UPDATE public.host_balances
            SET 
                pending_payout = pending_payout - OLD.amount,
                current_balance = current_balance + OLD.amount,
                updated_at = now()
            WHERE user_id = NEW.host_id;
        END IF;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_withdrawal_lifecycle ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_lifecycle
AFTER INSERT OR UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_withdrawal_lifecycle();
