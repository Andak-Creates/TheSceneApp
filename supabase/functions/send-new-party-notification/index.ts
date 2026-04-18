// supabase/functions/send-new-party-notification/index.ts
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
    const { party_id } = await req.json();

    // Fetch the new party details
    const { data: party, error: partyError } = await supabase
      .from("parties")
      .select(
        "id, title, city, state, country, music_genres, vibes, date, ticket_price, currency_code",
      )
      .eq("id", party_id)
      .single();

    if (partyError || !party) throw new Error("Party not found");

    // Find users whose preferences match this party's location
    const { data: matchingPrefs } = await supabase
      .from("user_preferences")
      .select("user_id, city, state, country, music_genres, vibes")
      .or(
        [
          party.state ? `state.ilike.%${party.state}%` : null,
          party.city ? `city.ilike.%${party.city}%` : null,
          party.country ? `country.ilike.%${party.country}%` : null,
        ]
          .filter(Boolean)
          .join(","),
      );

    if (!matchingPrefs || matchingPrefs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Further filter: user's genres or vibes overlap with party's
    const interestedUsers = matchingPrefs.filter((pref) => {
      const genreMatch =
        !party.music_genres?.length ||
        !pref.music_genres?.length ||
        party.music_genres.some((g: string) => pref.music_genres?.includes(g));
      const vibeMatch =
        !party.vibes?.length ||
        !pref.vibes?.length ||
        party.vibes.some((v: string) => pref.vibes?.includes(v));
      return genreMatch || vibeMatch;
    });

    const userIds = interestedUsers.map((p) => p.user_id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Insert in-app notifications and build push array ───────────────
    const notificationsToInsert = [];
    const pushMessages = [];

    // Get push tokens map for fast lookup
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    const userTokenMap: Record<string, string[]> = {};
    if (tokenRows) {
      tokenRows.forEach(row => {
        if (!userTokenMap[row.user_id]) userTokenMap[row.user_id] = [];
        if (row.token) userTokenMap[row.user_id].push(row.token);
      });
    }

    const partyStateSafe = party.state?.toLowerCase().trim();

    for (const pref of interestedUsers) {
       const user_id = pref.user_id;
       const userStateSafe = pref.state?.toLowerCase().trim();

       // Dynamic Title matching condition
       const isNearUser = partyStateSafe && userStateSafe && partyStateSafe === userStateSafe;
       const dynamicTitle = isNearUser ? `🎊 New party near you!` : `🎊 New party on TheScene!`;
       const body = `${party.title} just dropped in ${party.city || party.state}`;

       // 1. Prepare in-app notification DB insert
       notificationsToInsert.push({
          user_id,
          title: dynamicTitle,
          body,
          type: "new_party",
          data: { party_id: party.id },
          is_read: false,
       });

       // 2. Prepare push messages for Expo if User has tokens
       const tokensForUser = userTokenMap[user_id] || [];
       for (const token of tokensForUser) {
           pushMessages.push({
             to: token,
             title: dynamicTitle,
             body,
             data: { party_id: party.id, type: "new_party" },
             sound: "default",
             priority: "high",
           });
       }
    }

    // Insert all DB notifications
    if (notificationsToInsert.length > 0) {
      await supabase.from("notifications").insert(notificationsToInsert);
    }

    // ── Send Push Notifications in batches ────────────────────────────────
    let totalSent = 0;
    for (let i = 0; i < pushMessages.length; i += 100) {
      const batch = pushMessages.slice(i, i + 100);

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });

      if (res.ok) totalSent += batch.length;
    }

    return new Response(
      JSON.stringify({ sent: totalSent, in_app: notificationsToInsert.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-new-party-notification error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
