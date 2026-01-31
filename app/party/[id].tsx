import { Ionicons } from "@expo/vector-icons";
import { ImageBackground } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
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
  host?: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_host: boolean;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
}

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

// ✅ ADD TICKET TIER INTERFACE
interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantity_sold: number;
}

export default function PartyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const partyId = params.id as string;

  const [party, setParty] = useState<Party | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);

  // ✅ ADD STATE FOR TIERS
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalSold, setTotalSold] = useState(0);
  const [minPrice, setMinPrice] = useState(0);

  useEffect(() => {
    if (partyId) {
      fetchPartyDetails();
      fetchComments();
      fetchTicketTiers(); // ✅ FETCH TIERS
    }
  }, [partyId]);

  // ✅ NEW FUNCTION TO FETCH TICKET TIERS
  const fetchTicketTiers = async () => {
    try {
      const { data: tiersData, error } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("party_id", partyId)
        .eq("is_active", true)
        .order("tier_order", { ascending: true });

      if (error) throw error;

      if (tiersData && tiersData.length > 0) {
        setTicketTiers(tiersData);

        // Calculate totals from tiers
        const total = tiersData.reduce((sum, tier) => sum + tier.quantity, 0);
        const sold = tiersData.reduce(
          (sum, tier) => sum + (tier.quantity_sold || 0),
          0,
        );
        const lowest = Math.min(...tiersData.map((t) => t.price));

        setTotalTickets(total);
        setTotalSold(sold);
        setMinPrice(lowest);
      }
    } catch (error) {
      console.error("Error fetching ticket tiers:", error);
    }
  };

  const fetchPartyDetails = async () => {
    try {
      const { data: partyData, error: partyError } = await supabase
        .from("parties")
        .select(
          `
          *,
          host:profiles!host_id (
            id,
            username,
            full_name,
            avatar_url,
            is_host
          )
        `,
        )
        .eq("id", partyId)
        .single();

      if (partyError) throw partyError;

      // Get engagement counts
      const { count: likesCount } = await supabase
        .from("party_likes")
        .select("*", { count: "exact", head: true })
        .eq("party_id", partyId);

      const { count: commentsCount } = await supabase
        .from("party_comments")
        .select("*", { count: "exact", head: true })
        .eq("party_id", partyId);

      // Check if user liked
      let isLiked = false;
      if (user) {
        const { data: likeData } = await supabase
          .from("party_likes")
          .select("id")
          .eq("party_id", partyId)
          .eq("user_id", user.id)
          .single();

        isLiked = !!likeData;
      }

      setParty({
        ...partyData,
        likes_count: likesCount || 0,
        comments_count: commentsCount || 0,
        is_liked: isLiked,
      });
    } catch (error) {
      console.error("Error fetching party:", error);
      Alert.alert("Error", "Failed to load party details");
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from("party_comments")
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `,
        )
        .eq("party_id", partyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  const handleLike = async () => {
    if (!user || !party) return;

    const wasLiked = party.is_liked;

    setParty({
      ...party,
      is_liked: !wasLiked,
      likes_count: wasLiked ? party.likes_count! - 1 : party.likes_count! + 1,
    });

    try {
      if (wasLiked) {
        await supabase
          .from("party_likes")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase.from("party_likes").insert({
          party_id: partyId,
          user_id: user.id,
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      setParty({
        ...party,
        is_liked: wasLiked,
        likes_count: wasLiked ? party.likes_count! + 1 : party.likes_count! - 1,
      });
    }
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;

    setSubmittingComment(true);

    try {
      const { error } = await supabase.from("party_comments").insert({
        party_id: partyId,
        user_id: user.id,
        comment_text: newComment.trim(),
      });

      if (error) throw error;

      setNewComment("");
      fetchComments();
      fetchPartyDetails(); // Refresh comment count
    } catch (error) {
      console.error("Error posting comment:", error);
      Alert.alert("Error", "Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleOpenMaps = () => {
    if (!party) return;
    const address = encodeURIComponent(`${party.location}, ${party.city}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${address}`;
    Linking.openURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
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

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!party) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <Text className="text-white">Party not found</Text>
      </View>
    );
  }

  // ✅ CALCULATE REMAINING FROM TIERS
  const ticketsRemaining = totalTickets - totalSold;
  const displayPrice = ticketTiers.length > 0 ? minPrice : party.ticket_price;

  return (
    <View className="flex-1 bg-[#191022]">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with Back Button */}
          <View className="absolute top-12 left-4 right-4 z-10 flex-row justify-between">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity className="w-10 h-10 rounded-full bg-black/50 items-center justify-center">
              <Ionicons name="share-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Party Flyer */}
          <ImageBackground
            source={{ uri: party.flyer_url }}
            className="w-full"
            style={{ aspectRatio: 4 / 5 }}
          >
            {/* Gradient overlay */}
            <LinearGradient
              colors={["transparent", "rgba(25,16,34,0.8)", "rgba(25,16,34,1)"]}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: 16,
              }}
            >
              {/* Title */}
              <Text className="text-white text-3xl font-bold">
                {party.host?.username}: {party.title}
              </Text>

              {/* Description */}
              {party.description && (
                <Text className="text-gray-300 text-base mb-4">
                  {party.description}
                </Text>
              )}
            </LinearGradient>
          </ImageBackground>

          {/* Party Info */}
          <View className="px-6 pb-6">
            {/* Date & Time */}
            <View className=" mb-4 flex flex-row items-center">
              <View className="bg-white/5 rounded-2xl p-4">
                <Ionicons name="calendar" size={20} color="#8B5CF6" />
              </View>
              <View>
                <Text className="text-white font-semibold text-base ml-3">
                  {formatDate(party.date)}
                </Text>
                <Text className="text-gray-400 text-sm ml-3">
                  Add to calender
                </Text>
              </View>
            </View>

            {/* Location */}
            <TouchableOpacity
              className=" mb-8 flex-row items-center"
              onPress={handleOpenMaps}
            >
              <View className="bg-white/5 rounded-2xl p-4">
                <Ionicons name="location" size={20} color="#8B5CF6" />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-white font-semibold text-base">
                  {party.location}
                </Text>
                <Text className="text-gray-400 text-sm">{party.city}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            {/* Music & Vibes */}
            <View className="mb-4">
              <Text className="text-white font-bold text-base mb-2">
                Music & Vibe
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {party.music_genres.map((genre) => (
                  <View
                    key={genre}
                    className="bg-purple-600/20 px-3 py-2 rounded-full"
                  >
                    <Text className="text-purple-300 text-sm">{genre}</Text>
                  </View>
                ))}
                {party.vibes.map((vibe) => (
                  <View
                    key={vibe}
                    className="bg-white/10 px-3 py-2 rounded-full"
                  >
                    <Text className="text-gray-300 text-sm">{vibe}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ✅ UPDATED TICKET INFO - NOW USES TIERS */}
            <View className="bg-purple-600/10 border border-purple-600/30 rounded-2xl p-4 mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white font-bold text-lg">Tickets</Text>
                <Text className="text-purple-400 font-bold text-xl">
                  {ticketTiers.length > 1 ? "From " : ""}₦
                  {displayPrice.toLocaleString()}
                </Text>
              </View>
              <Text className="text-gray-400 text-sm">
                {ticketsRemaining} of {totalTickets} available
              </Text>

              {/* ✅ SHOW TIER BREAKDOWN IF MULTIPLE TIERS */}
              {ticketTiers.length > 1 && (
                <View className="mt-3 pt-3 border-t border-white/10">
                  {ticketTiers.map((tier) => (
                    <View
                      key={tier.id}
                      className="flex-row justify-between items-center py-1"
                    >
                      <Text className="text-gray-400 text-xs">{tier.name}</Text>
                      <Text className="text-gray-400 text-xs">
                        {tier.quantity - tier.quantity_sold}/{tier.quantity}{" "}
                        left
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Engagement Stats */}
            <View className="flex-row items-center mb-6">
              <TouchableOpacity
                className="flex-row items-center mr-6"
                onPress={handleLike}
              >
                <Ionicons
                  name={party.is_liked ? "heart" : "heart-outline"}
                  size={28}
                  color={party.is_liked ? "#ef4444" : "#fff"}
                />
                <Text className="text-white ml-2 font-semibold text-base">
                  {party.likes_count}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center">
                <Ionicons name="chatbubble-outline" size={26} color="#fff" />
                <Text className="text-white ml-2 font-semibold text-base">
                  {party.comments_count}
                </Text>
              </View>
            </View>

            {/* Comments Section */}
            <View className="mb-20">
              {/* Comments List */}
              {comments.map((comment) => (
                <View
                  key={comment.id}
                  className="flex-row mb-4 bg-white/5 rounded-xl p-3"
                >
                  {comment.user.avatar_url ? (
                    <Image
                      source={{ uri: comment.user.avatar_url }}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <View className="w-8 h-8 rounded-full bg-purple-600 items-center justify-center">
                      <Text className="text-white text-xs font-bold">
                        {comment.user.username.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-white font-semibold text-sm">
                      {comment.user.username}
                    </Text>
                    <Text className="text-gray-300 text-sm mt-1">
                      {comment.comment_text}
                    </Text>
                  </View>
                </View>
              ))}

              {comments.length === 0 && (
                <Text className="text-gray-500 text-center py-4">
                  No comments yet. Be the first!
                </Text>
              )}

              <Text className="text-white font-bold text-lg mb-4">
                Comments
              </Text>

              {/* Comment Input */}
              <View className="flex-row items-center mb-4">
                <TextInput
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mr-2"
                  placeholder="Add a comment..."
                  placeholderTextColor="#666"
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleSubmitComment}
                  disabled={!newComment.trim() || submittingComment}
                  className={`w-10 h-10 rounded-full items-center justify-center ${
                    newComment.trim() ? "bg-purple-600" : "bg-white/10"
                  }`}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed Get Tickets Button */}
      <View className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#191022] to-transparent">
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/party/[id]/tickets",
              params: { id: partyId },
            })
          }
          className="bg-purple-600 py-4 rounded-xl items-center"
        >
          <Text className="text-white font-bold text-lg">
            Get Tickets • {ticketTiers.length > 1 ? "From " : ""}₦
            {displayPrice.toLocaleString()}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
