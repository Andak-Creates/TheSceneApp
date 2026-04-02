// Apply guest tickets migration directly via Supabase REST API
// Run: node apply-migration.mjs

const SUPABASE_URL = 'https://kxjwssyacuxvtlvszgse.supabase.co'
// Use service role key — get this from Supabase Dashboard > Settings > API
const SERVICE_ROLE_KEY = process.argv[2]

if (!SERVICE_ROLE_KEY) {
  console.error('Usage: node apply-migration.mjs <service_role_key>')
  process.exit(1)
}

const sql = `
-- Make user_id nullable so guests (no account) can purchase tickets
ALTER TABLE public.tickets ALTER COLUMN user_id DROP NOT NULL;

-- Add guest fields
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_email text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS guest_name text;

-- Index for guest email lookups
CREATE INDEX IF NOT EXISTS tickets_guest_email_idx ON public.tickets (guest_email)
  WHERE guest_email IS NOT NULL;

SELECT 'Migration applied successfully' as result;
`

const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
})

// Try the pg query endpoint instead
const pgResponse = await fetch(`${SUPABASE_URL}/pg/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
})

console.log('Status:', pgResponse.status)
const result = await pgResponse.text()
console.log('Result:', result)
