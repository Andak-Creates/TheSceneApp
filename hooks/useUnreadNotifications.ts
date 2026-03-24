// hooks/useUnreadNotifications.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

// Safely load expo-notifications for badge count
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Expo Go — badge count not available
}

export function useUnreadNotifications() {
  const { user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    fetchUnreadCount();

    // Realtime subscription — updates badge whenever notifications change
    const channel = supabase
      .channel("unread-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      const newCount = count || 0;
      setUnreadCount(newCount);

      // Update app icon badge if available
      if (Notifications?.setBadgeCountAsync) {
        await Notifications.setBadgeCountAsync(newCount);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  return { unreadCount, refetch: fetchUnreadCount };
}