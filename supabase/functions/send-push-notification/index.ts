// supabase/functions/send-push-notification/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Supports two modes:
    // 1. Single user:  { user_id, title, body, data? }
    // 2. Multi user:   { user_ids: [...], title, body, data? }
    const {
      user_id,
      user_ids,
      title,
      body: messageBody,
      data = {},
    } = body;

    if (!title || !messageBody) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetIds: string[] = user_ids ?? (user_id ? [user_id] : []);

    if (targetIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "user_id or user_ids required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get push tokens for all target users
    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", targetIds);

    if (tokenError) throw tokenError;

    const tokens = (tokenRows || [])
      .map((r) => r.token)
      .filter((t) => t && t.startsWith("ExponentPushToken"));

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "No valid push tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send in batches of 100
    let totalSent = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const messages = batch.map((token) => ({
        to: token,
        title,
        body: messageBody,
        data,
        sound: "default",
        priority: "high",
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (res.ok) totalSent += batch.length;
      else {
        const err = await res.text();
        console.error("Expo push error:", err);
      }
    }

    return new Response(
      JSON.stringify({ sent: totalSent, total_tokens: tokens.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});