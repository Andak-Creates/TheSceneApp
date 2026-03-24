import AttendancePill from "@/components/AttendancePill";
import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Image as RNImage,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MediaGalleryViewer from "../../components/MediaGalleryViewer";
import { useUnreadNotifications } from "../../hooks/useUnreadNotifications";
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
  state: string | null;
  country: string | null;
  ticket_price: number | null;
  ticket_quantity: number;
  tickets_sold: number;
  music_genres: string[];
  vibes: string[];
  currency_code?: string;
  host_id: string;
  created_at: string;
  date_tba?: boolean;
  location_tba?: boolean;
  ticket_price_tba?: boolean;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_host: boolean;
  };
  host_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
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
  const { unreadCount } = useUnreadNotifications();

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { isFeedActive } = useAudioStore();

  const [activePartyId, setActivePartyId] = useState<string | null>(null);

  const viewabilityConfig = { itemVisiblePercentThreshold: 60 };
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActivePartyId(viewableItems[0].item.id);
    }
  }).current;

  useEffect(() => {
    fetchParties();
  }, [user?.id]);

  const fetchParties = async () => {
    try {
      // Fetch user preferences for location filtering
      let userState = "";
      let userCountry = "";
      let userCity = "";
      if (user) {
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("city, state, country")
          .eq("user_id", user.id)
          .maybeSingle();
        userState = (prefs?.state || "").toLowerCase();
        userCountry = (prefs?.country || "").toLowerCase();
        userCity = (prefs?.city || "").toLowerCase();
      }

      // Build location-filtered query
      let query = supabase
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
          host_profile:host_profiles!host_profile_id (
            id,
            name,
            avatar_url,
            is_verified
          ),
          media:party_media(*)
        `,
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(50);

      // Filter by state first, fall back to country
      if (userState || userCity) {
        query = query.or(`state.ilike.%${userState}%,city.ilike.%${userCity}%`);
      } else if (userCountry) {
        query = query.ilike("country", `%${userCountry}%`);
      }

      const { data: partiesData, error: partiesError } = await query;
      if (partiesError) throw partiesError;

      // Filter out ended parties
      const now = new Date();
      const activeParties = (partiesData || []).filter((party) => {
        if (party.date_tba) return true;
        if (party.end_date) return new Date(party.end_date) > now;
        if (party.date) {
          const startDate = new Date(party.date);
          const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
          return startDate > twelveHoursAgo;
        }
        return true;
      });

      if (activeParties.length === 0) {
        setParties([]);
        return;
      }

      const partyIds = activeParties.map((p) => p.id);

      // --- Batched engagement queries (5 total, not 5 × N) ---
      const [
        likesCountRes,
        commentsCountRes,
        repostsCountRes,
        userLikesRes,
        userRepostsRes,
      ] = await Promise.all([
        supabase
          .from("party_likes")
          .select("party_id")
          .in("party_id", partyIds),
        supabase
          .from("party_comments")
          .select("party_id")
          .in("party_id", partyIds),
        supabase
          .from("party_reposts")
          .select("party_id")
          .in("party_id", partyIds),
        user
          ? supabase
              .from("party_likes")
              .select("party_id")
              .in("party_id", partyIds)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
        user
          ? supabase
              .from("party_reposts")
              .select("party_id")
              .in("party_id", partyIds)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      // Build fast lookup maps
      const likesCountMap: Record<string, number> = {};
      const commentsCountMap: Record<string, number> = {};
      const repostsCountMap: Record<string, number> = {};
      const likedSet = new Set<string>();
      const repostedSet = new Set<string>();

      for (const r of likesCountRes.data || []) likesCountMap[r.party_id] = (likesCountMap[r.party_id] || 0) + 1;
      for (const r of commentsCountRes.data || []) commentsCountMap[r.party_id] = (commentsCountMap[r.party_id] || 0) + 1;
      for (const r of repostsCountRes.data || []) repostsCountMap[r.party_id] = (repostsCountMap[r.party_id] || 0) + 1;
      for (const r of userLikesRes.data || []) likedSet.add(r.party_id);
      for (const r of userRepostsRes.data || []) repostedSet.add(r.party_id);

      // Merge into party objects
      const partiesWithEngagement = activeParties.map((party) => {
        if (party.media && Array.isArray(party.media)) {
          party.media = party.media.filter(
            (m: any) =>
              m.media_url &&
              (m.media_url.startsWith("http") ||
                m.media_url.startsWith("https")),
          );
          party.media.sort((a: any, b: any) => {
            if (a.is_primary) return -1;
            if (b.is_primary) return 1;
            return (a.display_order || 0) - (b.display_order || 0);
          });
        }
        return {
          ...party,
          likes_count: likesCountMap[party.id] || 0,
          comments_count: commentsCountMap[party.id] || 0,
          reposts_count: repostsCountMap[party.id] || 0,
          is_liked: likedSet.has(party.id),
          is_reposted: repostedSet.has(party.id),
        };
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
        await supabase
          .from("party_likes")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("party_likes")
          .insert({ party_id: partyId, user_id: user.id });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
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
          ? {
              ...p,
              is_reposted: !wasReposted,
              reposts_count: (p.reposts_count || 0) + (wasReposted ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      if (wasReposted) {
        await supabase
          .from("party_reposts")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("party_reposts")
          .insert({ party_id: partyId, user_id: user.id });
      }
    } catch (e) {
      setParties(
        parties.map((p) =>
          p.id === partyId
            ? {
                ...p,
                is_reposted: wasReposted,
                reposts_count: (p.reposts_count || 0) + (wasReposted ? 1 : -1),
              }
            : p,
        ),
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
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
    return (
      <View className="pb-2">
        {/* Host Header */}
        <TouchableOpacity
          className="flex-row items-center px-4 py-4"
          onPress={() =>
            router.push({
              pathname: "/host/[id]",
              params: { id: party.host_profile?.id ?? party.host_id },
            })
          }
        >
          {party.host_profile?.avatar_url ? (
            <Image
              source={{ uri: party.host_profile.avatar_url }}
              style={{ width: 40, height: 40, borderRadius: 48 }}
              resizeMode="cover"
            />
          ) : (
            <View className="w-11 h-11 rounded-full bg-purple-600 items-center justify-center border border-white/10">
              <Text className="text-white font-bold text-lg">
                {(party.host_profile?.name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="ml-3 flex-1">
            <View className="flex-row items-center gap-1">
              <Text className="text-white font-extrabold text-base tracking-tight">
                {party.host_profile?.name || "Unknown Brand"}
              </Text>
              {party.host_profile?.is_verified && (
                <Ionicons name="checkmark-circle" size={16} color="#a855f7" />
              )}
            </View>
            <Text className="text-gray-500 text-xs">
              {formatDate(party.created_at)}
            </Text>
          </View>
          {party.host?.is_host && (
            <View className="bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20">
              <Text className="text-purple-400 text-xs font-bold tracking-wider">
                HOST
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Party Gallery / Flyer */}
        <View className="px-4">
          <View className="rounded-2xl overflow-hidden bg-[#09030e] border border-white/5">
            {party.media && party.media.length > 0 ? (
              <MediaGalleryViewer
                media={party.media}
                isActive={isFeedActive && party.id === activePartyId}
                instanceId={party.id}
                onPress={() => {
                  setActivePartyId(null);
                  router.push({
                    pathname: "/party/[id]",
                    params: { id: party.id },
                  });
                }}
                aspectRatio={4 / 5}
              />
            ) : party.flyer_url &&
              (party.flyer_url.startsWith("http") ||
                party.flyer_url.startsWith("https")) ? (
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
            onPress={() =>
              router.push({ pathname: "/party/[id]", params: { id: party.id } })
            }
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

          <View className="flex-row items-center gap-2 mb-2">
  <AttendancePill ticketsSold={party.tickets_sold} />
</View>


          <Text className="text-white text-xl font-extrabold mb-1.5 leading-tight">
            {party.title}
          </Text>

          {party.description && (
            <Text
              className="text-gray-400 text-sm mb-4 leading-relaxed"
              numberOfLines={2}
            >
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

          <View className="flex-row flex-wrap gap-2 mb-4">
            {party.music_genres.slice(0, 3).map((genre) => (
              <View
                key={genre}
                className="bg-[#1e142e] border border-purple-500/20 px-3 py-1 rounded-full"
              >
                <Text className="text-purple-300 font-medium text-xs">
                  {genre}
                </Text>
              </View>
            ))}
          </View>

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
      <View className="pt-16 pb-4 px-6 flex-row justify-between items-center">
  <View>
    <Text className="text-white text-3xl font-extrabold tracking-tight">
      Discover
    </Text>
    <Text className="text-gray-400 text-sm mt-1">
      Find your next experience
    </Text>
  </View>

  <View className="flex-row items-center gap-3">
    {/* Bell icon with unread badge */}
    <TouchableOpacity
      onPress={() => router.push("/settings/notifications")}
      className="bg-white/5 p-3 rounded-full border border-white/10 relative"
    >
      <Ionicons name="notifications-outline" size={22} color="#a855f7" />
      {unreadCount > 0 && (
        <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center border-2 border-[#09030e] px-1">
          <Text className="text-white text-[10px] font-bold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>

    {/* Search icon */}
    <TouchableOpacity
      onPress={() => router.push("/(app)/search")}
      className="bg-white/5 p-3 rounded-full border border-white/10"
    >
      <Ionicons name="search" size={22} color="#a855f7" />
    </TouchableOpacity>
  </View>
</View>

      <FlatList
        data={parties}
        renderItem={({ item }) => (
          <View className="px-4 mb-2">
            <View className="bg-[#150d1e] rounded-3xl overflow-hidden border border-white/5 shadow-xl">
              {renderPartyCard({ item })}
            </View>
          </View>
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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
          <View className="items-center justify-center py-32">
            <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-6 border border-white/5">
              <Ionicons name="calendar-outline" size={32} color="#a855f7" />
            </View>
            <Text className="text-gray-200 text-xl font-bold mb-2">
              No parties near you yet
            </Text>
            <Text className="text-gray-500 text-center max-w-[80%]">
              We're just getting started in your area. Check back soon, or update your location in Settings.
            </Text>
          </View>
        }
      />
    </View>
  );
}
