import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  const { profile } = useUserStore();
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
  }, [user, profile]);

  const fetchUserCity = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("user_preferences")
        .select("city")
        .eq("user_id", user.id)
        .single();

      if (data?.city) {
        setUserCity(data.city);
      }
    } catch (error) {
      console.log("No city found");
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
  const handleRefresh = () => {
    setRefreshing(true);
    fetchUserStats();
    if (profile?.is_host) {
      fetchHostedParties();
    }
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
        quality: 0.8,
        base64: true,
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
      const { error } = await supabase
        .from("profiles")
        .update({
          bio: editBio.trim() || null,
          full_name: editFullName.trim() || profile.username,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Update local state
      useUserStore.setState((s) => ({
        profile: {
          ...s.profile!,
          bio: editBio.trim() || null,
          full_name: editFullName.trim() || profile.username,
        },
      }));

      setEditMode(false);
      Alert.alert("Success", "Profile updated!");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        },
      },
    ]);
  };

  if (loading || !profile) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#191022]"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#8B5CF6"
          colors={["#8B5CF6"]}
        />
      }
    >
      <View className="pt-14 px-6">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-white text-2xl font-bold">Profile</Text>
          <View className="flex-row gap-3">
            {editMode && (
              <TouchableOpacity
                onPress={() => {
                  setEditMode(false);
                  setEditBio(profile.bio || "");
                  setEditFullName(profile.full_name || "");
                }}
              >
                <Text className="text-gray-400 font-semibold">Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleSignOut}>
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
              className="w-24 h-24 rounded-full self-center"
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

        {/* Location */}
        {userCity && !editMode && (
          <View className="flex-row items-center justify-center mt-2 mb-3">
            <Ionicons name="location-outline" size={16} color="#9ca3af" />
            <Text className="text-gray-400 text-sm ml-1">{userCity}</Text>
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

        <View className="flex-col mt-4 bg-white/5 rounded-2xl py-4">
          {/* Stats */}
          <View className="flex-row rounded-2xl py-3">
            {["Attended", "Followers", "Following"].map((label, i) => (
              <View
                key={label}
                className={`flex-1 items-center ${
                  i < 2 ? "border-r border-white/10" : ""
                }`}
              >
                <Text className="text-white text-xl font-bold">
                  {i === 0
                    ? stats.partiesAttended
                    : i === 1
                      ? stats.followers
                      : stats.following}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">{label}</Text>
              </View>
            ))}
          </View>

          {profile?.is_host && (
            <View className="flex-row  rounded-2xl py-3">
              <View className="flex-1 items-center border-r border-white/10">
                <Text className="text-white text-xl font-bold">
                  {stats.partiesHosted}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Hosted</Text>
              </View>
              <View className="flex-1 items-center border-r border-white/10">
                {/* ✅ NOW SHOWS CORRECT TIER-BASED COUNT */}
                <Text className="text-white text-xl font-bold">
                  {stats.totalTicketsSold}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Tickets Sold</Text>
              </View>
              <View className="flex-1 items-center">
                <Text className="text-white text-xl font-bold">
                  {stats.averageRating?.toFixed(1)}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">Avg Rating</Text>
              </View>
            </View>
          )}
        </View>

        {/* Edit/Save Button */}
        <View className="flex-row gap-3 mt-0">
          {editMode ? (
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={saving}
              className="flex-1 bg-purple-600 py-3 rounded-3xl items-center flex-row justify-center"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text className="text-white ml-2 font-semibold">
                    Save Changes
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View className="flex-row gap-3 flex-1">
              <TouchableOpacity
                onPress={() => setEditMode(true)}
                className="flex-1 bg-white/10 py-3 rounded-3xl items-center flex-row justify-center"
              >
                <FontAwesome6 name="pen" size={18} color="white" />
                <Text className="text-white ml-2 font-semibold">
                  Edit Profile
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Alert.alert("Share coming soon")}
                className="flex-1 bg-white/10 py-3 rounded-3xl items-center flex-row justify-center"
              >
                <FontAwesome6 name="share-nodes" size={18} color="white" />
                <Text className="text-white ml-2 font-semibold">Share</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Host Dashboard Button - Only shows if user is a host */}
        {profile.is_host && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: "../host-dashboard" })}
            className="bg-purple-600 rounded-2xl p-4 mb-0 flex-row items-center justify-between mt-4"
            style={{
              shadowColor: "#8B5CF6",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <View className="flex-row items-center">
              <Ionicons name="bar-chart" size={24} color="#fff" />
              <View className="ml-3">
                <Text className="text-white font-bold text-base">
                  Host Dashboard
                </Text>
                <Text className="text-purple-200 text-sm">
                  Manage parties & scan tickets
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.push("/my-tickets")}
          className="bg-purple-600/20 border border-purple-600/50 rounded-2xl p-4 mt-4 flex-row items-center justify-between"
        >
          <View className="flex-row items-center">
            <Ionicons name="ticket" size={24} color="#8B5CF6" />
            <View className="ml-3">
              <Text className="text-white font-bold text-base">My Tickets</Text>
              <Text className="text-gray-400 text-sm">
                View your purchased tickets
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        {/* Tabs */}
        <View className="flex-row mt-10 border-b border-white/10">
          {[
            ...(profile?.is_host ? ["hosted"] : []),
            "reposts",
            "upcoming",
            "past",
          ].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab as Tab)}
              className={`flex-1 pb-3 ${
                activeTab === tab ? "border-b-2 border-purple-600" : ""
              }`}
            >
              <Text
                className={`text-center font-semibold capitalize ${
                  activeTab === tab ? "text-white" : "text-gray-400"
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
        {activeTab === "hosted" && profile?.is_host ? (
          <View className="mt-4">
            {hostedParties.length > 0 ? (
              hostedParties.map((party) => (
                <View
                  key={party.id}
                  className="bg-white/5 rounded-2xl p-4 mb-3"
                >
                  <Text className="text-white font-bold text-lg mb-1">
                    {party.title}
                  </Text>
                  <Text className="text-gray-400 text-sm mb-1">
                    {party.date
                      ? new Date(party.date).toLocaleString()
                      : "🕒 Date TBA"}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {party.location
                      ? party.location + ", " + party.city
                      : "📍 Location TBA"}
                  </Text>
                </View>
              ))
            ) : (
              <View className="items-center py-14">
                <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-3">
                  <Ionicons name="calendar-outline" size={36} color="#666" />
                </View>
                <Text className="text-gray-400">No hosted parties yet</Text>
                <Text className="text-gray-600 text-sm mt-1">
                  Your hosted parties will appear here
                </Text>
              </View>
            )}
          </View>
        ) : activeTab === "reposts" ? (
          <View className="items-center py-14">
            <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-3">
              <Ionicons name="ticket-outline" size={36} color="#666" />
            </View>
            <Text className="text-gray-400">No reposts yet</Text>
            <Text className="text-gray-600 text-sm mt-1">
              Parties you repost will appear here
            </Text>
          </View>
        ) : activeTab === "upcoming" ? (
          <View className="items-center py-14">
            <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-3">
              <Ionicons name="calendar-outline" size={36} color="#666" />
            </View>
            <Text className="text-gray-400">No upcoming parties yet</Text>
            <Text className="text-gray-600 text-sm mt-1">
              Your upcoming events will show here
            </Text>
          </View>
        ) : (
          <View className="items-center py-14">
            <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-3">
              <Ionicons name="ticket-outline" size={36} color="#666" />
            </View>
            <Text className="text-gray-400">No past parties yet</Text>
            <Text className="text-gray-600 text-sm mt-1">
              Past events you attended
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
