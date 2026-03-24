// hooks/usePushNotifications.ts
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

// Safely load expo-notifications — crashes in Expo Go without a dev client build
let Notifications: any = null;
let isPhysicalDevice = false;

try {
  Notifications = require("expo-notifications");
  const Device = require("expo-device");
  isPhysicalDevice = Device.isDevice ?? false;

  // Only set handler if module loaded successfully
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Running in Expo Go — push notifications not available
  console.log("expo-notifications not available in Expo Go. Build a dev client to test push notifications.");
}

export function usePushNotifications() {
  const { user } = useAuthStore();
  const router = useRouter();
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Skip entirely if notifications module not available
    if (!Notifications || !user) return;

    registerForPushNotifications();

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification: any) => {
        console.log("Notification received in foreground:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response: any) => {
        const data = response.notification.request.content.data;
        handleNotificationTap(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user?.id]);

  const registerForPushNotifications = async () => {
    if (!isPhysicalDevice || !Notifications) {
      console.log("Push notifications only work on physical devices with a dev client build");
      return;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Push notification permission denied");
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "TheScene",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#a855f7",
          sound: "default",
        });
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
  projectId:
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_PROJECT_ID,
});

      const token = tokenData.data;
      if (!token || !user) return;

      await supabase.from("push_tokens").upsert(
        {
          user_id: user.id,
          token,
          device_type: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );

      console.log("Push token registered:", token);
    } catch (error) {
      console.error("Error registering push token:", error);
    }
  };

  const handleNotificationTap = (data: any) => {
    if (!data) return;

    switch (data.type) {
      case "party_update":
      case "new_party":
        if (data.party_id) {
          router.push({
            pathname: "/party/[id]",
            params: { id: data.party_id },
          });
        }
        break;
      case "verification":
        router.push("/host-verification");
        break;
      default:
        router.push("/(app)/settings/notifications");
        break;
    }
  };

  return null;
}