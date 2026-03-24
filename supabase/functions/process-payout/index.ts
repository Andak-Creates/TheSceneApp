// Supabase Edge Function: process-payout
// Handles Paystack Payouts (Transfers) when a withdrawal is approved.
// Only called for VERIFIED hosts — unverified host payouts are manual.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const { record } = await req.json();

    if (!record || record.status !== "approved") {
      return new Response(JSON.stringify({ message: "Not an approved withdrawal" }), { status: 200 });
    }

    const { id, host_id, amount, bank_account_id } = record;

    // 1. Get host bank account details
    const { data: bankAccount, error: bankError } = await supabase
      .from("host_bank_accounts")
      .select("*")
      .eq("id", bank_account_id)
      .single();

    if (bankError || !bankAccount) {
      throw new Error("Bank account not found");
    }

    // 2. Create Paystack Transfer Recipient if not already stored
    let recipientCode = bankAccount.recipient_code;

    if (!recipientCode) {
      const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",                          // Nigerian bank account
          name: bankAccount.account_name,
          account_number: bankAccount.account_number,
          bank_code: bankAccount.bank_code,       // e.g. "058" for GTBank
          currency: bankAccount.currency || "NGN",
        }),
      });

      const recipientData = await recipientRes.json();

      if (!recipientRes.ok || !recipientData.status) {
        console.error("Paystack recipient creation failed:", recipientData);
        throw new Error(recipientData.message || "Failed to create Paystack transfer recipient");
      }

      recipientCode = recipientData.data.recipient_code;

      // Save it back so we only create once
      const { error: saveErr } = await supabase
        .from("host_bank_accounts")
        .update({ recipient_code: recipientCode })
        .eq("id", bank_account_id);

      if (saveErr) {
        console.warn("Could not save recipient_code to DB:", saveErr.message);
        // Non-fatal — transfer can still proceed this session
      }
    }

    // 3. Initiate Paystack Transfer (amount is in naira, Paystack needs kobo)
    const payoutResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amount * 100),   // naira → kobo
        recipient: recipientCode,
        reason: `TheScene withdrawal - Request #${id}`,
        reference: `WD-${id}-${Date.now()}`,
      }),
    });

    const payoutResult = await payoutResponse.json();

    if (!payoutResponse.ok || !payoutResult.status) {
      console.error("Paystack transfer failed:", payoutResult);

      // Reset DB row so admin can retry
      await supabase
        .from("withdrawal_requests")
        .update({
          status: "pending",
          rejection_reason: payoutResult.message || "Paystack transfer failed",
        })
        .eq("id", id);

      throw new Error(payoutResult.message || "Paystack transfer failed");
    }

    // 4. Mark withdrawal completed with transfer reference
    const { error: updateError } = await supabase
      .from("withdrawal_requests")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        transaction_reference: payoutResult.data.reference,
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // 5. Deduct from host_balances
    await supabase.rpc("deduct_host_balance", {
      p_user_id: host_id,
      p_amount: amount,
    }).throwOnError();

    return new Response(
      JSON.stringify({ success: true, reference: payoutResult.data.reference }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Payout Processing Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 400 }
    );
  }
});
