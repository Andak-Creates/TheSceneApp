-- Add per-party toggle: when false, users see ONLY "Sold Out" (not quantity counts).
-- Defaults to false to match the global setting we already shipped.
ALTER TABLE parties
  ADD COLUMN IF NOT EXISTS show_ticket_count boolean NOT NULL DEFAULT true;
