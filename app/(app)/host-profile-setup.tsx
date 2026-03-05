import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

export default function HostProfileSetupScreen() {
  const { user } = useAuthStore();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    fetchProfiles();
  }, [user?.id]);

  const fetchProfiles = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("host_profiles")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      setAvatarUri(result.assets[0].uri);
      setAvatarBase64(result.assets[0].base64 || null);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert("Required", "Please enter a name for your host profile");
      return;
    }

    setSaving(true);
    try {
      let publicUrl = avatarUri?.startsWith("http") ? avatarUri : null;

      if (avatarBase64) {
        const fileExt = avatarUri?.split(".").pop() || "jpg";
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/host-profiles/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, decode(avatarBase64), {
            contentType: `image/${fileExt}`,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      }

      if (selectedProfileId) {
        // Update
        const { error } = await supabase
          .from("host_profiles")
          .update({
            name: name.trim(),
            bio: bio.trim() || null,
            avatar_url: publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedProfileId);

        if (error) throw error;
        Alert.alert("Success", "Host profile updated!");
      } else {
        // Insert
        const { error } = await supabase
          .from("host_profiles")
          .insert({
            owner_id: user.id,
            name: name.trim(),
            bio: bio.trim() || null,
            avatar_url: publicUrl,
          });

        if (error) throw error;
        Alert.alert("Success", "Host profile created!");
      }

      setIsEditing(false);
      resetForm();
      fetchProfiles();
    } catch (error: any) {
      console.error("Error saving host profile:", error);
      Alert.alert("Error", error.message || "Failed to save host profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfileId) return;

    // Check if there are parties linked to this profile
    const { count, error: countError } = await supabase
      .from("parties")
      .select("id", { count: 'exact', head: true })
      .eq("host_profile_id", selectedProfileId);

    if (countError) {
      console.error("Error checking parties:", countError);
    }

    const message = count && count > 0 
      ? `This brand has ${count} parties linked to it. Deleting it will remove the brand association from those parties. Are you sure?`
      : "Are you sure you want to delete this brand profile?";

    Alert.alert("Delete Brand", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            const { error } = await supabase
              .from("host_profiles")
              .delete()
              .eq("id", selectedProfileId);

            if (error) throw error;
            Alert.alert("Deleted", "Host profile has been removed.");
            setIsEditing(false);
            resetForm();
            fetchProfiles();
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to delete profile");
          } finally {
            setSaving(false);
          }
        }
      }
    ]);
  };

  const resetForm = () => {
    setName("");
    setBio("");
    setAvatarUri(null);
    setAvatarBase64(null);
    setSelectedProfileId(null);
  };

  const startCreate = () => {
    resetForm();
    setIsEditing(true);
  };

  const startEdit = (profile: any) => {
    setName(profile.name);
    setBio(profile.bio || "");
    setAvatarUri(profile.avatar_url);
    setAvatarBase64(null);
    setSelectedProfileId(profile.id);
    setIsEditing(true);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#09030e]"
    >
      <View className="pt-16 px-6 pb-4 bg-[#09030e] border-b border-white/5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => isEditing ? setIsEditing(false) : router.back()}
              className="w-10 h-10 bg-white/5 rounded-full items-center justify-center border border-white/10"
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text className="text-white text-xl font-bold ml-4">
              {isEditing ? (selectedProfileId ? "Edit Profile" : "New Profile") : "Host Profiles"}
            </Text>
          </View>
          {!isEditing && (
            <TouchableOpacity
              onPress={startCreate}
              className="bg-purple-600 px-4 py-2 rounded-full"
            >
              <Text className="text-white font-bold text-sm">+ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-6">
        {isEditing ? (
          <View>
            <TouchableOpacity
              onPress={handlePickImage}
              className="items-center mb-8"
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  className="w-32 h-32 rounded-full"
                />
              ) : (
                <View className="w-32 h-32 rounded-full bg-white/5 border-2 border-dashed border-white/10 items-center justify-center">
                  <Ionicons name="camera" size={40} color="#666" />
                  <Text className="text-gray-500 text-xs mt-2">Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <View className="mb-6">
              <Text className="text-gray-400 text-sm font-semibold mb-2">Host Name *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="e.g. Night Owl Events"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View className="mb-6">
              <Text className="text-gray-400 text-sm font-semibold mb-2">Bio (Optional)</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Tell people about your brand"
                placeholderTextColor="#666"
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-purple-600 py-4 rounded-2xl items-center shadow-lg shadow-purple-600/30 mb-4"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">
                  {selectedProfileId ? "Save Changes" : "Create Profile"}
                </Text>
              )}
            </TouchableOpacity>

            {selectedProfileId && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={saving}
                className="bg-red-500/10 border border-red-500/20 py-4 rounded-2xl items-center mb-10"
              >
                <Text className="text-red-500 font-bold">Delete Profile</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="pb-10">
            {profiles.length === 0 ? (
              <View className="items-center justify-center py-12">
                <View className="bg-purple-600/10 p-6 rounded-3xl mb-6">
                  <Ionicons name="sparkles" size={48} color="#a855f7" />
                </View>
                <Text className="text-white text-3xl font-extrabold text-center mb-3">
                  Welcome, Host!
                </Text>
                <Text className="text-gray-400 text-center text-base mb-8 px-4">
                  To start creating parties, you first need to establish your brand identity.
                </Text>
                <TouchableOpacity
                  onPress={startCreate}
                  className="bg-purple-600 px-8 py-4 rounded-2xl shadow-lg shadow-purple-600/40"
                >
                  <Text className="text-white font-bold text-lg">Create First Brand</Text>
                </TouchableOpacity>
              </View>
            ) : (
              profiles.map((profile) => (
                <TouchableOpacity
                  key={profile.id}
                  onPress={() => startEdit(profile)}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 flex-row items-center"
                >
                  {profile.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      className="w-16 h-16 rounded-full"
                    />
                  ) : (
                    <View className="w-16 h-16 rounded-full bg-purple-600 items-center justify-center">
                      <Text className="text-white font-bold text-xl">
                        {profile.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="ml-4 flex-1">
                    <Text className="text-white font-bold text-lg">{profile.name}</Text>
                    {profile.bio && (
                      <Text className="text-gray-400 text-sm" numberOfLines={1}>
                        {profile.bio}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
