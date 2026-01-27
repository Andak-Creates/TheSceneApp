import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuthStore } from "../stores/authStore";

export default function Index() {
  const router = useRouter();
  const { user, initialized } = useAuthStore();

  useEffect(() => {
    if (initialized) {
      // Once auth is initialized, redirect based on user status
      if (user) {
        // User is logged in - let the layout handle onboarding check
        router.replace("/(app)/feed");
      } else {
        // User is not logged in
        router.replace("/(auth)/welcome");
      }
    }
  }, [initialized, user]);

  // Show loading screen while checking auth
  return (
    <View className="flex-1 bg-[#191022] items-center justify-center">
      {/* Logo or App Name */}
      <View className="mb-8">
        <Text className="text-white text-5xl font-extrabold">PartiesAt</Text>
        <Text className="text-purple-500 text-xl text-center mt-2">
          Where the vibes at? 🎉
        </Text>
      </View>

      {/* Loading Indicator */}
      <ActivityIndicator size="large" color="#8B5CF6" />
    </View>
  );
}
