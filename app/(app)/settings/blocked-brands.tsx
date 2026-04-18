import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface BlockedBrand {
  id: string; // blocked_host_profiles row id
  blocked_host_profile_id: string;
  created_at: string;
  host_profile: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
}

export default function BlockedBrandsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [blockedBrands, setBlockedBrands] = useState<BlockedBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    fetchBlockedBrands();
  }, [user?.id]);

  const fetchBlockedBrands = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("blocked_host_profiles")
        .select(
          `
          id,
          blocked_host_profile_id,
          created_at,
          host_profile:host_profiles!blocked_host_profile_id (
            id,
            name,
            avatar_url,
            is_verified
          )
        `
        )
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBlockedBrands((data as any) || []);
    } catch (error) {
      console.error("Error fetching blocked brands:", error);
      Alert.alert("Error", "Could not load blocked brands.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (brand: BlockedBrand) => {
    const brandName = brand.host_profile?.name || "this brand";
    Alert.alert(
      "Unblock Brand",
      `Unblock "${brandName}"? Their events will appear in your feed again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            setUnblockingId(brand.id);
            try {
              const { error } = await supabase
                .from("blocked_host_profiles")
                .delete()
                .eq("id", brand.id)
                .eq("blocker_id", user!.id);

              if (error) throw error;

              setBlockedBrands((prev) => prev.filter((b) => b.id !== brand.id));
            } catch (err) {
              console.error("Unblock error:", err);
              Alert.alert("Error", "Could not unblock brand. Please try again.");
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-[#09030e]">
      {/* Header */}
      <View className="pt-16 pb-6 px-6 border-b border-white/5 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 bg-white/5 rounded-full"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text className="text-white text-2xl font-bold">Blocked Brands</Text>
          <Text className="text-gray-500 text-sm mt-0.5">
            Manage brands you've blocked
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      ) : blockedBrands.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-5 border border-white/5">
            <Ionicons name="shield-checkmark-outline" size={36} color="#a855f7" />
          </View>
          <Text className="text-white text-xl font-bold mb-2 text-center">
            No Blocked Brands
          </Text>
          <Text className="text-gray-500 text-center leading-relaxed">
            You haven't blocked any brands yet. When you block a brand, only
            that brand's events will be hidden — not events from other brands
            run by the same person.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6 pt-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3 ml-1">
            {blockedBrands.length} blocked{" "}
            {blockedBrands.length === 1 ? "brand" : "brands"}
          </Text>

          <View className="bg-[#150d1e] rounded-3xl border border-white/5 overflow-hidden">
            {blockedBrands.map((brand, index) => (
              <View
                key={brand.id}
                className={`flex-row items-center px-4 py-4 ${
                  index < blockedBrands.length - 1
                    ? "border-b border-white/5"
                    : ""
                }`}
              >
                {/* Avatar */}
                {brand.host_profile?.avatar_url ? (
                  <Image
                    source={{ uri: brand.host_profile.avatar_url }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="w-12 h-12 rounded-full bg-purple-600/30 items-center justify-center border border-purple-500/20">
                    <Text className="text-purple-300 font-bold text-lg">
                      {(brand.host_profile?.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                {/* Brand Info */}
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-white font-semibold text-base" numberOfLines={1}>
                      {brand.host_profile?.name || "Unknown Brand"}
                    </Text>
                    {brand.host_profile?.is_verified && (
                      <Ionicons name="checkmark-circle" size={14} color="#a855f7" />
                    )}
                  </View>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    Blocked{" "}
                    {new Date(brand.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </View>

                {/* Unblock Button */}
                <TouchableOpacity
                  onPress={() => handleUnblock(brand)}
                  disabled={unblockingId === brand.id}
                  className="ml-3 px-4 py-2 rounded-full bg-white/10 border border-white/10 flex-row items-center"
                  activeOpacity={0.7}
                >
                  {unblockingId === brand.id ? (
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
        </ScrollView>
      )}
    </View>
  );
}
