import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush } from "../../lib/sendPush";
import { useAuthStore } from "../../stores/authStore";

interface Admin {
  id: string;
  user_id: string;
  role: string;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export default function HostProfileAdminsScreen() {
  const { user } = useAuthStore();
  const { hostProfileId } = useLocalSearchParams();
  
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUsername, setSearchUsername] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [hostProfileName, setHostProfileName] = useState("");

  useEffect(() => {
    fetchAdmins();
    // Fetch the host profile name for use in notifications
    const fetchProfileName = async () => {
      if (!hostProfileId) return;
      const { data } = await supabase
        .from("host_profiles")
        .select("name")
        .eq("id", hostProfileId)
        .single();
      if (data?.name) setHostProfileName(data.name);
    };
    fetchProfileName();
  }, [hostProfileId]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchUsername.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url")
          .ilike("username", `${searchUsername}%`)
          .limit(5);
        if (error) throw error;
        setSearchResults(data || []);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearching(false);
      }
    };

    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchUsername]);

  const fetchAdmins = async () => {
    if (!hostProfileId) return;
    try {
      const { data, error } = await supabase
        .from("host_admins")
        .select(`
          id,
          user_id,
          role,
          profile:profiles!user_id(username, full_name, avatar_url)
        `)
        .eq("host_profile_id", hostProfileId);

      if (error) throw error;
      setAdmins(data as any[]);
    } catch (err) {
      console.error("Error fetching admins:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (userId: string, username: string) => {
    setAdding(true);
    try {
      // Add as admin
      const { error: adminError } = await supabase
        .from("host_admins")
        .insert({
          host_profile_id: hostProfileId,
          user_id: userId,
          role: "admin",
        });

      if (adminError) {
        if (adminError.code === "23505") {
          Alert.alert("Error", "User is already an admin of this profile");
        } else {
          throw adminError;
        }
        return;
      }

      // Notify the newly added admin via push notification
      const profileLabel = hostProfileName || "a host profile";
      sendPush(
        userId,
        "You've been added as an admin 🎉",
        `You can now scan tickets and manage parties for ${profileLabel}.`,
        { type: "host_admin_added", host_profile_id: hostProfileId }
      );

      // Also insert an in-app notification so it shows in their notifications list
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "You've been added as an admin 🎉",
        body: `You can now scan tickets and manage parties for ${profileLabel}.`,
        type: "general",
        data: { type: "host_admin_added", host_profile_id: hostProfileId },
        is_read: false,
      });

      setSearchUsername("");
      setSearchResults([]);
      Alert.alert("Success", `Added @${username} as admin`);
      fetchAdmins();
    } catch (err: any) {
      console.error("Error adding admin:", err);
      Alert.alert("Error", err.message || "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAdmin = async (adminId: string) => {
    Alert.alert(
      "Remove Admin",
      "Are you sure you want to remove this admin? They will lose access to the host dashboard.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("host_admins")
                .delete()
                .eq("id", adminId);
              if (error) throw error;
              fetchAdmins();
            } catch (err) {
              Alert.alert("Error", "Failed to remove admin");
            }
          },
        },
      ]
    );
  };

  const renderAdminItem = ({ item }: { item: Admin }) => (
    <View className="flex-row items-center justify-between bg-white/5 p-4 rounded-2xl mb-3 border border-white/10">
      <View className="flex-row items-center flex-1">
  {item.profile.avatar_url ? (
    <Image
      source={{ uri: item.profile.avatar_url }}
      style={{ width: 40, height: 40, borderRadius: 20 }}
    />
  ) : (
    <View className="w-10 h-10 rounded-full bg-purple-600 items-center justify-center">
      <Text className="text-white font-bold">{item.profile.username[0].toUpperCase()}</Text>
    </View>
  )}
        <View className="ml-3 flex-1">
          <Text className="text-white font-bold">{item.profile.full_name || item.profile.username}</Text>
          <Text className="text-gray-400 text-xs">@{item.profile.username}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => handleRemoveAdmin(item.id)}
        className="p-2"
      >
        <Ionicons name="trash-outline" size={20} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#09030e]"
    >
      <View className="pt-16 px-6 pb-4 bg-[#09030e] border-b border-white/5">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 bg-white/5 rounded-full items-center justify-center border border-white/10"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-4">Manage Admins</Text>
        </View>
      </View>

      <View className="flex-1 px-6 pt-6">
        <View className="mb-8 z-50">
          <Text className="text-gray-400 text-sm font-semibold mb-3 font-medium uppercase tracking-wider">Add New Admin</Text>
          <View className="relative">
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
              placeholder="Start typing username..."
              placeholderTextColor="#666"
              value={searchUsername}
              onChangeText={setSearchUsername}
              autoCapitalize="none"
            />
            {searching && (
              <View className="absolute right-3 top-3">
                <ActivityIndicator size="small" color="#a855f7" />
              </View>
            )}
            
           {searchResults.length > 0 && (
  <View className="absolute top-14 left-0 right-0 bg-[#150d1e] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50">
    {searchResults.map((result) => (
      <TouchableOpacity
        key={result.id}
        onPress={() => handleAddAdmin(result.id, result.username)}
        className="flex-row items-center p-4 border-b border-white/5 active:bg-white/5"
      >
        {result.avatar_url ? (
          <Image
            source={{ uri: result.avatar_url }}
            style={{ width: 32, height: 32, borderRadius: 16 }}
          />
        ) : (
          <View className="w-8 h-8 rounded-full bg-purple-600/20 items-center justify-center border border-purple-500/30">
            <Text className="text-purple-400 font-bold text-xs">
              {result.username[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View className="ml-3">
          <Text className="text-white font-medium">{result.username}</Text>
          {result.full_name && (
            <Text className="text-gray-400 text-[10px]">{result.full_name}</Text>
          )}
        </View>
      </TouchableOpacity>
    ))}
  </View>
)}
          </View>
        </View>

        <Text className="text-gray-400 text-sm font-semibold mb-4 font-medium uppercase tracking-wider">Current Admins</Text>
        {loading ? (
          <ActivityIndicator color="#a855f7" size="large" className="mt-10" />
        ) : (
          <FlatList
            data={admins}
            keyExtractor={(item) => item.id}
            renderItem={renderAdminItem}
            ListEmptyComponent={
              <View className="items-center py-10">
                <Text className="text-gray-500">No admins yet</Text>
              </View>
            }
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
