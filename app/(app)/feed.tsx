import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Party {
  id: string;
  title: string;
  description: string | null;
  flyer_url: string;
  date: string;
  location: string;
  city: string;
  ticket_price: number;
  ticket_quantity: number;
  tickets_sold: number;
  music_genres: string[];
  vibes: string[];
  host_id: string;
  created_at: string;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_host: boolean;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    try {
      // Fetch parties with host info
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
          )
        `,
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (partiesError) throw partiesError;

      // Fetch engagement counts for each party
      const partiesWithEngagement = await Promise.all(
        (partiesData || []).map(async (party) => {
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

          // Check if current user liked this party
          let isLiked = false;
          if (user) {
            const { data: likeData } = await supabase
              .from("party_likes")
              .select("id")
              .eq("party_id", party.id)
              .eq("user_id", user.id)
              .single();

            isLiked = !!likeData;
          }

          return {
            ...party,
            likes_count: likesCount || 0,
            comments_count: commentsCount || 0,
            is_liked: isLiked,
          };
        }),
      );

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const renderPartyCard = ({ item: party }: { item: Party }) => (
    <View className="mb-4 bg-[#191022] pb-6 border-b border-white/10">
      {/* Host Header */}
      <TouchableOpacity
        className="flex-row items-center px-4 py-3"
        onPress={() =>
          router.push({
            pathname: "/host/[id]",
            params: { id: party.host_id },
          })
        }
      >
        {party.host?.avatar_url ? (
          <Image
            source={{ uri: party.host.avatar_url }}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <View className="w-10 h-10 rounded-full bg-purple-600 items-center justify-center">
            <Text className="text-white font-bold">
              {party.host?.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text className="text-white font-semibold">
            {party.host?.username}
          </Text>
          <Text className="text-gray-500 text-xs">
            {formatDate(party.created_at)}
          </Text>
        </View>
        {party.host?.is_host && (
          <View className="bg-purple-600/20 px-2 py-1 rounded-full">
            <Text className="text-purple-400 text-xs font-bold">HOST</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Party Flyer */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          router.push({
            pathname: "/party/[id]",
            params: { id: party.id },
          })
        }
      >
        <Image
          source={{ uri: party.flyer_url }}
          className="w-full"
          style={{ aspectRatio: 4 / 5 }}
          resizeMode="cover"
        />
      </TouchableOpacity>

      {/* Engagement Bar */}
      <View className="flex-row items-center px-4 py-3">
        <TouchableOpacity
          className="flex-row items-center mr-4"
          onPress={() => handleLike(party.id)}
        >
          <Ionicons
            name={party.is_liked ? "heart" : "heart-outline"}
            size={26}
            color={party.is_liked ? "#ef4444" : "#fff"}
          />
          <Text className="text-white ml-1 font-semibold">
            {party.likes_count}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-row items-center mr-4">
          <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          <Text className="text-white ml-1 font-semibold">
            {party.comments_count}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-row items-center mr-auto">
          <Ionicons name="repeat-outline" size={26} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity>
          <Ionicons name="bookmark-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Party Info */}
      <View className="px-4 pb-3">
        <Text className="text-white text-lg font-bold mb-1">{party.title}</Text>

        {party.description && (
          <Text className="text-gray-300 text-sm mb-2" numberOfLines={2}>
            {party.description}
          </Text>
        )}

        <View className="flex-row items-center mb-1">
          <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
          <Text className="text-gray-400 text-sm ml-1">
            {formatDate(party.date)} • {formatTime(party.date)}
          </Text>
        </View>

        <View className="flex-row items-center mb-2">
          <Ionicons name="location-outline" size={14} color="#9ca3af" />
          <Text className="text-gray-400 text-sm ml-1">
            {party.location}, {party.city}
          </Text>
        </View>

        {/* Music Genres */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {party.music_genres.slice(0, 3).map((genre) => (
            <View
              key={genre}
              className="bg-purple-600/20 px-2 py-1 rounded-full"
            >
              <Text className="text-purple-300 text-xs">{genre}</Text>
            </View>
          ))}
        </View>

        {/* Get Tickets Button */}
        <TouchableOpacity className="bg-purple-600 py-3 rounded-xl items-center"
         onPress={() =>
            router.push({
              pathname: "/party/[id]/tickets",
              params: { id: party.id },
            })
          }>
          <Text className="text-white font-bold text-base">
            Get Tickets • ₦{party.ticket_price.toLocaleString()}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 pb-3 px-4 border-b border-white/10">
        <Text className="text-white text-2xl font-bold">Feed</Text>
      </View>

      {/* Parties List */}
      <FlatList
        data={parties}
        renderItem={renderPartyCard}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8B5CF6"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Ionicons name="calendar-outline" size={64} color="#666" />
            <Text className="text-gray-400 text-lg mt-4">No parties yet</Text>
            <Text className="text-gray-600 text-sm mt-2">
              Be the first to create one!
            </Text>
          </View>
        }
      />
    </View>
  );
}
