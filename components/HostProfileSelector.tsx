import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
  Image as RNImage,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface HostProfile {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface HostProfileSelectorProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (profileId: string) => void;
}

export default function HostProfileSelector({
  isVisible,
  onClose,
  onSelect,
}: HostProfileSelectorProps) {
  const { user } = useAuthStore();
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) {
      fetchProfiles();
    }
  }, [isVisible, user?.id]);

  const fetchProfiles = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("host_profiles")
        .select("id, name, avatar_url")
        .eq("owner_id", user.id)
        .is("deletion_requested_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Error fetching host profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderProfile = ({ item }: { item: HostProfile }) => (
    <TouchableOpacity
      onPress={() => {
        onClose();
        onSelect(item.id);
      }}
      className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3 flex-row items-center"
      activeOpacity={0.8}
    >
      {item.avatar_url ? (
        <RNImage
          source={{ uri: item.avatar_url }}
          className="w-12 h-12 rounded-full"
        />
      ) : (
        <View className="w-12 h-12 rounded-full bg-purple-600 items-center justify-center">
          <Text className="text-white font-bold text-lg">
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View className="ml-4 flex-1">
        <Text className="text-white font-bold text-lg">{item.name}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={onClose}
        />
        <View className="bg-[#191022] rounded-t-3xl pt-4 pb-10 max-h-[80%]">
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pb-4 border-b border-white/10">
            <Text className="text-white text-lg font-bold">
              Select Host Profile
            </Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* List */}
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="large" color="#8B5CF6" />
            </View>
          ) : profiles.length === 0 ? (
            <View className="py-12 items-center px-6">
              <Ionicons name="business-outline" size={48} color="#666" />
              <Text className="text-white font-bold text-center mt-4 text-lg">
                No Active Profiles
              </Text>
              <Text className="text-gray-400 text-center mt-2">
                You need an active host profile to manage admins.
              </Text>
              <TouchableOpacity
                onPress={onClose}
                className="mt-6 bg-purple-600 px-6 py-3 rounded-full"
              >
                <Text className="text-white font-bold">Ok, got it</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={profiles}
              renderItem={renderProfile}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 24 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
