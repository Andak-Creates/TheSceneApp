import { sendPush } from "@/lib/sendPush";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

export type SearchResultProfile = {
  type: "user" | "host";
  id: string; // user id OR host_profile id
  owner_id: string; // user id OR host_profile owner_id
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_verified?: boolean;
  initialIsFollowing: boolean;
};

interface ProfileCardProps {
  profile: SearchResultProfile;
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isFollowing, setIsFollowing] = useState(profile.initialIsFollowing);
  const [followLoading, setFollowLoading] = useState(false);

  const handlePress = () => {
    if (profile.type === "host") {
      router.push(`/host/${profile.id}`);
    } else {
      router.push(`/user/${profile.id}`);
    }
  };

  const handleFollow = async () => {
    if (!user || followLoading) return;
    setFollowLoading(true);

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing); // Optimistic UI

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

        // Get own profile for notification text
        const { data: followerProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        await supabase.from("notifications").insert({
          user_id: profile.owner_id,
          title: "👤 New follower",
          body: `${followerProfile?.username || "Someone"} started following ${
            profile.type === "host" ? profile.full_name : "you"
          }`,
          type: profile.type === "host" ? "host_follower" : "new_follower",
          data: {
            follower_id: user.id,
            ...(profile.type === "host" && { host_profile_id: profile.id }),
          },
          is_read: false,
        });

        sendPush(
          profile.owner_id,
          "👤 New follower",
          `${followerProfile?.username || "Someone"} started following ${
            profile.type === "host" ? profile.full_name : "you"
          }`,
          {
            type: profile.type === "host" ? "host_follower" : "new_follower",
            follower_id: user.id,
            ...(profile.type === "host" && { host_profile_id: profile.id }),
          }
        );
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      setIsFollowing(wasFollowing); // Revert on failure
    } finally {
      setFollowLoading(false);
    }
  };

  const isOwnProfile = user?.id === profile.owner_id;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      className="bg-white/5 border border-white/10 rounded-2xl p-4 mr-3 flex-row items-center w-64"
    >
      {/* Avatar */}
      {profile.avatar_url ? (
        <Image
          source={{ uri: profile.avatar_url }}
          className="w-12 h-12 rounded-full"
          contentFit="cover"
        />
      ) : (
        <View className="w-12 h-12 rounded-full bg-purple-600/30 items-center justify-center">
          <Text className="text-purple-400 font-bold text-lg">
            {(profile.full_name || profile.username).charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Info */}
      <View className="flex-1 ml-3 mr-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {profile.full_name || profile.username}
          </Text>
          {profile.is_verified && (
            <Ionicons name="checkmark-circle" size={12} color="#a855f7" />
          )}
        </View>

        <View className="flex-row items-center">
          {profile.type === "host" && (
            <View className="bg-purple-600/20 px-1.5 py-0.5 rounded mr-1">
              <Text className="text-purple-400 text-[10px] font-bold">HOST</Text>
            </View>
          )}
          <Text className="text-gray-400 text-xs flex-1" numberOfLines={1}>
            @{profile.username}
          </Text>
        </View>
      </View>

      {/* Follow / Right Action */}
      {!isOwnProfile && (
        <TouchableOpacity
          onPress={handleFollow}
          disabled={followLoading}
          className={`h-8 px-3 rounded-full items-center justify-center ${
            isFollowing ? "bg-white/10" : "bg-purple-600"
          }`}
        >
          {followLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-xs font-semibold">
              {isFollowing ? "Following" : "Follow"}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
