import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
  name: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  owner_id: string;
  owner?: {
    username: string;
    is_host: boolean;
  };
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
  date: string | null;
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
  const hostProfileId = params.id as string; // this is host_profiles.id
  const { setFeedActive } = useAudioStore();

  useFocusEffect(
    useCallback(() => {
      setFeedActive(false);
      return () => {
        setFeedActive(true);
      };
    }, []),
  );

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

  // Step 1: fetch the host_profile record
  useEffect(() => {
    if (hostProfileId) {
      fetchHostProfile();
    }
  }, [hostProfileId]);

  // Step 2: once we have owner_id, fetch stats/parties/follow status
  useEffect(() => {
    if (profile?.owner_id) {
      fetchHostStats(profile.owner_id);
      fetchHostParties(profile.owner_id);
      checkIfFollowing(profile.owner_id);
    }
  }, [profile?.owner_id]);

  const fetchHostProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("host_profiles")
        .select(
          `
          *,
          owner:profiles!owner_id (
            username,
            is_host
          )
        `,
        )
        .eq("id", hostProfileId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error("Error fetching host profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHostStats = async (ownerId: string) => {
    try {
      // Parties hosted via host_profile_id
      const { count: hosted } = await supabase
        .from("parties")
        .select("*", { count: "exact", head: true })
        .eq("host_profile_id", hostProfileId);

      // Total tickets sold
      const { data: partiesData } = await supabase
        .from("parties")
        .select("tickets_sold")
        .eq("host_profile_id", hostProfileId);

      const totalSold =
        partiesData?.reduce((sum, p) => sum + (p.tickets_sold || 0), 0) || 0;

      // Reviews (host_id is the owner's user id)
      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("host_id", ownerId);

      const avgRating =
        reviews && reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      // Followers/following are on the owner's user profile
      const { count: followers } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", ownerId);

      const { count: following } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", ownerId);

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

  const fetchHostParties = async (ownerId: string) => {
    try {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("host_profile_id", hostProfileId)
        .eq("is_published", true)
        .order("date", { ascending: true });

      if (error) throw error;
      setParties(data || []);
    } catch (error) {
      console.error("Error fetching host parties:", error);
    }
  };

  const checkIfFollowing = async (ownerId: string) => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", ownerId)
        .single();

      setIsFollowing(!!data);
    } catch {
      setIsFollowing(false);
    }
  };

  const handleFollow = async () => {
    if (!user || !profile?.owner_id) return;

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setStats((prev) => ({
      ...prev,
      followers: wasFollowing ? prev.followers - 1 : prev.followers + 1,
    }));

    try {
      if (wasFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profile.owner_id);
      } else {
        await supabase.from("follows").insert({
          follower_id: user.id,
          following_id: profile.owner_id,
        });
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      setIsFollowing(wasFollowing);
      setStats((prev) => ({
        ...prev,
        followers: wasFollowing ? prev.followers + 1 : prev.followers - 1,
      }));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const upcomingParties = parties.filter((p) => {
    if (!p.date) return true; // date is null/TBA → treat as upcoming
    return new Date(p.date) >= new Date();
  });
  const pastParties = parties.filter((p) => {
    if (!p.date) return false; // date is null/TBA → exclude from past
    return new Date(p.date) < new Date();
  });

  const renderPartyCard = ({ item }: { item: Party }) => (
    <TouchableOpacity
      className="mr-4"
      style={{ width: 180 }}
      onPress={() =>
        router.push({ pathname: "/party/[id]", params: { id: item.id } })
      }
    >
      {item.flyer_url &&
      (item.flyer_url.startsWith("http") ||
        item.flyer_url.startsWith("https")) ? (
        <ExpoImage
          source={{ uri: item.flyer_url }}
          className="w-full rounded-2xl mb-2"
          style={{ aspectRatio: 4 / 5 }}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          className="w-full rounded-2xl mb-2 bg-gray-800 items-center justify-center"
          style={{ aspectRatio: 4 / 5 }}
        >
          <Ionicons name="image-outline" size={48} color="#444" />
        </View>
      )}
      <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
        {item.title}
      </Text>
      <Text className="text-gray-400 text-xs mb-1">
        {item.date ? formatDate(item.date) : "TBA"}
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

  // Is the current logged-in user the owner of this host profile?
  const isOwner = user?.id === profile.owner_id;

  return (
    <ScrollView
      className="flex-1 bg-[#191022]"
      showsVerticalScrollIndicator={false}
    >
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
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                marginBottom: 16,
              }}
              resizeMode="cover"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-purple-600 items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">
                {profile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View className="items-center mb-3">
            <Text className="text-white text-2xl font-bold">
              {profile.name}
            </Text>
            {profile.owner?.username && (
              <Text className="text-gray-400 text-base">
                @{profile.owner.username}
              </Text>
            )}
          </View>

          {profile.is_verified && (
            <View className="bg-purple-600/20 px-4 py-2 rounded-full mb-3">
              <Text className="text-purple-400 font-bold">VERIFIED HOST</Text>
            </View>
          )}

          {profile.bio && (
            <Text className="text-gray-300 text-center px-8 mb-4">
              {profile.bio}
            </Text>
          )}

          {/* Action Buttons */}
          {!isOwner ? (
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
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/host/earnings")}
              className="px-8 py-3 rounded-full bg-purple-600 flex-row items-center"
            >
              <Ionicons name="wallet-outline" size={20} color="#fff" />
              <Text className="text-white font-bold ml-2">
                Earnings Dashboard
              </Text>
            </TouchableOpacity>
          )}
        </View>

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

        {/* Followers/Following */}
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

        {/* Tabs */}
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
              <Text className="text-gray-400 mt-3">No {activeTab} parties</Text>
            </View>
          }
        />
      </View>
    </ScrollView>
  );
}
