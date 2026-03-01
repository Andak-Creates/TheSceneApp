import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { useUserStore } from "../../../stores/userStore";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { profile } = useUserStore();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "This is permanent. All your profile data, tickets, and host history will be deleted. Are you absolutely sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              const { error } = await supabase.from("profiles").delete().eq("id", user?.id);
              if (error) throw error;
              await signOut();
              router.replace("/(auth)/welcome");
            } catch (err) {
              console.error("Delete account error:", err);
              Alert.alert("Error", "Failed to delete account records.");
            } finally {
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  const SettingItem = ({ 
    icon, 
    label, 
    onPress, 
    destructive = false,
    showChevron = true 
  }: { 
    icon: any; 
    label: string; 
    onPress: () => void; 
    destructive?: boolean;
    showChevron?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center py-4 border-b border-white/5"
      activeOpacity={0.7}
    >
      <View className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? 'bg-red-500/10' : 'bg-white/5'}`}>
        <Ionicons name={icon} size={20} color={destructive ? "#ef4444" : "#a855f7"} />
      </View>
      <Text className={`flex-1 ml-4 text-base font-medium ${destructive ? 'text-red-500' : 'text-gray-200'}`}>
        {label}
      </Text>
      {showChevron && <Ionicons name="chevron-forward" size={20} color="#444" />}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#09030e] pb-20">
      {/* Header */}
      <View className="pt-16 pb-6 px-6 border-b border-white/5 flex-row items-center">
        <TouchableOpacity onPress={() => router.push("../profile")} className="mr-4 p-2 bg-white/5 rounded-full">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Account</Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem 
              icon="person-outline" 
              label="Edit Profile" 
              onPress={() => router.back()} // They are already on the profile page's edit mode potentially
            />
            <SettingItem 
              icon="notifications-outline" 
              label="Notifications" 
              onPress={() => Alert.alert("Coming Soon", "Notification settings will be available in a future update.")} 
            />
          </View>
        </View>

        {/* Hosting & Payments */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Hosting & Payments</Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem 
              icon="business-outline" 
              label="Withdrawal Bank Account" 
              onPress={() => router.push("/host/bank-account")} 
            />
            {profile?.is_host && (
              <SettingItem 
                icon="stats-chart-outline" 
                label="Host Analytics" 
                onPress={() => router.push("/host-dashboard")} 
              />
            )}
          </View>
        </View>

        {/* Location & Preferences */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Preferences</Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem
              icon="location-outline"
              label="Location & Preferences"
              onPress={() => router.push("/(app)/settings/preferences")}
            />
          </View>
        </View>

        {/* Information */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Information</Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem 
              icon="document-text-outline" 
              label="Legal & Terms" 
              onPress={() => router.push("/(app)/settings/legal")} 
            />
            <SettingItem 
              icon="help-circle-outline" 
              label="Support" 
              onPress={() => Alert.alert("Support", "Please email support@thescene.app for assistance.")} 
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View className="mb-10">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">Danger Zone</Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem 
              icon="log-out-outline" 
              label="Sign Out" 
              onPress={handleSignOut} 
              showChevron={false}
            />
            <SettingItem 
              icon="trash-outline" 
              label="Delete Account" 
              onPress={handleDeleteAccount}
              destructive
              showChevron={false}
            />
          </View>
        </View>

        {signingOut && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-3xl">
            <ActivityIndicator size="large" color="#a855f7" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
