import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image as RNImage,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import MediaGalleryViewer from "../../components/MediaGalleryViewer";
import { getCurrencySymbol } from "../../lib/currency";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Party {
  id: string;
  title: string;
  description: string | null;
  flyer_url: string;
  date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  ticket_price: number | null;
  ticket_quantity: number;
  tickets_sold: number;
  music_genres: string[];
  vibes: string[];
  currency_code?: string;
  host_id: string;
  created_at: string;
  // TBA
  date_tba?: boolean;
  location_tba?: boolean;
  ticket_price_tba?: boolean;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_host: boolean;
  };
  media?: {
    id: string;
    media_url: string;
    media_type: "image" | "video";
    is_primary: boolean;
    display_order: number;
    thumbnail_url?: string;
  }[];
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  reposts_count?: number;
  is_reposted?: boolean;
}

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchParties();
  }, [user?.id]);

  const fetchParties = async () => {
    try {
      // Fetch parties with host info and media
      const { data: partiesData, error: partiesError } = await supabase
        .from("parties")
        .select(
          `
        *,
        host:profiles!host_id (
          id,
          username,
          avatar_url,
          is_host
        ),
        media:party_media(*)
      `,
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(50); // Fetch more since we'll filter

      if (partiesError) throw partiesError;

      // Fetch user preferences for location-based sorting
      let userCity = "";
      if (user) {
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("city")
          .eq("user_id", user.id)
          .maybeSingle();
        userCity = (prefs?.city || "").toLowerCase();
      }

      // ✅ FILTER OUT ENDED PARTIES
      const now = new Date();
      const activeParties = (partiesData || []).filter((party) => {
        // If date is TBA, show it
        if (party.date_tba) return true;

        // If end_date exists, check it
        if (party.end_date) {
            return new Date(party.end_date) > now;
        }

        // If no end_date, check the start date
        if (party.date) {
            // Assume party ends 12 hours after start if no end_date specified
            const startDate = new Date(party.date);
            const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
            return startDate > twelveHoursAgo;
        }

        return true; // Fallback
      });

      // Fetch engagement counts for each party
      const partiesWithEngagement = await Promise.all(
        activeParties.map(async (party) => {
          // Get likes count
          const { count: likesCount } = await supabase
            .from("party_likes")
            .select("*", { count: "exact", head: true })
            .eq("party_id", party.id);

          // Get comments count
          const { count: commentsCount } = await supabase
            .from("party_comments")
            .select("*", { count: "exact", head: true })
            .eq("party_id", party.id);

          // Check if current user liked and reposted this party
          let isLiked = false;
          let isReposted = false;
          if (user) {
            const [likeRes, repostRes] = await Promise.all([
              supabase.from("party_likes").select("id").eq("party_id", party.id).eq("user_id", user.id).single(),
              supabase.from("party_reposts").select("id").eq("party_id", party.id).eq("user_id", user.id).single(),
            ]);
            isLiked = !!likeRes.data;
            isReposted = !!repostRes.data;
          }

          // Get reposts count
          const { count: repostsCount } = await supabase
            .from("party_reposts")
            .select("*", { count: "exact", head: true })
            .eq("party_id", party.id);

          // Sort media: primary first, then by display_order
          if (party.media && Array.isArray(party.media)) {
            // Filter out non-http(s) urls (broken legacy local paths)
            party.media = party.media.filter((m: any) => 
               m.media_url && (m.media_url.startsWith("http") || m.media_url.startsWith("https"))
            );

            party.media.sort((a: any, b: any) => {
              if (a.is_primary) return -1;
              if (b.is_primary) return 1;
              return (a.display_order || 0) - (b.display_order || 0);
            });
          }

          return {
            ...party,
            likes_count: likesCount || 0,
            comments_count: commentsCount || 0,
            is_liked: isLiked,
            reposts_count: repostsCount || 0,
            is_reposted: isReposted,
          };
        }),
      );

      // Sort by location: same city first, then same country, then by date
      partiesWithEngagement.sort((a, b) => {
        const aCity = (a.city || "").toLowerCase();
        const bCity = (b.city || "").toLowerCase();
        const aMatchesCity = userCity && (aCity.includes(userCity) || userCity.includes(aCity));
        const bMatchesCity = userCity && (bCity.includes(userCity) || userCity.includes(bCity));
        if (aMatchesCity && !bMatchesCity) return -1;
        if (!aMatchesCity && bMatchesCity) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setParties(partiesWithEngagement);
    } catch (error) {
      console.error("Error fetching parties:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchParties();
  };

  const handleLike = async (partyId: string) => {
    if (!user) return;

    const party = parties.find((p) => p.id === partyId);
    if (!party) return;

    const wasLiked = party.is_liked;

    // Optimistic update
    setParties(
      parties.map((p) =>
        p.id === partyId
          ? {
              ...p,
              is_liked: !wasLiked,
              likes_count: wasLiked ? p.likes_count! - 1 : p.likes_count! + 1,
            }
          : p,
      ),
    );

    try {
      if (wasLiked) {
        // Unlike
        await supabase
          .from("party_likes")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        // Like
        await supabase.from("party_likes").insert({
          party_id: partyId,
          user_id: user.id,
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      // Revert on error
      setParties(
        parties.map((p) =>
          p.id === partyId
            ? {
                ...p,
                is_liked: wasLiked,
                likes_count: wasLiked ? p.likes_count! + 1 : p.likes_count! - 1,
              }
            : p,
        ),
      );
    }
  };

  const handleRepost = async (partyId: string) => {
    if (!user) return;
    const party = parties.find((p) => p.id === partyId);
    if (!party) return;
    const wasReposted = party.is_reposted;
    setParties(
      parties.map((p) =>
        p.id === partyId
          ? { ...p, is_reposted: !wasReposted, reposts_count: (p.reposts_count || 0) + (wasReposted ? -1 : 1) }
          : p,
      ),
    );
    try {
      if (wasReposted) {
        await supabase.from("party_reposts").delete().eq("party_id", partyId).eq("user_id", user.id);
      } else {
        await supabase.from("party_reposts").insert({ party_id: partyId, user_id: user.id });
      }
    } catch (e) {
      setParties(
        parties.map((p) =>
          p.id === partyId
            ? { ...p, is_reposted: wasReposted, reposts_count: (p.reposts_count || 0) + (wasReposted ? 1 : -1) }
            : p,
        ),
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const renderPartyCard = ({ item: party }: { item: Party }) => {
    // Determine image source: party_media (primary or first) -> flyer_url -> placeholder
    let imageSource = null;
    if (party.media && party.media.length > 0) {
      const primary = party.media.find((m: any) => m.is_primary);
      imageSource = primary ? primary.media_url : party.media[0].media_url;
    } else {
      imageSource = party.flyer_url;
    }

    return (
      <View className="pb-2">
        {/* Host Header */}
        <TouchableOpacity
          className="flex-row items-center px-4 py-4"
          onPress={() =>
            router.push({
              pathname: "/host/[id]",
              params: { id: party.host_id },
            })
          }
        >
          {party.host?.avatar_url ? (
            <ExpoImage
              source={{ uri: party.host.avatar_url }}
              className="w-11 h-11 rounded-full border border-white/10"
            />
          ) : (
            <View className="w-11 h-11 rounded-full bg-purple-600 items-center justify-center border border-white/10">
              <Text className="text-white font-bold text-lg">
                {party.host?.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="ml-3 flex-1">
            <Text className="text-gray-100 font-bold text-base">
              {party.host?.username}
            </Text>
            <Text className="text-gray-500 text-xs">
              {formatDate(party.created_at)}
            </Text>
          </View>
          {party.host?.is_host && (
            <View className="bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20">
              <Text className="text-purple-400 text-xs font-bold tracking-wider">HOST</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Party Gallery / Flyer */}
        <View className="px-4">
            <View className="rounded-2xl overflow-hidden bg-[#09030e] border border-white/5">
              {party.media && party.media.length > 0 ? (
                <MediaGalleryViewer
                  media={party.media}
                  onPress={() =>
                    router.push({
                      pathname: "/party/[id]",
                      params: { id: party.id },
                    })
                  }
                  aspectRatio={4 / 5}
                />
              ) : (party.flyer_url && (party.flyer_url.startsWith('http') || party.flyer_url.startsWith('https'))) ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() =>
                    router.push({
                      pathname: "/party/[id]",
                      params: { id: party.id },
                    })
                  }
                >
                  <RNImage
                    source={{ uri: party.flyer_url }}
                    className="w-full"
                    style={{ aspectRatio: 4 / 5 }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ) : (
                <View
                  className="w-full items-center justify-center"
                  style={{ aspectRatio: 4 / 5 }}
                >
                  <Ionicons name="image-outline" size={48} color="#333" />
                </View>
              )}
            </View>
        </View>

        {/* Engagement Bar */}
        <View className="flex-row items-center px-4 py-4 mt-1">
          <TouchableOpacity
            className="flex-row items-center mr-6"
            onPress={() => handleLike(party.id)}
          >
            <Ionicons
              name={party.is_liked ? "heart" : "heart-outline"}
              size={28}
              color={party.is_liked ? "#ef4444" : "#a3a3a3"}
            />
            <Text className="text-gray-300 ml-1.5 font-medium text-base">
              {party.likes_count}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center mr-6"
            onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })}
          >
            <Ionicons name="chatbubble-outline" size={26} color="#a3a3a3" />
            <Text className="text-gray-300 ml-1.5 font-medium text-base">
              {party.comments_count}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="flex-row items-center mr-4"
            onPress={() => handleRepost(party.id)}
          >
            <Ionicons
              name={party.is_reposted ? "repeat" : "repeat-outline"}
              size={26}
              color={party.is_reposted ? "#a855f7" : "#a3a3a3"}
            />
            <Text className="text-gray-300 ml-1.5 font-medium text-base">
              {party.reposts_count || 0}
            </Text>
          </TouchableOpacity>

        </View>

        {/* Party Info */}
        <View className="px-5 pb-4">
          <Text className="text-white text-xl font-extrabold mb-1.5 leading-tight">
            {party.title}
          </Text>

          {party.description && (
            <Text className="text-gray-400 text-sm mb-4 leading-relaxed" numberOfLines={2}>
              {party.description}
            </Text>
          )}

          <View className="flex-row items-center mb-2 bg-white/5 self-start px-3 py-1.5 rounded-full">
            <Ionicons name="calendar" size={14} color="#a855f7" />
            <Text className="text-gray-200 font-medium text-xs ml-1.5">
              {party.date_tba
                ? "Date TBA"
                : `${formatDate(party.date)} • ${formatTime(party.date)}`}
            </Text>
          </View>

          <View className="flex-row items-center mb-4 bg-white/5 self-start px-3 py-1.5 rounded-full">
            <Ionicons name="location" size={14} color="#a855f7" />
            <Text className="text-gray-200 font-medium text-xs ml-1.5">
              {party.location_tba
                ? "Location TBA"
                : `${party.location}, ${party.city}`}
            </Text>
          </View>

          {/* Music Genres */}
          <View className="flex-row flex-wrap gap-2 mb-4">
            {party.music_genres.slice(0, 3).map((genre) => (
              <View
                key={genre}
                className="bg-[#1e142e] border border-purple-500/20 px-3 py-1 rounded-full"
              >
                <Text className="text-purple-300 font-medium text-xs">{genre}</Text>
              </View>
            ))}
          </View>

          {/* Get Tickets Button */}
          <TouchableOpacity
            className="py-3.5 rounded-2xl items-center bg-white mt-1 shadow-lg shadow-white/10"
            activeOpacity={0.8}
            onPress={() =>
              router.push({
                pathname: "/party/[id]/tickets",
                params: { id: party.id },
              })
            }
          >
            <Text className="text-black font-extrabold text-base">
              {party.ticket_price_tba
                ? "Get Tickets • TBA"
                : `Get Tickets • ${getCurrencySymbol(party.currency_code || "NGN")}${party.ticket_price?.toLocaleString() ?? "0"}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#09030e]">
      {/* Header */}
      <View className="pt-16 pb-4 px-6 flex-row justify-between items-center">
        <View>
          <Text className="text-white text-3xl font-extrabold tracking-tight">Discover</Text>
          <Text className="text-gray-400 text-sm mt-1">Find your next experience</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(app)/search")}
          className="bg-white/5 p-3 rounded-full border border-white/10"
        >
          <Ionicons name="search" size={24} color="#a855f7" />
        </TouchableOpacity>
      </View>

      {/* Parties List */}
      <FlatList
        data={parties}
        renderItem={({ item }) => (
          <View className="px-4 mb-2">
            <View className="bg-[#150d1e] rounded-3xl overflow-hidden border border-white/5 shadow-xl">
              {renderPartyCard({ item })}
            </View>
          </View>
        )}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#a855f7"
          />
        }
        ListEmptyComponent={
          <View className=" items-center justify-center py-32">
            <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-6 border border-white/5">
                <Ionicons name="calendar-outline" size={32} color="#a855f7" />
            </View>
            <Text className="text-gray-200 text-xl font-bold mb-2">No parties yet</Text>
            <Text className="text-gray-500 text-center max-w-[80%]">
              Come back later or be the first to create one!
            </Text>
          </View>
        }
      />
    </View>
  );
}
