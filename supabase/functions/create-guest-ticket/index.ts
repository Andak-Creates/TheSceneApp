// supabase/functions/create-guest-ticket/index.ts
// Uses service role key to bypass RLS — safe because we validate inputs server-side
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      partyId,
      tierId,
      quantity,
      guestEmail,
      guestName,
      reference,
      purchasePrice,
      serviceFee,
      totalPaid,
      currency,
    } = await req.json();

    // Validate required fields
    if (!partyId || !tierId || !guestEmail || !guestName || !reference) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guestEmail)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prevent duplicate reference (idempotency)
    const { data: existing } = await supabase
      .from("tickets")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: true, ticketId: existing.id, duplicate: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch the party to get host_id
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id, host_id, currency_code")
      .eq("id", partyId)
      .single();

    if (partyError || !party) {
      return new Response(
        JSON.stringify({ error: "Party not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert ticket (service role bypasses RLS)
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        party_id: partyId,
        user_id: null, // guest
        guest_email: guestEmail.toLowerCase().trim(),
        guest_name: guestName.trim(),
        ticket_tier_id: tierId,
        purchase_price: purchasePrice,
        service_fee: serviceFee,
        total_paid: totalPaid,
        payment_status: "completed",
        reference,
        quantity_purchased: quantity,
        quantity_used: 0,
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Ticket insert error:", ticketError);
      return new Response(
        JSON.stringify({ error: "Failed to create ticket", details: ticketError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Record host earnings
    const { error: earningsError } = await supabase
      .from("host_earnings_logs")
      .insert({
        host_id: party.host_id,
        party_id: partyId,
        ticket_id: ticket.id,
        amount: totalPaid,
        fee_amount: serviceFee,
        net_amount: purchasePrice,
        currency: currency || party.currency_code || "NGN",
      });

    if (earningsError) {
      console.error("Earnings log error:", earningsError);
      // Non-fatal — ticket is created
    }

    return new Response(
      JSON.stringify({ success: true, ticketId: ticket.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-guest-ticket error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
