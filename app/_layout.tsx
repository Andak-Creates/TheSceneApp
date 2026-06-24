import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import * as Linking from "expo-linking";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import { useAuthStore } from "../stores/authStore";
import { usePreferencesStore } from "../stores/preferencesStore";
import { useUserStore } from "../stores/userStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 min — treat data as fresh
      gcTime: 10 * 60 * 1000,     // 10 min — keep unused cache
      retry: 1,
    },
  },
});


export default function RootLayout() {
  const { initialize, initialized, user } = useAuthStore();
  const { fetchProfile, clearProfile } = useUserStore();
  const { hasPreferences, checkPreferences, reset } = usePreferencesStore();
  const segments = useSegments();
  const router = useRouter();
  const [isPasswordResetLink, setIsPasswordResetLink] = useState<boolean | null>(null);

  useEffect(() => {
    initialize();
    // Check if the app was opened via a password reset deep link.
    // We need to know this before the auth guard runs so we don't
    // redirect the user away before they can exchange their token.
    Linking.getInitialURL().then((url) => {
      if (url) {
        const parsed = Linking.parse(url);
        const hasCode = !!parsed.queryParams?.code;
        const hasTokenInHash = url.includes('access_token=');
        const isResetPath = url.includes('reset-password');
        setIsPasswordResetLink((hasCode || hasTokenInHash) && isResetPath);
      } else {
        setIsPasswordResetLink(false);
      }
    });
  }, []);

  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      checkPreferences(user.id);
    } else {
      clearProfile();
      reset();
    }
  }, [user]);

  useEffect(() => {
    // Wait until we know whether this is a password reset deep link
    if (!initialized || hasPreferences === null || isPasswordResetLink === null) return;

    const first = String(segments[0] ?? "");
    const second = String(segments[1] ?? "");
    const inAuthGroup = first === "(auth)";

    // Never redirect away from the reset-password screen — the token
    // exchange happens there and needs time to complete.
    if (second === "reset-password") return;

    if (!user && !inAuthGroup) {
      // Only redirect to welcome if this is NOT a password reset deep link
      if (!isPasswordResetLink) {
        router.replace("/(auth)/welcome");
      }
    } else if (user && !hasPreferences && second !== "onboarding") {
      router.replace("/(auth)/onboarding");
    } else if (user && hasPreferences && inAuthGroup && second !== "onboarding") {
      router.replace("/(app)/feed");
    }
  }, [user, initialized, segments, hasPreferences, isPasswordResetLink]);

  const isLoading = !initialized || (user && hasPreferences === null);

  return (
    <QueryClientProvider client={queryClient}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
          <StatusBar style="auto" />

          {/* Always mount navigation */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>

          {/* Loading overlay */}
          {isLoading && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "#09030e",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" />
            </View>
          )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </QueryClientProvider>
  );
});