import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { verification_id } = await req.json()

    if (!verification_id) {
      throw new Error('verification_id is required')
    }

    // 1. Fetch the verification record
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('host_verifications')
      .select('*')
      .eq('id', verification_id)
      .single()

    if (fetchError || !verification) {
      throw new Error(`Verification not found: ${fetchError?.message}`)
    }

    console.log(`Processing authenticity check for ${verification.full_name} (${verification_id})`)

    // ============================================================
    // MOCK MODE: Simulate Smile ID / Dojah API call
    // In a real implementation, we would use Deno.env.get('SMILE_ID_API_KEY')
    // and make a fetch request to their Enhanced Document Verification endpoint.
    // ============================================================
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    const isMockSuccess = true // We can randomize this for testing if needed
    
    const mockResult = isMockSuccess ? {
      status: 'success',
      summary: `ID Verified: Government record found for "${verification.id_number}". Name match 100%. Photo match 98.4%.`,
      provider: 'Smile ID (Mock)',
      timestamp: new Date().toISOString(),
      details: {
        document_authentic: true,
        data_matched: true,
        selfie_matched: true,
        id_expiry_check: 'Valid',
      }
    } : {
      status: 'suspicious',
      summary: 'Identity Warning: Document appears authentic but name spelling differs significantly from government record.',
      provider: 'Smile ID (Mock)',
      timestamp: new Date().toISOString(),
      details: {
        document_authentic: true,
        data_matched: false,
        selfie_matched: true,
      }
    }

    // 2. Update the record with results
    const { error: updateError } = await supabaseAdmin
      .from('host_verifications')
      .update({
        api_status: mockResult.status,
        api_verification_results: mockResult,
        api_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', verification_id)

    if (updateError) throw updateError

    return new Response(
      JSON.stringify(mockResult),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Verification Function Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
