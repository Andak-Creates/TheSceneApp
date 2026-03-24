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

    const title = `🎊 New party near you!`;
    const body = `${party.title} just dropped in ${party.city || party.state}`;

    // ── Insert in-app notifications ───────────────────────────────────────
    await supabase.from("notifications").insert(
      userIds.map((user_id) => ({
        user_id,
        title,
        body,
        type: "new_party",
        data: { party_id: party.id },
        is_read: false,
      })),
    );

    // ── Get push tokens ───────────────────────────────────────────────────
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", userIds);

    const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);

    // ── Send in batches ───────────────────────────────────────────────────
    let totalSent = 0;
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const messages = batch.map((token) => ({
        to: token,
        title,
        body,
        data: { party_id: party.id, type: "new_party" },
        sound: "default",
        priority: "high",
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (res.ok) totalSent += batch.length;
    }

    return new Response(
      JSON.stringify({ sent: totalSent, in_app: userIds.length }),
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
