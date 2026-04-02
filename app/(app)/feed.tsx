import AttendancePill from "@/components/AttendancePill";
import { useAudioStore } from "@/stores/audioStore";
import { useFeedStore, FeedParty } from "@/stores/feedStore";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import MediaGalleryViewer from "../../components/MediaGalleryViewer";
import { useUnreadNotifications } from "../../hooks/useUnreadNotifications";
import { getCurrencySymbol } from "../../lib/currency";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

const PartyCard = React.memo(({ 
  party, 
  user, 
  activePartyId, 
  isFeedActive, 
  updateParty 
}: { 
  party: FeedParty;
  user: any;
  activePartyId: string | null;
  isFeedActive: boolean;
  updateParty: (id: string, updates: Partial<FeedParty>) => void;
}) => {
  const router = useRouter();

  const handleLike = async () => {
    if (!user) return;
    const wasLiked = party.is_liked;
    
    updateParty(party.id, {
      is_liked: !wasLiked,
      likes_count: wasLiked ? party.likes_count - 1 : party.likes_count + 1,
    });

    try {
      if (wasLiked) {
        await supabase.from("party_likes").delete().eq("party_id", party.id).eq("user_id", user.id);
      } else {
        await supabase.from("party_likes").insert({ party_id: party.id, user_id: user.id });
      }
    } catch (error) {
      updateParty(party.id, {
        is_liked: wasLiked,
        likes_count: wasLiked ? party.likes_count + 1 : party.likes_count - 1,
      });
    }
  };

  const handleRepost = async () => {
    if (!user) return;
    const wasReposted = party.is_reposted;
    
    updateParty(party.id, {
      is_reposted: !wasReposted,
      reposts_count: (party.reposts_count || 0) + (wasReposted ? -1 : 1),
    });

    try {
      if (wasReposted) {
        await supabase.from("party_reposts").delete().eq("party_id", party.id).eq("user_id", user.id);
      } else {
        await supabase.from("party_reposts").insert({ party_id: party.id, user_id: user.id });
      }
    } catch (e) {
      updateParty(party.id, {
        is_reposted: wasReposted,
        reposts_count: (party.reposts_count || 0) + (wasReposted ? 1 : -1),
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    return new Date(dateString).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    return `${hours % 12 || 12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  const handleReportParty = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        target_type: "party",
        target_id: party.id,
        reason: "Flagged by user for review",
        status: "pending"
      });
      if (error) throw error;
      Alert.alert("Report Submitted");
    } catch (e) {
      Alert.alert("Error", "Failed to submit report.");
    }
  };

  const handleBlockHost = async () => {
    if (!user) return;
    Alert.alert("Block User", `Block ${party.host_profile?.name || "this host"}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: async () => {
          try {
            const { error } = await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: party.host_id });
            if (error) throw error;
            Alert.alert("User Blocked");
            // Would normally filter out from feed, handled broadly
          } catch (e: any) {
             Alert.alert(e.code === '23505' ? "Info" : "Error", e.code === '23505' ? "Already blocked" : "Could not block");
          }
      }}
    ]);
  };

  const handlePartyOptions = () => {
    if (!user) return;
    if (party.host_id === user.id) {
      Alert.alert("Options", "This is your party.");
      return;
    }
    Alert.alert("Party Options", "Please choose an action", [
      { text: "Report Party", style: "destructive", onPress: handleReportParty },
      { text: "Block Host", style: "destructive", onPress: handleBlockHost },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  return (
    <View className="pb-2 bg-[#150d1e] rounded-3xl overflow-hidden border border-white/5 shadow-xl">
      <TouchableOpacity
        className="flex-row items-center px-4 py-4"
        onPress={() => router.push({ pathname: "/host/[id]", params: { id: party.host_profile?.id ?? party.host_id } })}
      >
        {party.host_profile?.avatar_url ? (
          <Image
            source={{ uri: party.host_profile.avatar_url }}
            style={{ width: 40, height: 40, borderRadius: 48 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View className="w-11 h-11 rounded-full bg-purple-600 items-center justify-center border border-white/10">
            <Text className="text-white font-bold text-lg">{(party.host_profile?.name || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <View className="flex-row items-center gap-1">
            <Text className="text-white font-extrabold text-base tracking-tight">{party.host_profile?.name || "Unknown Brand"}</Text>
            {party.host_profile?.is_verified && <Ionicons name="checkmark-circle" size={16} color="#a855f7" />}
          </View>
          <Text className="text-gray-500 text-xs">{formatDate(party.created_at)}</Text>
        </View>
        {party.host?.is_host && (
          <View className="bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/20 mr-2">
            <Text className="text-purple-400 text-xs font-bold tracking-wider">HOST</Text>
          </View>
        )}
        <TouchableOpacity onPress={handlePartyOptions} className="p-3 -mr-2" hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
           <Ionicons name="ellipsis-horizontal" size={22} color="#a3a3a3" />
        </TouchableOpacity>
      </TouchableOpacity>

      <View className="px-4">
        <View className="rounded-2xl overflow-hidden bg-[#09030e] border border-white/5">
          {party.media && party.media.length > 0 ? (
            <MediaGalleryViewer
              media={party.media}
              isActive={isFeedActive && party.id === activePartyId}
              instanceId={party.id}
              onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })}
              aspectRatio={4 / 5}
            />
          ) : party.flyer_url ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })}>
              <Image
                source={{ uri: party.flyer_url }}
                style={{ width: "100%", aspectRatio: 4 / 5 }}
                contentFit="cover"
                transition={300}
              />
            </TouchableOpacity>
          ) : (
            <View className="w-full items-center justify-center" style={{ aspectRatio: 4 / 5 }}>
              <Ionicons name="image-outline" size={48} color="#333" />
            </View>
          )}
        </View>
      </View>

      <View className="flex-row items-center px-4 py-4 mt-1">
        <TouchableOpacity className="flex-row items-center mr-6" onPress={handleLike}>
          <Ionicons name={party.is_liked ? "heart" : "heart-outline"} size={28} color={party.is_liked ? "#ef4444" : "#a3a3a3"} />
          <Text className="text-gray-300 ml-1.5 font-medium text-base">{party.likes_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center mr-6" onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })}>
          <Ionicons name="chatbubble-outline" size={26} color="#a3a3a3" />
          <Text className="text-gray-300 ml-1.5 font-medium text-base">{party.comments_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center mr-4" onPress={handleRepost}>
          <Ionicons name={party.is_reposted ? "repeat" : "repeat-outline"} size={26} color={party.is_reposted ? "#a855f7" : "#a3a3a3"} />
          <Text className="text-gray-300 ml-1.5 font-medium text-base">{party.reposts_count || 0}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })} className="px-5 pb-4">
        <View className="flex-row items-center gap-2 mb-2">
          <AttendancePill ticketsSold={party.tickets_sold} />
        </View>
        <Text className="text-white text-xl font-extrabold mb-1.5 leading-tight">{party.title}</Text>
        {party.description && <Text className="text-gray-400 text-sm mb-4 leading-relaxed" numberOfLines={2}>{party.description}</Text>}
        <View className="flex-row items-center mb-2 bg-white/5 self-start px-3 py-1.5 rounded-full">
          <Ionicons name="calendar" size={14} color="#a855f7" />
          <Text className="text-gray-200 font-medium text-xs ml-1.5">
            {party.date_tba ? "Date TBA" : `${formatDate(party.date)} • ${formatTime(party.date)}`}
          </Text>
        </View>
        <View className="flex-row items-center mb-4 bg-white/5 self-start px-3 py-1.5 rounded-full">
          <Ionicons name="location" size={14} color="#a855f7" />
          <Text className="text-gray-200 font-medium text-xs ml-1.5">
            {party.location_tba ? "Location TBA" : `${party.location}, ${party.city}`}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {party.music_genres.slice(0, 3).map((genre) => (
            <View key={genre} className="bg-[#1e142e] border border-purple-500/20 px-3 py-1 rounded-full">
              <Text className="text-purple-300 font-medium text-xs">{genre}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          className="py-3.5 rounded-2xl items-center bg-white mt-1 shadow-lg shadow-white/10"
          activeOpacity={0.8}
          onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: "/party/[id]/tickets", params: { id: party.id } }); }}
        >
          <Text className="text-black font-extrabold text-base">
            {`Get Tickets • ${getCurrencySymbol(party.currency_code || "NGN")}${party.ticket_price?.toLocaleString() ?? "0"}`}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
});

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { unreadCount } = useUnreadNotifications();
  const [isFocused, setIsFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const {
    parties,
    isLoading,
    isRefreshing,
    hasMore,
    fetchParties,
    updateParty,
  } = useFeedStore();

  const [activePartyId, setActivePartyId] = useState<string | null>(null);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActivePartyId(viewableItems[0].item.id);
  }).current;

  useEffect(() => {
    if (user?.id) {
      fetchParties(user.id);
    }
  }, [user?.id]);

  const handleRefresh = useCallback(() => {
    if (user?.id) fetchParties(user.id, true);
  }, [user?.id]);

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore && user?.id) {
      fetchParties(user.id);
    }
  }, [isLoading, hasMore, user?.id]);

  const renderItem = useCallback(({ item }: { item: FeedParty }) => {
    return (
      <View className="px-4 mb-2">
        <PartyCard
          party={item}
          user={user}
          activePartyId={activePartyId}
          isFeedActive={isFocused}
          updateParty={updateParty}
        />
      </View>
    );
  }, [user, activePartyId, isFocused, updateParty]);

  if (isLoading && parties.length === 0) {
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
          <Text className="text-white text-3xl font-extrabold tracking-tight">Discover</Text>
          <Text className="text-gray-400 text-sm mt-1">Find your next experience</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.push("/settings/notifications")} className="bg-white/5 p-3 rounded-full border border-white/10 relative">
            <Ionicons name="notifications-outline" size={22} color="#a855f7" />
            {unreadCount > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center border-2 border-[#09030e] px-1">
                <Text className="text-white text-[10px] font-bold">{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(app)/search")} className="bg-white/5 p-3 rounded-full border border-white/10">
            <Ionicons name="search" size={22} color="#a855f7" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={parties}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#a855f7" />}
        ListFooterComponent={isLoading && parties.length > 0 ? <ActivityIndicator className="my-8" color="#a855f7" /> : null}
        ListEmptyComponent={
          <View className="items-center justify-center py-32">
            <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-6 border border-white/5">
              <Ionicons name="calendar-outline" size={32} color="#a855f7" />
            </View>
            <Text className="text-gray-200 text-xl font-bold mb-2">No parties near you yet</Text>
            <Text className="text-gray-500 text-center max-w-[80%]">
              We're just getting started in your area. Check back soon, or update your location in Settings.
            </Text>
          </View>
        }
      />
    </View>
  );
}
