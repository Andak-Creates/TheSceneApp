import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PaystackProvider } from "react-native-paystack-webview";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import { useAuthStore } from "../stores/authStore";
import { usePreferencesStore } from "../stores/preferencesStore";
import { useUserStore } from "../stores/userStore";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://39e0484f1524507ed786ed803b34071c@o4511057460723712.ingest.de.sentry.io/4511057467342928',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const PAYSTACK_PUBLIC_KEY = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY!;

export default Sentry.wrap(function RootLayout() {
  const { initialize, initialized, user } = useAuthStore();
  const { fetchProfile, clearProfile } = useUserStore();
  const { hasPreferences, checkPreferences, reset } = usePreferencesStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
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
    if (!initialized || hasPreferences === null) return;

    const first = String(segments[0] ?? "");
    const second = String(segments[1] ?? "");
    const inAuthGroup = first === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/welcome");
    } else if (user && !hasPreferences && second !== "onboarding") {
      router.replace("/(auth)/onboarding");
    } else if (user && hasPreferences && inAuthGroup && second !== "onboarding") {
      router.replace("/(app)/feed");
    }
  }, [user, initialized, segments, hasPreferences]);

  const isLoading = !initialized || (user && hasPreferences === null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaystackProvider publicKey={PAYSTACK_PUBLIC_KEY}>
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
        </PaystackProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});