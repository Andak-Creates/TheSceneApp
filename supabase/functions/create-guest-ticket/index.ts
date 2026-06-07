// supabase/functions/create-guest-ticket/index.ts
// Uses service role key to bypass RLS — safe because we validate inputs server-side
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

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

    // Securely verify payment with Paystack
    if (totalPaid > 0) {
      const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
      if (!PAYSTACK_SECRET_KEY) {
        throw new Error("Server configuration error: Missing payment verification key.");
      }

      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
      });
      
      const verifyData = await verifyRes.json();
      
      if (!verifyRes.ok || !verifyData.status || verifyData.data.status !== "success") {
        return new Response(
          JSON.stringify({ error: "Payment verification failed. The transaction was not successful." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Paystack returns amount in kobo (or lowest denomination)
      const expectedAmountInKobo = Math.round(totalPaid * 100);
      if (verifyData.data.amount < expectedAmountInKobo) {
        return new Response(
          JSON.stringify({ error: "Payment amount mismatch. Did not pay the full amount." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch the party + tier details (needed for email and earnings)
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id, host_id, currency_code, title, date, location, city")
      .eq("id", partyId)
      .single();

    if (partyError || !party) {
      return new Response(
        JSON.stringify({ error: "Party not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tier } = await supabase
      .from("ticket_tiers")
      .select("name")
      .eq("id", tierId)
      .single();

    // BEFORE inserting the ticket, check capacity atomically
    const { data: capacityResult, error: capacityError } = await supabase.rpc('purchase_tickets_atomic', {
      p_tier_id: tierId,
      p_quantity: quantity,
    });

    if (capacityError || !capacityResult?.success) {
      const errReason = capacityResult?.error || capacityError?.message || "Unknown error";
      let errMsg = "Failed to reserve tickets.";
      
      if (errReason === 'sold_out') {
        errMsg = "Sorry, these tickets are sold out.";
      } else if (errReason === 'exceeds_limit') {
        errMsg = `Max ${capacityResult.max} tickets per order for this tier.`;
      }
      
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Send confirmation email to the guest (fire-and-forget — non-fatal)
    try {
      const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-ticket-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          partyId: partyId,
          guestEmail: guestEmail.toLowerCase().trim(),
          guestName: guestName.trim(),
          partyTitle: party.title,
          partyDate: party.date ?? null,
          partyLocation: party.location ?? null,
          partyCity: party.city ?? null,
          tierName: tier?.name ?? "General Admission",
          quantity: quantity ?? 1,
          totalPaid: totalPaid,
          currency: currency || party.currency_code || "NGN",
        }),
      });
      if (!emailRes.ok) {
        const emailErr = await emailRes.text();
        console.error("send-ticket-email failed:", emailErr);
      }
    } catch (emailErr) {
      console.error("Could not send ticket email:", emailErr);
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
