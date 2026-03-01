-- Set default currency to NGN for all relevant tables
ALTER TABLE public.parties ALTER COLUMN currency_code SET DEFAULT 'NGN';
ALTER TABLE public.ticket_tiers ALTER COLUMN currency_code SET DEFAULT 'NGN';
ALTER TABLE public.user_preferences ALTER COLUMN preferred_currency SET DEFAULT 'NGN';

-- Update existing records that are still using USD (optional but recommended for consistency)
UPDATE public.parties SET currency_code = 'NGN' WHERE currency_code = 'USD';
UPDATE public.ticket_tiers SET currency_code = 'NGN' WHERE currency_code = 'USD';
UPDATE public.user_preferences SET preferred_currency = 'NGN' WHERE preferred_currency = 'USD';
