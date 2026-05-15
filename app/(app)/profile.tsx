import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import PartyCard from "../../components/PartyCard";
import { detectUserLocation } from "../../lib/location";
import { supabase } from "../../lib/supabase";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { queryKeys } from "../../lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { useUserStore } from "../../stores/userStore";

interface Stats {
  partiesAttended: number;
  following: number;
  followers: number;
  partiesHosted?: number;
  totalTicketsSold?: number;
  averageRating?: number;
  totalReviews?: number;
}

type Tab = "hosted" | "reposts" | "upcoming" | "past" | "favorites";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { profile, fetchProfile } = useUserStore();
  const queryClient = useQueryClient();

  // UI-only state (not fetched data)
  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("reposts");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [userCity, setUserCity] = useState("");

  // Edit form states
  const [editBio, setEditBio] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [isHostAdmin, setIsHostAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ---------------------------------------------------------------------------
  // Pure async functions — return data, do NOT call setState
  // ---------------------------------------------------------------------------
  async function fetchTabData() {
    if (!user) return null;
    const now = new Date();
    let hostedAll: any[] = [];
    if (profile?.is_host) {
      const { data: hosted } = await supabase
        .from("parties")
        .select(`*, party_media(thumbnail_url, media_type, is_primary)`)
        .eq("host_id", user.id)
        .order("date", { ascending: false });
      hostedAll = (hosted || []).map((p: any) => {
        const mediaRows: any[] = p.party_media || [];
        const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
        return { ...p, thumbnail_url: primaryMedia?.media_type === "video" ? primaryMedia?.thumbnail_url ?? null : null };
      });
    }
    const { data: repostData } = await supabase
      .from("party_reposts")
      .select(`party:parties(*, party_media(thumbnail_url, media_type, is_primary))`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const reposts = (repostData || []).map((r: any) => r.party).filter(Boolean).map((p: any) => {
      const mediaRows: any[] = p.party_media || [];
      const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
      return { ...p, thumbnail_url: primaryMedia?.media_type === "video" ? primaryMedia?.thumbnail_url ?? null : null };
    });
    const { data: ticketData } = await supabase
      .from("tickets")
      .select(`party:parties(*, party_media(thumbnail_url, media_type, is_primary))`)
      .eq("user_id", user.id)
      .eq("payment_status", "completed");
    const ticketParties = (ticketData || []).map((t: any) => t.party).filter(Boolean).map((p: any) => {
      const mediaRows: any[] = p.party_media || [];
      const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
      return { ...p, thumbnail_url: primaryMedia?.media_type === "video" ? primaryMedia?.thumbnail_url ?? null : null };
    });
    const hostedFuture = hostedAll.filter((p) => p.date_tba || !p.date || new Date(p.date) >= now);
    const allUpcoming = [...hostedFuture, ...ticketParties.filter((p: any) => p.date_tba || !p.date || new Date(p.date) >= now)];
    const seen = new Set<string>();
    const deduped = allUpcoming.filter((p: any) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    const { data: bookmarkData } = await supabase
      .from("party_bookmarks")
      .select(`party:parties(*, party_media(thumbnail_url, media_type, is_primary))`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const saved = (bookmarkData || []).map((b: any) => b.party).filter(Boolean).map((p: any) => {
      const mediaRows: any[] = p.party_media || [];
      const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
      return { ...p, thumbnail_url: primaryMedia?.media_type === "video" ? primaryMedia?.thumbnail_url ?? null : null };
    });
    const allParties = [...hostedAll, ...ticketParties, ...reposts, ...saved];
    const uniqueIds = [...new Set(allParties.map((p: any) => p.id).filter(Boolean))];
    let viewsMap: Record<string, number> = {};
    if (uniqueIds.length > 0) {
      const { data: viewRows } = await supabase.from("party_view_counts").select("party_id, view_count").in("party_id", uniqueIds);
      for (const row of viewRows || []) viewsMap[row.party_id] = Number(row.view_count) || 0;
    }
    const addViews = (arr: any[]) => arr.map((p) => ({ ...p, views_count: viewsMap[p.id] || 0 }));
    const { data: userReviews } = await supabase.from("reviews").select("party_id").eq("reviewer_id", user.id);
    const reviewedPartyIds = new Set((userReviews || []).map((r: any) => r.party_id));
    const ticketPast = ticketParties.filter((p: any) => !p.date_tba && p.date && new Date(p.date) < now);
    const hostedPast = hostedAll.filter((p: any) => !p.date_tba && p.date && new Date(p.date) < now);
    const allPast = [...ticketPast, ...hostedPast];
    const pastSeen = new Set<string>();
    const dedupedPast = allPast.filter((p: any) => { if (pastSeen.has(p.id)) return false; pastSeen.add(p.id); return true; });
    const ticketPastIds = new Set(ticketPast.map(p => p.id));
    const pastWithReviewState = dedupedPast.map(p => ({ ...p, can_review: ticketPastIds.has(p.id) && !reviewedPartyIds.has(p.id) }));
    return {
      hostedParties: addViews(hostedAll),
      repostedParties: addViews(reposts),
      upcomingParties: addViews(deduped),
      pastParties: addViews(pastWithReviewState),
      savedParties: addViews(saved),
    };
  }


  // ---------------------------------------------------------------------------
  // useQuery hooks — auto-fetch on mount, cache for 2 minutes
  // These reference fetchTabData (above) and fetchStatsData (below).
  // async function declarations are hoisted, so this ordering is safe.
  // ---------------------------------------------------------------------------
  const statsQuery = useQuery({
    queryKey: queryKeys.profileStats(user?.id ?? ""),
    queryFn: fetchStatsData,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const tabsQuery = useQuery({
    queryKey: queryKeys.profileTabs(user?.id ?? ""),
    queryFn: fetchTabData,
    enabled: !!user && !!profile,
    staleTime: 2 * 60 * 1000,
  });

  const stats: Stats = statsQuery.data ?? { partiesAttended: 0, following: 0, followers: 0 };
  const loading = statsQuery.isLoading || tabsQuery.isLoading;
  const hostedParties: any[] = tabsQuery.data?.hostedParties ?? [];
  const repostedParties: any[] = tabsQuery.data?.repostedParties ?? [];
  const upcomingParties: any[] = tabsQuery.data?.upcomingParties ?? [];
  const pastParties: any[] = tabsQuery.data?.pastParties ?? [];
  const savedParties: any[] = tabsQuery.data?.savedParties ?? [];

  useEffect(() => {
    if (user && profile) {
      setEditBio(profile.bio || "");
      setEditFullName(profile.full_name || "");
    }
    const checkHostAdmin = async () => {
      if (!user) return;
      const { data } = await supabase.from("host_admins").select("id").eq("user_id", user.id).limit(1);
      setIsHostAdmin(!!data && data.length > 0);
    };
    checkHostAdmin();
  }, [user, profile]);

  // Silent re-fetch every time the screen comes into focus
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      if (!user) return;
      statsQuery.refetch();
      tabsQuery.refetch();
    }, [user])
  );

  // Supabase Realtime — invalidates cache so useQuery auto-refetches
  useEffect(() => {
    if (!user) return;
    const invalidateStats = () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.profileStats(user.id) });
    const invalidateTabs = () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.profileTabs(user.id) });

    const channel = supabase
      .channel(`profile-realtime-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${user.id}` }, invalidateStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${user.id}` }, invalidateStats)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_bookmarks", filter: `user_id=eq.${user.id}` }, invalidateTabs)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_reposts", filter: `user_id=eq.${user.id}` }, invalidateTabs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const fetchUserCity = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("user_preferences")
        .select("city, state")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setUserCity(data.city || "");
        setEditCity(data.city || "");
        setEditState(data.state || "");
      }
    } catch (error) {
      console.log("No city found");
    }
  };

  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");

  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    try {
      const location = await detectUserLocation();
      if (location) {
        setEditCity(location.city || "");
        setEditState(location.state || "");
      } else {
        Alert.alert("Error", "Could not detect location. Please check permissions.");
      }
    } finally {
      setDetectingLocation(false);
    }
  };

  // Pure stats fetcher — returns data for useQuery (defined above)
  async function fetchStatsData(): Promise<Stats> {
    if (!user) return { partiesAttended: 0, following: 0, followers: 0 };
    const { count: attended } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("payment_status", "completed");
    const { count: following } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id);
    const { count: followers } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
    const baseStats = { partiesAttended: attended || 0, following: following || 0, followers: followers || 0 };
    if (profile?.is_host) {
      const { count: hosted } = await supabase.from("parties").select("*", { count: "exact", head: true }).eq("host_id", user.id);
      const { data: parties } = await supabase.from("parties").select("id").eq("host_id", user.id);
      let totalTickets = 0;
      if (parties) {
        for (const party of parties) {
          const { data: tiers } = await supabase.from("ticket_tiers").select("quantity_sold").eq("party_id", party.id).eq("is_active", true);
          totalTickets += tiers?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
        }
      }
      const { data: reviews } = await supabase.from("reviews").select("rating").eq("host_id", user.id);
      const avgRating = reviews && reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      return { ...baseStats, partiesHosted: hosted || 0, totalTicketsSold: totalTickets, averageRating: avgRating, totalReviews: reviews?.length || 0 };
    }
    return baseStats;
  }

  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await fetchProfile(user.id);
    await Promise.all([statsQuery.refetch(), tabsQuery.refetch()]);
    setRefreshing(false);
  };

  const handleAvatarChange = async () => {
    if (!user) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please grant photo library access");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || !result.assets[0].uri) return;

      setUploadingAvatar(true);

      const imageUri = result.assets[0].uri;
      const folder = `avatars/${user.id}`;

      console.log("📤 Uploading to Cloudinary...");

      const uploadResult = await uploadToCloudinary(imageUri, "image", folder);
      const publicUrl = uploadResult.url;

      console.log("🔗 Public URL:", publicUrl);

      // Update profile in database
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) {
        console.error("❌ Database update error:", updateError);
        throw updateError;
      }

      // Update local store
      useUserStore.setState((state) => ({
        profile: state.profile
          ? {
              ...state.profile,
              avatar_url: publicUrl,
            }
          : null,
      }));

      console.log("🎉 Avatar updated successfully!");
      Alert.alert("Success!", "Profile picture updated");
    } catch (error: any) {
      console.error("❌ Avatar error:", error);
      Alert.alert("Error", error.message || "Failed to update avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    setSaving(true);
    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: editFullName.trim() || profile.username,
          bio: editBio.trim() || null,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Update local store for profile
      useUserStore.setState((s: any) => ({
        profile: {
          ...s.profile!,
          full_name: editFullName.trim() || profile.username,
          bio: editBio.trim() || null,
        },
      }));

      // Update preferences (location)
      const { error: prefsError } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          city: editCity.trim() || null,
          state: editState.trim() || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (prefsError) throw prefsError;

      setUserCity(editCity.trim());
      setEditMode(false);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };



  if (loading || !profile) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#09030e]"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#a855f7"
          colors={["#a855f7"]}
        />
      }
    >
      <View className="pt-16 px-6">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-white text-3xl font-extrabold tracking-tight">Profile</Text>
          <View className="flex-row gap-4">
            {editMode && (
              <TouchableOpacity
                onPress={() => {
                  setEditMode(false);
                  setEditBio(profile.bio || "");
                  setEditFullName(profile.full_name || "");
                }}
              >
                <Text className="text-gray-400 font-semibold text-base mt-1">Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => router.push("../settings")} className="bg-white/10 p-2 rounded-full">
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Avatar */}
        <TouchableOpacity
          onPress={handleAvatarChange}
          activeOpacity={0.8}
          className="w-[100px] mx-auto mb-4"
        >
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 96, height: 96, borderRadius: 48, alignSelf: "center" }}
              contentFit="cover"
            />
          ) : (
            <View className="w-24 h-24 rounded-full bg-purple-600 self-center items-center justify-center">
              <Text className="text-white text-3xl font-bold">
                {profile.username[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View className="absolute bottom-1 right-1 bg-black/70 p-2 rounded-full">
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={14} color="#fff" />
            )}
          </View>
        </TouchableOpacity>

        {/* Name & Username */}
        {editMode ? (
          <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-1 ml-1">Full Name</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-center"
              placeholder="Your name"
              placeholderTextColor="#666"
              value={editFullName}
              onChangeText={setEditFullName}
            />
          </View>
        ) : (
          <View>
            <Text className="text-white text-xl font-bold text-center">
              {profile.full_name || profile.username}
            </Text>
            <Text className="text-gray-400 text-base mb-3 text-center">
              @{profile.username.toLowerCase().replace(/\s+/g, '-')}
            </Text>
          </View>
        )}

        {/* Location Display */}
        {userCity && !editMode && (
          <View className="flex-row items-center justify-center mt-2 mb-3">
            <Ionicons name="location-outline" size={16} color="#9ca3af" />
            <Text className="text-gray-400 text-sm ml-1">{userCity}</Text>
          </View>
        )}

        {/* Location Editing */}
        {editMode && (
          <View className="mb-4">
            <View className="flex-row justify-between items-center mb-1 ml-1">
              <Text className="text-gray-400 text-xs">Location</Text>
              <TouchableOpacity 
                onPress={handleDetectLocation}
                disabled={detectingLocation}
                className="flex-row items-center"
              >
                {detectingLocation ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : (
                  <>
                    <Ionicons name="location" size={12} color="#8B5CF6" />
                    <Text className="text-purple-500 text-xs ml-1">Auto-detect</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-2">
              <TextInput
                className="flex-[2] bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="City"
                placeholderTextColor="#666"
                value={editCity}
                onChangeText={setEditCity}
              />
              <TextInput
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="State"
                placeholderTextColor="#666"
                value={editState}
                onChangeText={setEditState}
              />
            </View>
          </View>
        )}

        {/* Bio */}
        {editMode ? (
          <View className="mt-3 mb-4">
            <Text className="text-gray-400 text-xs mb-1 ml-1">Bio</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
              placeholder="Tell people about yourself..."
              placeholderTextColor="#666"
              value={editBio}
              onChangeText={setEditBio}
              multiline
              maxLength={150}
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text className="text-gray-500 text-xs text-right mt-1">
              {editBio.length}/150
            </Text>
          </View>
        ) : (
          profile.bio && (
            <Text className="text-gray-300 text-sm text-center px-6 mt-3 mb-4">
              {profile.bio}
            </Text>
          )
        )}

        <View className="flex-col mt-6 bg-[#150d1e] rounded-3xl py-5 shadow-2xl border border-white/5 mx-1">
          {/* Stats */}
          <View className="flex-row py-2">
            {["Attended", "Followers", "Following"].map((label, i) => (
              <View
                key={label}
                className={`flex-1 items-center ${
                  i < 2 ? "border-r border-white/5" : ""
                }`}
              >
                <Text className="text-white text-2xl font-extrabold">
                  {i === 0
                    ? stats.partiesAttended
                    : i === 1
                      ? stats.followers
                      : stats.following}
                </Text>
                <Text className="text-gray-500 text-xs font-medium uppercase tracking-wider mt-1.5">{label}</Text>
              </View>
            ))}
          </View>

          {profile?.is_host && (
            <View className="flex-row pt-5 mt-4 border-t border-white/5 mx-4">
              <View className="flex-1 items-center border-r border-white/5">
                <Text className="text-white text-xl font-bold">
                  {stats.partiesHosted}
                </Text>
                <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mt-1">Hosted</Text>
              </View>
              <View className="flex-1 items-center border-r border-white/5">
                {/* ✅ NOW SHOWS CORRECT TIER-BASED COUNT */}
                <Text className="text-white text-xl font-bold">
                  {stats.totalTicketsSold}
                </Text>
                <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mt-1">Tickets Sold</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-white text-xl font-bold">
                  {stats.averageRating?.toFixed(1)}
                </Text>
                <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mt-1">Avg Rating</Text>
              </View>
            </View>
          )}
        </View>

        {/* Edit/Save Button */}
        <View className="flex-row gap-4 mt-6 px-1">
          {editMode ? (
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={saving}
              className="flex-1 bg-white py-3.5 rounded-2xl items-center flex-row justify-center shadow-lg shadow-white/10"
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark" size={20} color="black" />
                  <Text className="text-black ml-2 font-extrabold text-base">
                    Save Changes
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View className="flex-row gap-4 flex-1">
              <TouchableOpacity
                onPress={() => setEditMode(true)}
                className="flex-1 bg-[#150d1e] border border-white/10 py-3.5 rounded-2xl items-center flex-row justify-center"
                activeOpacity={0.8}
              >
                <FontAwesome6 name="pen" size={16} color="white" />
                <Text className="text-white ml-2.5 font-bold text-base">
                  Edit Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Alert.alert("Share coming soon")}
                className="flex-1 bg-[#150d1e] border border-white/10 py-3.5 rounded-2xl items-center flex-row justify-center"
                activeOpacity={0.8}
              >
                <FontAwesome6 name="share-nodes" size={18} color="white" />
                <Text className="text-white ml-2.5 font-bold text-base">Share</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Referral Code Display */}
        {!editMode && profile.referral_code && (
           <View className="flex-row items-center justify-between bg-purple-600/20 border border-purple-500/30 rounded-2xl p-4 mt-6 mx-1">
             <View>
               <Text className="text-purple-400 text-[10px] font-bold uppercase tracking-widest mb-1">Your Referral Code</Text>
               <Text className="text-white text-xl font-mono font-extrabold tracking-wider">{profile.referral_code}</Text>
             </View>
             <TouchableOpacity 
               onPress={() => Alert.alert(
                 "Share Your Code!", 
                 `Tell your friends to use code ${profile.referral_code} when signing up!`
               )}
               className="bg-purple-600 px-5 py-2.5 rounded-xl"
             >
               <Text className="text-white text-xs font-bold">Share</Text>
             </TouchableOpacity>
           </View>
        )}

        {/* Host Dashboard Button - Only shows if user is a host */}
        {profile.is_host && (
          <View className="gap-3 mt-6">
            <TouchableOpacity
              onPress={() => router.push({ pathname: "../host-dashboard" })}
              className="bg-purple-600/90 rounded-2xl p-4 flex-row items-center justify-between shadow-lg shadow-purple-600/20"
              activeOpacity={0.9}
            >
              <View className="flex-row items-center">
                <View className="bg-white/20 p-2.5 rounded-full">
                  <Ionicons name="bar-chart" size={24} color="#fff" />
                </View>
                <View className="ml-3.5">
                  <Text className="text-white font-extrabold text-base">
                    Host Dashboard
                  </Text>
                  <Text className="text-purple-100/80 text-sm mt-0.5">
                    Manage parties & scan tickets
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Scanner & Dashboard button for non-host users who are host admins */}
        {!profile.is_host && isHostAdmin && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "../host-dashboard" })}
            className="bg-purple-600/90 rounded-2xl p-4 flex-row items-center justify-between shadow-lg shadow-purple-600/20 mt-6"
            activeOpacity={0.9}
          >
            <View className="flex-row items-center">
              <View className="bg-white/20 p-2.5 rounded-full">
                <Ionicons name="scan" size={24} color="#fff" />
              </View>
              <View className="ml-3.5">
                <Text className="text-white font-extrabold text-base">
                  Scanner & Dashboard
                </Text>
                <Text className="text-purple-100/80 text-sm mt-0.5">
                  Scan tickets & track parties
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.push("/my-tickets")}
          className="bg-[#150d1e] border border-white/5 rounded-2xl p-4 mt-3 flex-row items-center justify-between shadow-xl"
          activeOpacity={0.8}
        >
          <View className="flex-row items-center">
            <View className="bg-purple-500/10 p-2.5 rounded-full border border-purple-500/20">
                <Ionicons name="ticket" size={24} color="#a855f7" />
            </View>
            <View className="ml-3.5">
              <Text className="text-white font-extrabold text-base">My Tickets</Text>
              <Text className="text-gray-400 text-sm mt-0.5">
                View your purchased tickets
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>



        {/* Tabs */}
        <View className="flex-row mt-10 border-b border-white/10 pb-0">
          {[
            ...(profile?.is_host ? ["hosted"] : []),
            "reposts",
            "upcoming",
            "past",
            "favorites",
          ].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab as Tab)}
              className={`flex-1 pb-4 ${
                activeTab === tab ? "border-b-2 border-white" : ""
              }`}
            >
              <Text
                className={`text-center font-bold text-[10px] uppercase tracking-wide ${
                  activeTab === tab ? "text-white" : "text-gray-500"
                }`}
              >
                {tab === "hosted" ? "Hosted"
                  : tab === "favorites" ? "Saved"
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View className="pb-32 mt-6">
          {(() => {
            // Shared mini-card grid renderer
            const renderGrid = (parties: any[], emptyIcon: any, emptyTitle: string, emptySubtitle: string, showReview = false) => {
              if (parties.length === 0) {
                return (
                  <View className="items-center py-16">
                    <View className="w-16 h-16 rounded-full bg-[#150d1e] border border-white/5 items-center justify-center mb-4">
                      <Ionicons name={emptyIcon} size={28} color="#a855f7" />
                    </View>
                    <Text className="text-gray-200 font-bold text-lg">{emptyTitle}</Text>
                    <Text className="text-gray-500 text-sm mt-1.5 text-center">{emptySubtitle}</Text>
                  </View>
                );
              }
              const rows: any[][] = [];
              for (let i = 0; i < parties.length; i += 2) rows.push(parties.slice(i, i + 2));
              return (
                <View className="gap-3">
                  {rows.map((row, ri) => (
                    <View key={ri} className="flex-row gap-3">
                      {row.map((party: any) => (
                        <PartyCard 
                          key={party.id} 
                          party={party} 
                          onReviewPress={showReview && party.can_review ? () => {
                            router.push({ pathname: "/party/[id]/review", params: { id: party.id } });
                          } : undefined}
                        />
                      ))}
                      {row.length === 1 && <View style={{ flex: 1 }} />}
                    </View>
                  ))}
                </View>
              );
            };

            if (activeTab === "hosted" && profile?.is_host) {
              return renderGrid(hostedParties, "calendar-outline", "No hosted parties yet", "Your hosted parties will appear here");
            }
            if (activeTab === "reposts") {
              return renderGrid(repostedParties, "repeat", "No reposts yet", "Parties you repost will appear here");
            }
            if (activeTab === "upcoming") {
              return renderGrid(upcomingParties, "calendar", "No upcoming parties", "Parties you have tickets to will show here");
            }
            if (activeTab === "past") {
              return renderGrid(pastParties, "ticket", "No past parties", "Past events you attended will appear here", true);
            }
            if (activeTab === "favorites") {
              return (
                <>
                  <View className="flex-row items-center mb-4 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3">
                    <Ionicons name="lock-closed-outline" size={14} color="#a855f7" />
                    <Text className="text-purple-300 text-xs ml-2 font-medium">Only you can see your saved parties</Text>
                  </View>
                  {renderGrid(savedParties, "bookmark-outline", "No saved parties yet", "Bookmark a party to save it here for later")}
                </>
              );
            }
            return null;
          })()}
        </View>
      </View>
    </ScrollView>
  );
}
