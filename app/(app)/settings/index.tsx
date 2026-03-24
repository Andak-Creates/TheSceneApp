import { Ionicons } from "@expo/vector-icons";
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
import { useUserStore } from "../../../stores/userStore";
import HostProfileSelector from "../../../components/HostProfileSelector";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { profile } = useUserStore();
  const [signingOut, setSigningOut] = useState(false);
  const [isHostAdmin, setIsHostAdmin] = useState(false);
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  useEffect(() => {
    // Check if this user is an admin on any host profile (even as a non-host)
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
  }, [user?.id]);

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
      "Your account will be scheduled for deletion in 5 days. During this time you will not be able to access your account. If you change your mind, contact support to cancel.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request Deletion",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Your parties will be hidden immediately and your account permanently deleted in 5 days.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setSigningOut(true);
                    try {
                      if (!user) throw new Error("Not logged in");

                      // Set deletion_requested_at — trigger will hide parties automatically
                      const { error } = await supabase
                        .from("profiles")
                        .update({
                          deletion_requested_at: new Date().toISOString(),
                        })
                        .eq("id", user.id);

                      if (error) throw error;

                      // Notify admin via in-app notification
                      // Find admin users
                      const { data: admins } = await supabase
                        .from("profiles")
                        .select("id")
                        .eq("is_admin", true);

                      if (admins && admins.length > 0) {
                        await supabase.from("notifications").insert(
                          admins.map((admin) => ({
                            user_id: admin.id,
                            title: "🗑️ Account deletion requested",
                            body: `@${profile?.username} has requested account deletion. It will be permanently deleted in 5 days.`,
                            type: "general",
                            data: {
                              type: "account_deletion",
                              user_id: user.id,
                              username: profile?.username,
                              deletion_date: new Date(
                                Date.now() + 5 * 24 * 60 * 60 * 1000
                              ).toISOString(),
                            },
                            is_read: false,
                          }))
                        );
                      }

                      // Sign out immediately
                      await signOut();
                      router.replace("/(auth)/welcome");

                      Alert.alert(
                        "Deletion Scheduled",
                        "Your account has been scheduled for deletion in 5 days. Contact support@thescene.app if you change your mind."
                      );
                    } catch (err: any) {
                      console.error("Delete account error:", err);
                      Alert.alert(
                        "Error",
                        err.message || "Failed to request deletion. Please try again."
                      );
                    } finally {
                      setSigningOut(false);
                    }
                  },
                },
              ]
            );
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
    showChevron = true,
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
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? "bg-red-500/10" : "bg-white/5"}`}
      >
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? "#ef4444" : "#a855f7"}
        />
      </View>
      <Text
        className={`flex-1 ml-4 text-base font-medium ${destructive ? "text-red-500" : "text-gray-200"}`}
      >
        {label}
      </Text>
      {showChevron && (
        <Ionicons name="chevron-forward" size={20} color="#444" />
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#09030e] pb-20">
      {/* Header */}
      <View className="pt-16 pb-6 px-6 border-b border-white/5 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.push("../profile")}
          className="mr-4 p-2 bg-white/5 rounded-full"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Settings</Text>
      </View>

      <ScrollView
        className="flex-1 px-6 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Account Section */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
            Account
          </Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem
              icon="person-outline"
              label="Edit Profile"
              onPress={() => router.back()}
            />
            <SettingItem
              icon="notifications-outline"
              label="Notifications"
              onPress={() => router.push("/(app)/settings/notifications")}
            />
          </View>
        </View>

        {/* Hosting & Payments */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
            Hosting & Payments
          </Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem
              icon="business-outline"
              label="Withdrawal Bank Account"
              onPress={() => router.push("/host/bank-account")}
            />
            {profile?.is_host && (
              <>
                <SettingItem
                  icon="stats-chart-outline"
                  label="Host Analytics"
                  onPress={() => router.push("/host-dashboard")}
                />
                <SettingItem
                  icon="business-outline"
                  label="Manage Host Profiles"
                  onPress={() => router.push("/(app)/host-profile-setup")}
                />
                <SettingItem
                  icon="people-circle-outline"
                  label="Manage Admins"
                  onPress={async () => {
                    const { data } = await supabase
                      .from("host_profiles")
                      .select("id")
                      .eq("owner_id", user?.id)
                      .is("deletion_requested_at", null);

                    if (!data || data.length === 0) {
                      Alert.alert(
                        "No Profile",
                        "Please create a host profile first to manage admins."
                      );
                    } else if (data.length === 1) {
                      router.push({
                        pathname: "/(app)/host-profile-admins",
                        params: { hostProfileId: data[0].id },
                      } as any);
                    } else {
                      setShowProfileSelector(true);
                    }
                  }}
                />
              </>
            )}
            {/* Non-host users who are admins of a host profile */}
            {!profile?.is_host && isHostAdmin && (
              <SettingItem
                icon="scan-outline"
                label="Scanner & Dashboard"
                onPress={() => router.push("/host-dashboard")}
              />
            )}
          </View>
        </View>

        {/* Preferences */}
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
            Preferences
          </Text>
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
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
            Information
          </Text>
          <View className="bg-[#150d1e] rounded-3xl px-4 border border-white/5">
            <SettingItem
              icon="document-text-outline"
              label="Legal & Terms"
              onPress={() => router.push("/(app)/settings/legal")}
            />
            <SettingItem
              icon="help-circle-outline"
              label="Support"
              onPress={() => router.push("/(app)/settings/support")}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View className="mb-10">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
            Danger Zone
          </Text>
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

      {/* Host Profile Selector for Manage Admins */}
      <HostProfileSelector
        isVisible={showProfileSelector}
        onClose={() => setShowProfileSelector(false)}
        onSelect={(profileId) => {
          router.push({
            pathname: "/(app)/host-profile-admins",
            params: { hostProfileId: profileId },
          } as any);
        }}
      />
    </View>
  );
}