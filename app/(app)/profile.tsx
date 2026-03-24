import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { detectUserLocation } from "../../lib/location";
import { supabase } from "../../lib/supabase";
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

type Tab = "hosted" | "reposts" | "upcoming" | "past";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { profile, fetchProfile } = useUserStore();
  const [hostedParties, setHostedParties] = useState<any[]>([]);

  const [stats, setStats] = useState<Stats>({
    partiesAttended: 0,
    following: 0,
    followers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // ✅ ADD REFRESHING STATE
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

  const fetchHostedParties = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("host_id", user.id)
        .order("date", { ascending: false });

      if (error) throw error;

      setHostedParties(data || []);
    } catch (e) {
      console.error("Failed to fetch hosted parties:", e);
    }
  };

  useEffect(() => {
    if (user && profile) {
      fetchUserStats();
      fetchUserCity();
      setEditBio(profile.bio || "");
      setEditFullName(profile.full_name || "");
    }

    if (profile?.is_host) {
      fetchHostedParties();
    }

    // Check if user is a host-level admin (even without is_host flag)
    const checkHostAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("host_admins")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      setIsHostAdmin(!!data && data.length > 0);
    };
    checkHostAdmin();
  }, [user, profile]);

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

  const fetchUserStats = async () => {
    if (!user) return;

    try {
      const { count: attended } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("payment_status", "completed");

      const { count: following } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", user.id);

      const { count: followers } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id);

      const baseStats = {
        partiesAttended: attended || 0,
        following: following || 0,
        followers: followers || 0,
      };

      if (profile?.is_host) {
        const { count: hosted } = await supabase
          .from("parties")
          .select("*", { count: "exact", head: true })
          .eq("host_id", user.id);

        // ✅ FETCH TIER DATA TO CALCULATE TICKETS SOLD
        const { data: parties } = await supabase
          .from("parties")
          .select("id")
          .eq("host_id", user.id);

        let totalTickets = 0;
        if (parties) {
          for (const party of parties) {
            const { data: tiers } = await supabase
              .from("ticket_tiers")
              .select("quantity_sold")
              .eq("party_id", party.id)
              .eq("is_active", true);

            const partySold =
              tiers?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
            totalTickets += partySold;
          }
        }

        const { data: reviews } = await supabase
          .from("reviews")
          .select("rating")
          .eq("host_id", user.id);

        const avgRating =
          reviews && reviews.length
            ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
            : 0;

        setStats({
          ...baseStats,
          partiesHosted: hosted || 0,
          totalTicketsSold: totalTickets, // ✅ USE TIER-BASED COUNT
          averageRating: avgRating,
          totalReviews: reviews?.length || 0,
        });
      } else {
        setStats(baseStats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false); // ✅ STOP REFRESHING
    }
  };

  // ✅ ADD REFRESH HANDLER
  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    // Fetching the profile will update the userStore,
    // which triggers the useEffect and subsequent data fetches.
    await fetchProfile(user.id);
    fetchUserStats();
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
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || !result.assets[0].base64) return;

      setUploadingAvatar(true);

      const image = result.assets[0];
      const fileExt = image.uri.split(".").pop() || "jpg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log("📤 Uploading to:", filePath);

      // Delete old avatar if exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split("/avatars/")[1];
        if (oldPath) {
          console.log("🗑️ Deleting old avatar:", oldPath);
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // Upload new avatar
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, decode(image.base64!), {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error("❌ Upload error:", uploadError);
        throw uploadError;
      }

      console.log("✅ Upload successful!");

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

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
            <RNImage
              source={{ uri: profile.avatar_url }}
              style={{ width: 96, height: 96, borderRadius: 48, alignSelf: "center" }}
              resizeMode="cover"
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
            <Text className="text-gray-400 text-center">
              @{profile.username}
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
          ].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab as Tab)}
              className={`flex-1 pb-4 ${
                activeTab === tab ? "border-b-2 border-white" : ""
              }`}
            >
              <Text
                className={`text-center font-bold capitalize ${
                  activeTab === tab ? "text-white" : "text-gray-500"
                }`}
              >
                {tab === "hosted"
                  ? "Hosted"
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Empty State */}
        <View className="pb-32">
        {activeTab === "hosted" && profile?.is_host ? (
          <View className="mt-6">
            {hostedParties.length > 0 ? (
              hostedParties.map((party) => (
                <View
                  key={party.id}
                  className="bg-[#150d1e] rounded-2xl p-5 mb-3 border border-white/5"
                >
                  <Text className="text-white font-bold text-lg mb-1.5">
                    {party.title}
                  </Text>
                  <Text className="text-gray-400 text-sm mb-1.5 font-medium">
                    <Ionicons name="time-outline" size={14} color="#9ca3af" />{" "}
                    {party.date
                      ? new Date(party.date).toLocaleString()
                      : "Date TBA"}
                  </Text>
                  <Text className="text-gray-400 text-sm font-medium">
                    <Ionicons name="location-outline" size={14} color="#9ca3af" />{" "}
                    {party.location
                      ? party.location + ", " + party.city
                      : "Location TBA"}
                  </Text>
                </View>
              ))
            ) : (
              <View className="items-center py-16">
                <View className="w-16 h-16 rounded-full bg-[#150d1e] border border-white/5 items-center justify-center mb-4">
                  <Ionicons name="calendar-outline" size={28} color="#a855f7" />
                </View>
                <Text className="text-gray-200 font-bold text-lg">No hosted parties yet</Text>
                <Text className="text-gray-500 text-sm mt-1.5">
                  Your hosted parties will appear here
                </Text>
              </View>
            )}
          </View>
        ) : activeTab === "reposts" ? (
          <View className="items-center py-16 mt-6">
            <View className="w-16 h-16 rounded-full bg-[#150d1e] border border-white/5 items-center justify-center mb-4">
              <Ionicons name="repeat" size={28} color="#a855f7" />
            </View>
            <Text className="text-gray-200 font-bold text-lg">No reposts yet</Text>
            <Text className="text-gray-500 text-sm mt-1.5">
              Parties you repost will appear here
            </Text>
          </View>
        ) : activeTab === "upcoming" ? (
          <View className="items-center py-16 mt-6">
            <View className="w-16 h-16 rounded-full bg-[#150d1e] border border-white/5 items-center justify-center mb-4">
              <Ionicons name="calendar" size={28} color="#a855f7" />
            </View>
            <Text className="text-gray-200 font-bold text-lg">No upcoming parties</Text>
            <Text className="text-gray-500 text-sm mt-1.5">
              Your upcoming events will show here
            </Text>
          </View>
        ) : (
          <View className="items-center py-16 mt-6">
            <View className="w-16 h-16 rounded-full bg-[#150d1e] border border-white/5 items-center justify-center mb-4">
              <Ionicons name="ticket" size={28} color="#a855f7" />
            </View>
            <Text className="text-gray-200 font-bold text-lg">No past parties</Text>
            <Text className="text-gray-500 text-sm mt-1.5">
              Past events you attended
            </Text>
          </View>
        )}
        </View>
      </View>
    </ScrollView>
  );
}
