import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

// A blocked user entry (from `blocked_users` table)
interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

// A blocked brand entry (from `blocked_host_profiles` table)
interface BlockedBrand {
  id: string;
  blocked_host_profile_id: string;
  created_at: string;
  host_profile: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedBrands, setBlockedBrands] = useState<BlockedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Reload every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [user?.id])
  );

  const fetchAll = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Step 1a: fetch blocked user rows
      const { data: buRows, error: buErr } = await supabase
        .from("blocked_users")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (buErr) throw buErr;

      // Step 1b: fetch profiles for those blocked IDs (blocked_id = profile.id since both = auth.users.id)
      const blockedIds = (buRows || []).map((r: any) => r.blocked_id);
      let profilesMap: Record<string, any> = {};
      if (blockedIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .in("id", blockedIds);
        for (const p of profileRows || []) profilesMap[p.id] = p;
      }

      const mergedUsers: BlockedUser[] = (buRows || []).map((r: any) => ({
        id: r.id,
        blocked_id: r.blocked_id,
        created_at: r.created_at,
        profile: profilesMap[r.blocked_id] || null,
      }));

      // Step 2: blocked brands (direct FK to host_profiles — one query works fine)
      const { data: bbRows, error: bbErr } = await supabase
        .from("blocked_host_profiles")
        .select(
          `id, blocked_host_profile_id, created_at,
           host_profile:host_profiles!blocked_host_profile_id (id, name, avatar_url, is_verified)`
        )
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (bbErr) throw bbErr;

      setBlockedUsers(mergedUsers);
      setBlockedBrands((bbRows as any) || []);
    } catch (error) {
      console.error("Error fetching blocked list:", error);
      Alert.alert("Error", "Could not load blocked users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUnblockUser = (entry: BlockedUser) => {
    const name =
      entry.profile?.full_name || entry.profile?.username || "this user";
    Alert.alert(
      "Unblock User",
      `Unblock @${entry.profile?.username || name}? Their comments and profile will be visible again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(entry.id);
            try {
              const { error } = await supabase
                .from("blocked_users")
                .delete()
                .eq("id", entry.id)
                .eq("blocker_id", user!.id);
              if (error) throw error;
              setBlockedUsers((prev) => prev.filter((u) => u.id !== entry.id));
            } catch (err) {
              console.error("Unblock user error:", err);
              Alert.alert("Error", "Could not unblock user. Please try again.");
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  const handleUnblockBrand = (entry: BlockedBrand) => {
    const name = entry.host_profile?.name || "this brand";
    Alert.alert(
      "Unblock Brand",
      `Unblock "${name}"? Their events will appear in your feed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(entry.id);
            try {
              const { error } = await supabase
                .from("blocked_host_profiles")
                .delete()
                .eq("id", entry.id)
                .eq("blocker_id", user!.id);
              if (error) throw error;
              setBlockedBrands((prev) =>
                prev.filter((b) => b.id !== entry.id)
              );
            } catch (err) {
              console.error("Unblock brand error:", err);
              Alert.alert(
                "Error",
                "Could not unblock brand. Please try again."
              );
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const isEmpty = blockedUsers.length === 0 && blockedBrands.length === 0;
  const totalCount = blockedUsers.length + blockedBrands.length;

  return (
    <View className="flex-1 bg-[#09030e]">
      {/* Header */}
      <View className="pt-16 pb-6 px-6 border-b border-white/5 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.push("/(app)/settings")}
          className="mr-4 p-2 bg-white/5 rounded-full"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-2xl font-bold">Blocked Users</Text>
          <Text className="text-gray-500 text-sm mt-0.5">
            Manage who you've blocked
          </Text>
        </View>
        {/* Refresh button */}
        <TouchableOpacity
          onPress={() => fetchAll(true)}
          className="p-2 bg-white/5 rounded-full"
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#a855f7" />
          ) : (
            <Ionicons name="refresh" size={20} color="#a855f7" />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 48,
            flexGrow: isEmpty ? 1 : undefined,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchAll(true)}
              tintColor="#a855f7"
              colors={["#a855f7"]}
            />
          }
        >
          {isEmpty ? (
            /* ── Empty State ── */
            <View className="flex-1 items-center justify-center py-24">
              <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-5 border border-white/5">
                <Ionicons
                  name="shield-checkmark-outline"
                  size={36}
                  color="#a855f7"
                />
              </View>
              <Text className="text-white text-xl font-bold mb-2 text-center">
                No Blocked Users
              </Text>
              <Text className="text-gray-500 text-center leading-relaxed max-w-[80%]">
                You haven't blocked anyone yet. You can block users from
                comments, or block a brand from any event listing.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-4 ml-1">
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
              </Text>

              {/* ── Blocked Accounts (Users) ── */}
              {blockedUsers.length > 0 && (
                <View className="mb-6">
                  <Text className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2 ml-1">
                    Blocked accounts
                  </Text>
                  <Text className="text-gray-600 text-xs mb-3 ml-1 leading-relaxed">
                    Their comments are hidden. Their brand events are unaffected.
                  </Text>
                  <View className="bg-[#150d1e] rounded-3xl border border-white/5 overflow-hidden">
                    {blockedUsers.map((entry, index) => (
                      <View
                        key={entry.id}
                        className={`flex-row items-center px-4 py-4 ${
                          index < blockedUsers.length - 1
                            ? "border-b border-white/5"
                            : ""
                        }`}
                      >
                        {/* Avatar */}
                        {entry.profile?.avatar_url ? (
                          <Image
                            source={{ uri: entry.profile.avatar_url }}
                            style={{ width: 48, height: 48, borderRadius: 24 }}
                            contentFit="cover"
                          />
                        ) : (
                          <View className="w-12 h-12 rounded-full bg-white/10 items-center justify-center border border-white/10">
                            <Text className="text-white font-bold text-lg">
                              {(
                                entry.profile?.username ||
                                entry.profile?.full_name ||
                                "?"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Info */}
                        <View className="flex-1 ml-3">
                          <Text
                            className="text-white font-semibold text-base"
                            numberOfLines={1}
                          >
                            {entry.profile?.full_name ||
                              entry.profile?.username ||
                              "Unknown User"}
                          </Text>
                          <Text className="text-gray-500 text-xs mt-0.5">
                            @{entry.profile?.username || "–"} · Blocked{" "}
                            {formatDate(entry.created_at)}
                          </Text>
                        </View>

                        {/* Unblock */}
                        <TouchableOpacity
                          onPress={() => handleUnblockUser(entry)}
                          disabled={unblockingId === entry.id}
                          className="ml-3 px-4 py-2 rounded-full bg-white/10 border border-white/10"
                          activeOpacity={0.7}
                        >
                          {unblockingId === entry.id ? (
                            <ActivityIndicator size="small" color="#a855f7" />
                          ) : (
                            <Text className="text-gray-200 font-semibold text-sm">
                              Unblock
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* ── Blocked Brands ── */}
              {blockedBrands.length > 0 && (
                <View>
                  <Text className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2 ml-1">
                    Blocked brands
                  </Text>
                  <Text className="text-gray-600 text-xs mb-3 ml-1 leading-relaxed">
                    Their events are hidden. Other brands they run are unaffected.
                  </Text>
                  <View className="bg-[#150d1e] rounded-3xl border border-white/5 overflow-hidden">
                    {blockedBrands.map((entry, index) => (
                      <View
                        key={entry.id}
                        className={`flex-row items-center px-4 py-4 ${
                          index < blockedBrands.length - 1
                            ? "border-b border-white/5"
                            : ""
                        }`}
                      >
                        {/* Avatar */}
                        {entry.host_profile?.avatar_url ? (
                          <Image
                            source={{ uri: entry.host_profile.avatar_url }}
                            style={{ width: 48, height: 48, borderRadius: 24 }}
                            contentFit="cover"
                          />
                        ) : (
                          <View className="w-12 h-12 rounded-full bg-purple-600/30 items-center justify-center border border-purple-500/20">
                            <Text className="text-purple-300 font-bold text-lg">
                              {(entry.host_profile?.name || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </Text>
                          </View>
                        )}

                        {/* Info */}
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center gap-1.5">
                            <Text
                              className="text-white font-semibold text-base"
                              numberOfLines={1}
                            >
                              {entry.host_profile?.name || "Unknown Brand"}
                            </Text>
                            {entry.host_profile?.is_verified && (
                              <Ionicons
                                name="checkmark-circle"
                                size={14}
                                color="#a855f7"
                              />
                            )}
                          </View>
                          <Text className="text-gray-500 text-xs mt-0.5">
                            Brand · Blocked {formatDate(entry.created_at)}
                          </Text>
                        </View>

                        {/* Unblock */}
                        <TouchableOpacity
                          onPress={() => handleUnblockBrand(entry)}
                          disabled={unblockingId === entry.id}
                          className="ml-3 px-4 py-2 rounded-full bg-white/10 border border-white/10"
                          activeOpacity={0.7}
                        >
                          {unblockingId === entry.id ? (
                            <ActivityIndicator size="small" color="#a855f7" />
                          ) : (
                            <Text className="text-gray-200 font-semibold text-sm">
                              Unblock
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
