import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "../global.css";
import { useAuthStore } from "../stores/authStore";
import { usePreferencesStore } from "../stores/preferencesStore";
import { useUserStore } from "../stores/userStore";

export default function RootLayout() {
  const { initialize, initialized, user } = useAuthStore();
  const { fetchProfile, clearProfile } = useUserStore();
  const { hasPreferences, checkPreferences, reset } = usePreferencesStore();
  const segments = useSegments();
  const router = useRouter();

  // Initialize auth
  useEffect(() => {
    initialize();
  }, []);

  // Fetch user profile and check preferences when logged in
  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
      checkPreferences(user.id);
    } else {
      clearProfile();
      reset();
    }
  }, [user]);

  // Handle navigation based on auth state and onboarding status
  useEffect(() => {
    if (!initialized || hasPreferences === null) return;

    const firstSegment =
      typeof segments[0] === "string" ? String(segments[0]) : undefined;
    const secondSegment =
      typeof segments[1] === "string" ? String(segments[1]) : undefined;
    const inAuthGroup = firstSegment === "(auth)";
    const inAppGroup = firstSegment === "(app)";

    console.log("Navigation check:", {
      user: !!user,
      hasPreferences,
      segments: segments.join("/"),
      inAuthGroup,
      inAppGroup,
    });

    if (!user && !inAuthGroup) {
      // Not logged in -> redirect to welcome
      console.log("Redirecting to welcome");
      router.replace("/(auth)/welcome");
    } else if (user && !hasPreferences && secondSegment !== "onboarding") {
      // Logged in but hasn't completed onboarding -> redirect to onboarding
      console.log("Redirecting to onboarding");
      router.replace("/(auth)/onboarding");
    } else if (
      user &&
      hasPreferences &&
      inAuthGroup &&
      secondSegment !== "onboarding"
    ) {
      // Logged in with preferences and still in auth group -> redirect to app
      console.log("Redirecting to feed");
      router.replace("/(app)/feed");
    }
  }, [user, initialized, segments, hasPreferences]);

  // Show loading while checking initialization or preferences
  if (!initialized || (user && hasPreferences === null)) {
    return null;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
