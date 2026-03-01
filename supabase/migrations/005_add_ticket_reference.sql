-- Add payment reference column to tickets table
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS reference text;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tickets_reference ON public.tickets(reference);
