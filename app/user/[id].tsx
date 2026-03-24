// app/user/[id].tsx
import { sendPush } from "@/lib/sendPush";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
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

interface UserProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface Stats {
  followers: number;
  following: number;
}

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string | null;
  city: string | null;
  ticket_price: number | null;
  currency_code: string;
}

type ActiveTab = "attended" | "liked";

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<Stats>({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("attended");
  const [attendedParties, setAttendedParties] = useState<Party[]>([]);
  const [likedParties, setLikedParties] = useState<Party[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProfile();
    }
  }, [id]);

  useEffect(() => {
    if (profile) {
      fetchParties(activeTab);
    }
  }, [activeTab, profile]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProfile(data);

      // Fetch stats and follow status in parallel
      const [followersRes, followingRes, followStatusRes] = await Promise.all([
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", id),
        user
          ? supabase
              .from("follows")
              .select("id")
              .eq("follower_id", user.id)
              .eq("following_id", id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      setStats({
        followers: followersRes.count || 0,
        following: followingRes.count || 0,
      });
      setIsFollowing(!!followStatusRes.data);
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchParties = async (tab: ActiveTab) => {
    setPartiesLoading(true);
    try {
      if (tab === "attended") {
        // Parties they've bought tickets for
        const { data } = await supabase
          .from("tickets")
          .select(`
            party:parties (
              id, title, flyer_url, date, city, ticket_price, currency_code
            )
          `)
          .eq("user_id", id)
          .eq("payment_status", "completed");

        const parties = (data || [])
          .map((t: any) => t.party)
          .filter(Boolean);
        setAttendedParties(parties);
      } else {
        // Parties they've liked
        const { data } = await supabase
          .from("party_likes")
          .select(`
            party:parties (
              id, title, flyer_url, date, city, ticket_price, currency_code
            )
          `)
          .eq("user_id", id);

        const parties = (data || [])
          .map((t: any) => t.party)
          .filter(Boolean);
        setLikedParties(parties);
      }
    } catch (error) {
      console.error("Error fetching parties:", error);
    } finally {
      setPartiesLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!user || followLoading) return;
    setFollowLoading(true);

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
          .eq("following_id", id);
      } else {
        await supabase.from("follows").insert({
          follower_id: user.id,
          following_id: id,
        });

        // Notify the user they have a new follower
        const { data: followerProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        await supabase.from("notifications").insert({
          user_id: id,
          title: "👤 New follower",
          body: `${followerProfile?.username || "Someone"} started following you`,
          type: "new_follower",
          data: { follower_id: user.id },
          is_read: false,
        });

        sendPush(
  id as string,
  "👤 New follower",
  `${followerProfile?.username || "Someone"} started following you`,
  { type: "new_follower", follower_id: user.id }
);
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      setIsFollowing(wasFollowing);
      setStats((prev) => ({
        ...prev,
        followers: wasFollowing ? prev.followers + 1 : prev.followers - 1,
      }));
    } finally {
      setFollowLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "TBA";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const renderPartyCard = ({ item }: { item: Party }) => (
    <TouchableOpacity
      className="mr-4"
      style={{ width: 160 }}
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
          <Ionicons name="image-outline" size={40} color="#444" />
        </View>
      )}
      <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
        {item.title}
      </Text>
      <Text className="text-gray-400 text-xs">
        {formatDate(item.date)} {item.city ? `· ${item.city}` : ""}
      </Text>
    </TouchableOpacity>
  );

  const currentParties = activeTab === "attended" ? attendedParties : likedParties;
  const isOwnProfile = user?.id === id;

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
        <Text className="text-white">User not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#191022]"
      showsVerticalScrollIndicator={false}
    >
      <View className="pt-12 px-6">
        {/* Back */}
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
              style={{ width: 96, height: 96, borderRadius: 48, marginBottom: 16 }}
              resizeMode="cover"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-purple-600 items-center justify-center mb-4">
              <Text className="text-white text-3xl font-bold">
                {profile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text className="text-white text-2xl font-bold mb-1">
            {profile.full_name || profile.username}
          </Text>
          <Text className="text-gray-400 text-base mb-3">
            @{profile.username}
          </Text>

          {profile.bio && (
            <Text className="text-gray-300 text-center px-8 mb-4">
              {profile.bio}
            </Text>
          )}

          {/* Follow Button */}
          {!isOwnProfile && user && (
            <TouchableOpacity
              onPress={handleFollow}
              disabled={followLoading}
              className={`px-8 py-3 rounded-full ${
                isFollowing
                  ? "bg-white/10 border border-white/20"
                  : "bg-purple-600"
              }`}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-semibold">
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
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
            onPress={() => setActiveTab("attended")}
            className={`flex-1 pb-3 ${
              activeTab === "attended" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "attended" ? "text-white" : "text-gray-400"
              }`}
            >
              Attended
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("liked")}
            className={`flex-1 pb-3 ${
              activeTab === "liked" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "liked" ? "text-white" : "text-gray-400"
              }`}
            >
              Liked
            </Text>
          </TouchableOpacity>
        </View>

        {/* Party List */}
        {partiesLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#8B5CF6" />
          </View>
        ) : currentParties.length > 0 ? (
          <FlatList
            data={currentParties}
            renderItem={renderPartyCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        ) : (
          <View className="py-12 items-center">
            <Ionicons name="calendar-outline" size={48} color="#666" />
            <Text className="text-gray-400 mt-3">
              No {activeTab === "attended" ? "attended" : "liked"} parties yet
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}