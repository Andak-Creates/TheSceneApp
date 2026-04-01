import { sendPush } from "@/lib/sendPush";
import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import PartyCard from "../../components/PartyCard";
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
  thumbnail_url?: string | null;
  date: string | null;
  end_date: string | null;
  location: string;
  city: string;
  ticket_price: number;
  tickets_sold: number;
  ticket_quantity: number;
  currency_code?: string;
  date_tba?: boolean;
  views_count?: number;
}

type TabType = "all" | "upcoming" | "past";

export default function HostProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const hostProfileId = params.id as string;
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
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");

  useEffect(() => {
    if (hostProfileId) {
      fetchHostProfile();
    }
  }, [hostProfileId]);

  useEffect(() => {
    if (profile?.owner_id) {
      fetchHostStats(profile.owner_id);
      fetchHostParties();
      checkIfFollowing(profile.owner_id);
    }
  }, [profile?.owner_id]);

  const fetchHostProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("host_profiles")
        .select(
          `*, owner:profiles!owner_id (username, is_host)`,
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
      const { count: hosted } = await supabase
        .from("parties")
        .select("*", { count: "exact", head: true })
        .eq("host_profile_id", hostProfileId);

      const { data: partiesData } = await supabase
        .from("parties")
        .select("tickets_sold")
        .eq("host_profile_id", hostProfileId);

      const totalSold =
        partiesData?.reduce((sum, p) => sum + (p.tickets_sold || 0), 0) || 0;

      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("host_id", ownerId);

      const avgRating =
        reviews && reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

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

  const fetchHostParties = async () => {
    try {
      const { data, error } = await supabase
        .from("parties")
        .select(`*, party_media(thumbnail_url, media_type, is_primary)`)
        .eq("host_profile_id", hostProfileId)
        .eq("is_published", true)
        .order("date", { ascending: true });

      if (error) throw error;
      const parties = data || [];

      if (parties.length > 0) {
        // Fetch view counts in one batched query
        const partyIds = parties.map((p) => p.id);
        const { data: viewRows } = await supabase
          .from("party_views")
          .select("party_id")
          .in("party_id", partyIds);

        const viewsMap: Record<string, number> = {};
        for (const row of viewRows || []) {
          viewsMap[row.party_id] = (viewsMap[row.party_id] || 0) + 1;
        }

        setAllParties(
          parties.map((p: any) => {
            const mediaRows: any[] = p.party_media || [];
            const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
            return {
              ...p,
              views_count: viewsMap[p.id] || 0,
              thumbnail_url:
                primaryMedia?.media_type === "video"
                  ? primaryMedia?.thumbnail_url ?? null
                  : null,
            };
          })
        );
      } else {
        setAllParties([]);
      }
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

        const { data: followerProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        await supabase.from("notifications").insert({
          user_id: profile.owner_id,
          title: "👤 New follower",
          body: `${followerProfile?.username || "Someone"} started following ${profile.name}`,
          type: "host_follower",
          data: { follower_id: user.id, host_profile_id: hostProfileId },
          is_read: false,
        });

        sendPush(
          profile.owner_id,
          "👤 New follower",
          `${followerProfile?.username || "Someone"} started following ${profile.name}`,
          { type: "host_follower", follower_id: user.id, host_profile_id: hostProfileId }
        );
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


  const now = new Date();

  const upcomingParties = allParties.filter((p) => {
    if (p.date_tba) return true;
    if (!p.date) return true;
    return new Date(p.date) >= now;
  });

  const pastParties = allParties.filter((p) => {
    if (p.date_tba || !p.date) return false;
    return new Date(p.date) < now;
  });

  const tabs: { key: TabType; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "all", label: "All" },
  ];

  const getActiveParties = (): Party[] => {
    switch (activeTab) {
      case "upcoming": return upcomingParties;
      case "past": return pastParties;
      case "all": return allParties;
    }
  };

  const renderPartyGrid = (parties: Party[]) => {
    if (parties.length === 0) {
      return (
        <View className="py-14 items-center">
          <Ionicons name="calendar-outline" size={44} color="#333" />
          <Text className="text-gray-500 mt-3 font-medium">
            No {activeTab} parties
          </Text>
        </View>
      );
    }

    // Group into pairs for 2-column grid
    const rows: Party[][] = [];
    for (let i = 0; i < parties.length; i += 2) {
      rows.push(parties.slice(i, i + 2));
    }

    return (
      <View className="gap-3">
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-3">
            {row.map((party) => (
              <PartyCard key={party.id} party={party} />
            ))}
            {/* Fill last row if odd number */}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>
    );
  };

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

  const isOwner = user?.id === profile.owner_id;

  return (
    <ScrollView
      className="flex-1 bg-[#191022]"
      showsVerticalScrollIndicator={false}
    >
      <View className="pt-12 px-6 pb-12">
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
                {profile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View className="items-center mb-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-white text-2xl font-bold">{profile.name}</Text>
              {profile.is_verified && (
                <Ionicons name="checkmark-circle" size={15} color="#a855f7" />
              )}
            </View>
            {profile.owner?.username && (
              <Text className="text-gray-400 text-base">
                @{profile.owner.username}
              </Text>
            )}
          </View>

          {profile.bio && (
            <Text className="text-gray-300 text-center px-8 mb-4">
              {profile.bio}
            </Text>
          )}

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
              <Text className="text-white font-bold ml-2">Earnings Dashboard</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Host Stats */}
        <View className="flex-row bg-white/5 rounded-2xl p-4 mb-4">
          <View className="flex-1 items-center border-r border-white/10">
            <Text className="text-white text-2xl font-bold">{stats.partiesHosted}</Text>
            <Text className="text-gray-400 text-xs mt-1">Hosted</Text>
          </View>
          <View className="flex-1 items-center border-r border-white/10">
            <Text className="text-white text-2xl font-bold">{stats.totalTicketsSold}</Text>
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
            <Text className="text-white text-xl font-bold">{stats.followers}</Text>
            <Text className="text-gray-400 text-xs mt-1">Followers</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-white text-xl font-bold">{stats.following}</Text>
            <Text className="text-gray-400 text-xs mt-1">Following</Text>
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-white/10 mb-5">
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
                  activeTab === tab.key ? "text-white" : "text-gray-500"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Party Grid */}
        {renderPartyGrid(getActiveParties())}
      </View>
    </ScrollView>
  );
}
