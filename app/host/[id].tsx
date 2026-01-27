import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface HostProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_host: boolean;
  created_at: string;
}

interface Stats {
  partiesHosted: number;
  totalTicketsSold: number;
  averageRating: number;
  totalReviews: number;
  followers: number;
  following: number;
}

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string;
  location: string;
  city: string;
  ticket_price: number;
  tickets_sold: number;
  ticket_quantity: number;
}

export default function HostProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const hostId = params.id as string;

  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [stats, setStats] = useState<Stats>({
    partiesHosted: 0,
    totalTicketsSold: 0,
    averageRating: 0,
    totalReviews: 0,
    followers: 0,
    following: 0,
  });
  const [parties, setParties] = useState<Party[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    if (hostId) {
      fetchHostProfile();
      fetchHostStats();
      fetchHostParties();
      checkIfFollowing();
    }
  }, [hostId]);

  const fetchHostProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", hostId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching host profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHostStats = async () => {
    try {
      // Parties hosted
      const { count: hosted } = await supabase
        .from("parties")
        .select("*", { count: "exact", head: true })
        .eq("host_id", hostId);

      // Total tickets sold
      const { data: parties } = await supabase
        .from("parties")
        .select("tickets_sold")
        .eq("host_id", hostId);

      const totalSold =
        parties?.reduce((sum, p) => sum + (p.tickets_sold || 0), 0) || 0;

      // Reviews
      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("host_id", hostId);

      const avgRating =
        reviews && reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      // Followers
      const { count: followers } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", hostId);

      // Following
      const { count: following } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", hostId);

      setStats({
        partiesHosted: hosted || 0,
        totalTicketsSold: totalSold,
        averageRating: avgRating,
        totalReviews: reviews?.length || 0,
        followers: followers || 0,
        following: following || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchHostParties = async () => {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("host_id", hostId)
        .eq("is_published", true)
        .order("date", { ascending: true });

      if (error) throw error;

      setParties(data || []);
    } catch (error) {
      console.error("Error fetching host parties:", error);
    }
  };

  const checkIfFollowing = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", hostId)
        .single();

      setIsFollowing(!!data);
    } catch (error) {
      setIsFollowing(false);
    }
  };

  const handleFollow = async () => {
    if (!user) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setStats({
      ...stats,
      followers: wasFollowing ? stats.followers - 1 : stats.followers + 1,
    });

    try {
      if (wasFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", hostId);
      } else {
        await supabase.from("follows").insert({
          follower_id: user.id,
          following_id: hostId,
        });
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      setIsFollowing(wasFollowing);
      setStats({
        ...stats,
        followers: wasFollowing ? stats.followers + 1 : stats.followers - 1,
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const upcomingParties = parties.filter((p) => new Date(p.date) >= new Date());
  const pastParties = parties.filter((p) => new Date(p.date) < new Date());

  const renderPartyCard = ({ item }: { item: Party }) => (
    <TouchableOpacity
      className="mr-4"
      style={{ width: 180 }}
      onPress={() =>
        router.push({ pathname: "/party/[id]", params: { id: item.id } })
      }
    >
      <Image
        source={{ uri: item.flyer_url }}
        className="w-full rounded-2xl mb-2"
        style={{ aspectRatio: 4 / 5 }}
      />
      <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
        {item.title}
      </Text>
      <Text className="text-gray-400 text-xs mb-1">
        {formatDate(item.date)}
      </Text>
      <Text className="text-purple-400 font-semibold text-sm">
        ₦{item.ticket_price.toLocaleString()}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <Text className="text-white">Host not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#191022]"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="pt-12 px-6">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mb-6"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Profile Info */}
        <View className="items-center mb-6">
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              className="w-24 h-24 rounded-full mb-4"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-purple-600 items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">
                {profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View className="items-center mb-3">
            <Text className="text-white text-2xl font-bold">
              {profile.full_name || profile.username}
            </Text>
            <Text className="text-gray-400 text-base">@{profile.username}</Text>
          </View>

          {profile.is_host && (
            <View className="bg-purple-600/20 px-4 py-2 rounded-full mb-3">
              <Text className="text-purple-400 font-bold">VERIFIED HOST</Text>
            </View>
          )}

          {profile.bio && (
            <Text className="text-gray-300 text-center px-8 mb-4">
              {profile.bio}
            </Text>
          )}

          {/* Follow Button */}
          {user?.id !== hostId && (
            <TouchableOpacity
              onPress={handleFollow}
              className={`px-8 py-3 rounded-full ${
                isFollowing
                  ? "bg-white/10 border border-white/20"
                  : "bg-purple-600"
              }`}
            >
              <Text className="text-white font-semibold">
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        {profile.is_host ? (
          <>
            {/* Host Stats */}
            <View className="flex-row bg-white/5 rounded-2xl p-4 mb-4">
              <View className="flex-1 items-center border-r border-white/10">
                <Text className="text-white text-2xl font-bold">
                  {stats.partiesHosted}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Hosted</Text>
              </View>
              <View className="flex-1 items-center border-r border-white/10">
                <Text className="text-white text-2xl font-bold">
                  {stats.totalTicketsSold}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Tickets Sold</Text>
              </View>
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1">
                  <Text className="text-white text-2xl font-bold">
                    {stats.averageRating.toFixed(1)}
                  </Text>
                  <Ionicons name="star" size={16} color="#8B5CF6" />
                </View>
                <Text className="text-gray-400 text-xs mt-1">
                  {stats.totalReviews} Reviews
                </Text>
              </View>
            </View>

            {/* Secondary Stats */}
            <View className="flex-row bg-white/5 rounded-2xl p-4 mb-6">
              <View className="flex-1 items-center border-r border-white/10">
                <Text className="text-white text-xl font-bold">
                  {stats.followers}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Followers</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-white text-xl font-bold">
                  {stats.following}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Following</Text>
              </View>
            </View>
          </>
        ) : (
          /* Normal User Stats */
          <View className="flex-row bg-white/5 rounded-2xl p-4 mb-6">
            <View className="flex-1 items-center border-r border-white/10">
              <Text className="text-white text-xl font-bold">
                {stats.followers}
              </Text>
              <Text className="text-gray-400 text-xs mt-1">Followers</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-white text-xl font-bold">
                {stats.following}
              </Text>
              <Text className="text-gray-400 text-xs mt-1">Following</Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        {profile.is_host && (
          <>
            <View className="flex-row border-b border-white/10 mb-4">
              <TouchableOpacity
                onPress={() => setActiveTab("upcoming")}
                className={`flex-1 pb-3 ${
                  activeTab === "upcoming" ? "border-b-2 border-purple-600" : ""
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    activeTab === "upcoming" ? "text-white" : "text-gray-400"
                  }`}
                >
                  Upcoming ({upcomingParties.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab("past")}
                className={`flex-1 pb-3 ${
                  activeTab === "past" ? "border-b-2 border-purple-600" : ""
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    activeTab === "past" ? "text-white" : "text-gray-400"
                  }`}
                >
                  Past ({pastParties.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Parties Grid */}
            <FlatList
              data={activeTab === "upcoming" ? upcomingParties : pastParties}
              renderItem={renderPartyCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center py-12">
                  <Ionicons name="calendar-outline" size={48} color="#666" />
                  <Text className="text-gray-400 mt-3">
                    No {activeTab} parties
                  </Text>
                </View>
              }
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}
