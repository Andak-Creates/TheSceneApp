-- Make city nullable in parties table to support Location TBA
ALTER TABLE public.parties ALTER COLUMN city DROP NOT NULL;
