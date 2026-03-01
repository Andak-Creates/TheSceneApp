// Supabase Edge Function: process-payout
// Handles Paystack Payouts (Transfers) when a withdrawal is approved.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  // 1. Setup Supabase Client
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { record } = await req.json(); // Record from Webhook trigger
    
    // Check if this is a withdrawal request and it's being approved
    if (!record || record.status !== "approved") {
      return new Response(JSON.stringify({ message: "Not an approved withdrawal" }), { status: 200 });
    }

    const { id, host_id, amount, bank_account_id } = record;

    // 2. Get Host Bank Details
    const { data: bankAccount, error: bankError } = await supabase
      .from("host_bank_accounts")
      .select("*")
      .eq("id", bank_account_id)
      .single();

    if (bankError || !bankAccount) {
      throw new Error("Bank account not found");
    }

    // 3. Initiate Paystack Transfer
    // Note: In a production app, you might first need to check if a "Recipient" exists 
    // or create one using Paystack's Recipient API.
    
    const payoutResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amount * 100), // Convert to kobo/smallest unit
        recipient: bankAccount.recipient_code, // Assumes recipient was created already
        reason: `Withdrawal from TheScene app - Request #${id}`,
        reference: `WD-${id}-${Date.now()}`
      }),
    });

    const payoutResult = await payoutResponse.json();

    if (!payoutResponse.ok || !payoutResult.status) {
      console.error("Paystack Payout Error:", payoutResult);
      
      // Update withdrawal request to rejected or failed
      await supabase
        .from("withdrawal_requests")
        .update({ 
          status: "pending", // Reset or mark as failed
          rejection_reason: payoutResult.message || "Paystack transfer failed" 
        })
        .eq("id", id);
        
      throw new Error(payoutResult.message || "Paystack transfer failed");
    }

    // 4. Update Withdrawal Request Status to 'completed'
    const { error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({ 
        status: "completed",
        processed_at: new Date().toISOString(),
        transaction_reference: payoutResult.data.reference
      })
      .eq("id", id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, data: payoutResult.data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Payout Processing Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
