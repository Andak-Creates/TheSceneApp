// supabase/functions/send-party-notifications/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface NotificationPayload {
  party_id: string;
  party_title: string;
  changed_fields: string[];
  notification_body: string;
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { party_id, party_title, changed_fields, notification_body } = payload;

    const title = `🎉 ${party_title} has been updated`;
    const body = `The host updated: ${notification_body}`;

    // 1. Get host info
    const { data: party } = await supabase
      .from("parties")
      .select("host_id, host_profile_id")
      .eq("id", party_id)
      .single();

    if (!party) throw new Error("Party not found");

    // 2. Viewers
    const { data: viewers } = await supabase
      .from("party_views")
      .select("user_id")
      .eq("party_id", party_id)
      .not("user_id", "is", null);

    // 3. Ticket holders
    const { data: ticketHolders } = await supabase
      .from("tickets")
      .select("user_id")
      .eq("party_id", party_id)
      .eq("payment_status", "completed");

    // 4. Host's followers — using the correct `follows` table
    // follows.following_id = the host's profiles.id (owner_id of the host profile)
    let followerIds: string[] = [];
    if (party.host_id) {
      const { data: followers } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", party.host_id);
      followerIds = (followers || []).map((f) => f.follower_id);
    }

    // 5. Host themselves
    const hostId = party.host_id ? [party.host_id] : [];

    // 6. Merge and deduplicate all recipient IDs
    const viewerIds = (viewers || []).map((v) => v.user_id).filter(Boolean);
    const ticketHolderIds = (ticketHolders || []).map((t) => t.user_id).filter(Boolean);
    const allUserIds = [
      ...new Set([...viewerIds, ...ticketHolderIds, ...followerIds, ...hostId]),
    ];

    if (allUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, in_app: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Insert in-app notifications
    await supabase.from("notifications").insert(
      allUserIds.map((user_id) => ({
        user_id,
        title,
        body,
        type: "party_update",
        data: { party_id, changed_fields },
        is_read: false,
      }))
    );

    // 8. Get push tokens for all recipients
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", allUserIds);

    const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, in_app: allUserIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Send push notifications in batches of 100
    let totalSent = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          batch.map((token) => ({
            to: token,
            title,
            body,
            data: { party_id, type: "party_update", changed_fields },
            sound: "default",
            priority: "high",
          }))
        ),
      });
      if (res.ok) totalSent += batch.length;
    }

    return new Response(
      JSON.stringify({ sent: totalSent, in_app: allUserIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-party-notifications error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});