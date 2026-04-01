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
import PartyCard from "../../components/PartyCard";
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
  thumbnail_url?: string | null;
  date: string | null;
  city: string | null;
  ticket_price: number | null;
  currency_code: string;
  date_tba?: boolean;
  views_count?: number;
}

type ActiveTab = "reposts" | "upcoming" | "past";

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<Stats>({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("reposts");
  const [repostedParties, setRepostedParties] = useState<Party[]>([]);
  const [upcomingParties, setUpcomingParties] = useState<Party[]>([]);
  const [pastParties, setPastParties] = useState<Party[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProfile();
    }
  }, [id]);

  useEffect(() => {
    if (profile) {
      fetchTabData();
    }
  }, [profile]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url, bio")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProfile(data);

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

  const fetchTabData = async () => {
    setPartiesLoading(true);
    const now = new Date();

    try {
      const [repostsRes, ticketsRes] = await Promise.all([
        supabase
          .from("party_reposts")
          .select(`party:parties(id, title, flyer_url, date, city, ticket_price, currency_code, date_tba, party_media(thumbnail_url, media_type, is_primary))`)
          .eq("user_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tickets")
          .select(`party:parties(id, title, flyer_url, date, city, ticket_price, currency_code, date_tba, party_media(thumbnail_url, media_type, is_primary))`)
          .eq("user_id", id)
          .eq("payment_status", "completed"),
      ]);

      const extractThumb = (p: any): Party => {
        const mediaRows: any[] = p.party_media || [];
        const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
        return {
          ...p,
          thumbnail_url: primaryMedia?.media_type === "video" ? primaryMedia?.thumbnail_url ?? null : null,
        };
      };

      const reposts: Party[] = (repostsRes.data || []).map((r: any) => r.party).filter(Boolean).map(extractThumb);
      const tickets: Party[] = (ticketsRes.data || []).map((t: any) => t.party).filter(Boolean).map(extractThumb);
      const upcoming = tickets.filter((p) => p.date_tba || !p.date || new Date(p.date) >= now);
      const past = tickets.filter((p) => !p.date_tba && !!p.date && new Date(p.date) < now);

      // Fetch view counts in one batch for all unique party ids
      const allParties = [...reposts, ...tickets];
      const allIds = [...new Set(allParties.map((p) => p.id))];

      let viewsMap: Record<string, number> = {};
      if (allIds.length > 0) {
        const { data: viewRows } = await supabase
          .from("party_views")
          .select("party_id")
          .in("party_id", allIds);
        for (const row of viewRows || []) {
          viewsMap[row.party_id] = (viewsMap[row.party_id] || 0) + 1;
        }
      }

      const addViews = (arr: Party[]) => arr.map((p) => ({ ...p, views_count: viewsMap[p.id] || 0 }));

      setRepostedParties(addViews(reposts));
      setUpcomingParties(addViews(upcoming));
      setPastParties(addViews(past));
    } catch (error) {
      console.error("Error fetching tab data:", error);
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


  const renderPartyCard = ({ item }: { item: Party }) => (
    <View className="mr-3" style={{ width: 165 }}>
      <PartyCard party={item} />
    </View>
  );

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: "reposts", label: "Reposts" },
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
  ];

  const getActiveList = (): Party[] => {
    switch (activeTab) {
      case "reposts": return repostedParties;
      case "upcoming": return upcomingParties;
      case "past": return pastParties;
    }
  };

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
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 pb-3 ${
                activeTab === tab.key ? "border-b-2 border-purple-600" : ""
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  activeTab === tab.key ? "text-white" : "text-gray-400"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Party List */}
        <View className="pb-12">
          {partiesLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="small" color="#8B5CF6" />
            </View>
          ) : getActiveList().length > 0 ? (
            <FlatList
              data={getActiveList()}
              renderItem={renderPartyCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              scrollEnabled={true}
            />
          ) : (
            <View className="py-12 items-center">
              <Ionicons name="calendar-outline" size={44} color="#333" />
              <Text className="text-gray-500 mt-3 font-medium">
                No {activeTab} parties yet
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}