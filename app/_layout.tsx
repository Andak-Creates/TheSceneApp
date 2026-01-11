import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useUserStore } from '../stores/userStore';
import '../global.css'; // Import your global styles

export default function RootLayout() {
  const { initialize, initialized, user } = useAuthStore();
  const { fetchProfile, clearProfile } = useUserStore();
  const segments = useSegments();
  const router = useRouter();

  // Initialize auth
  useEffect(() => {
    initialize();
  }, []);

  // Fetch user profile when logged in
  useEffect(() => {
    if (user) {
      fetchProfile(user.id);
    } else {
      clearProfile();
    }
  }, [user]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!initialized) return;

    const firstSegment = typeof segments[0] === 'string' ? String(segments[0]) : undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const inAppGroup = firstSegment === '(app)';

    if (!user && !inAuthGroup) {
      // Redirect to auth if not logged in
      router.replace('/(auth)/welcome');
    } else if (user && inAuthGroup) {
      // Redirect to app if logged in
      router.replace('/(app)/feed');
    }
  }, [user, initialized, segments]);

  if (!initialized) {
    // TODO: Create a proper loading screen
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