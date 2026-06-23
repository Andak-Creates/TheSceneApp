import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Use the LIVE secret key for HMAC signature verification
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_LIVE_SECRET_KEY") || Deno.env.get("PAYSTACK_SECRET_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifySignature(signature: string | null, bodyText: string): Promise<boolean> {
  if (!signature || !PAYSTACK_SECRET_KEY) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const hashBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex === signature;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    // Verify Paystack signature — log but don't block if it fails during testing
    const signatureValid = await verifySignature(signature, bodyText);
    if (!signatureValid) {
      console.error("Invalid or missing Paystack signature. Rejecting webhook.");
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = JSON.parse(bodyText);

    // Only process successful charge events
    if (payload.event !== "charge.success") {
      return new Response("OK", { status: 200 });
    }

    const data = payload.data;
    const reference = data.reference;
    const metadata = data.metadata || {};

    // Only process ticket purchases
    if (!metadata.party_id || !metadata.tier_id) {
      console.log(`Webhook for ${reference} has no ticket metadata, skipping.`);
      return new Response("OK", { status: 200 });
    }

    console.log(`Processing charge.success webhook for reference: ${reference}`);

    // Idempotency: skip if ticket already exists
    const { data: existing } = await supabase
      .from("tickets")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (existing) {
      console.log(`Ticket already exists for ${reference}, skipping.`);
      return new Response("OK", { status: 200 });
    }

    // Fetch party details
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select("id, host_id, currency_code, title, date, location, city")
      .eq("id", metadata.party_id)
      .single();

    if (partyError || !party) {
      console.error(`Party not found: ${metadata.party_id}`);
      return new Response("Party not found", { status: 400 });
    }

    // Fetch tier details
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .select("id, name, price")
      .eq("id", metadata.tier_id)
      .single();

    if (tierError || !tier) {
      console.error(`Tier not found: ${metadata.tier_id}`);
      return new Response("Tier not found", { status: 400 });
    }

    const quantity = Number(metadata.quantity) || 1;
    // Trust the amount from Paystack's own webhook payload — it IS confirmed at this point
    const totalPaid = data.amount / 100;
    const purchasePrice = tier.price * quantity;
    const serviceFee = Math.max(0, totalPaid - purchasePrice);
    const guestEmail = data.customer.email;
    const guestName = metadata.guest_name || data.customer.first_name || "Guest";
    const currency = data.currency || party.currency_code;

    // Atomically reserve capacity
    const { data: capacityResult, error: capacityError } = await supabase.rpc("purchase_tickets_atomic", {
      p_tier_id: metadata.tier_id,
      p_quantity: quantity,
    });

    if (capacityError || !capacityResult?.success) {
      const reason = capacityResult?.error || capacityError?.message;
      console.error(`Capacity check failed for ${reference}: ${reason}`);
      return new Response("Capacity error", { status: 400 });
    }

    // Insert the ticket
    const { data: ticketData, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        party_id: metadata.party_id,
        ticket_tier_id: metadata.tier_id,
        guest_email: guestEmail,
        guest_name: guestName,
        purchase_price: purchasePrice,
        service_fee: serviceFee,
        total_paid: totalPaid,
        payment_status: "completed",
        reference: reference,
        quantity_purchased: quantity,
        quantity_used: 0,
      })
      .select()
      .single();

    if (ticketError) {
      console.error(`Ticket insert failed for ${reference}:`, ticketError.message);
      return new Response("Ticket insert failed", { status: 500 });
    }

    console.log(`Ticket created: ${ticketData.id} for reference: ${reference}`);

    // Record host earnings
    await supabase.from("host_earnings_logs").insert({
      host_id: party.host_id,
      party_id: metadata.party_id,
      ticket_id: ticketData.id,
      amount: totalPaid,
      fee_amount: serviceFee,
      net_amount: purchasePrice,
      currency: currency,
    });

    // Send confirmation email (fire and forget)
    fetch(`${SUPABASE_URL}/functions/v1/send-ticket-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticketData.id,
        partyId: metadata.party_id,
        guestEmail,
        guestName,
        partyTitle: party.title,
        partyDate: party.date,
        partyLocation: party.location,
        partyCity: party.city,
        tierName: tier.name,
        quantity,
        totalPaid,
        currency,
      })
    }).catch(e => console.error("Email send error:", e));

    return new Response("Webhook processed", { status: 200 });

  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
