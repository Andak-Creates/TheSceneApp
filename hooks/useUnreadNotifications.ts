// hooks/useUnreadNotifications.ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../lib/supabase";
import { queryKeys } from "../lib/queryKeys";
import { useAuthStore } from "../stores/authStore";

// Safely load expo-notifications for badge count
let Notifications: any = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // Expo Go — badge count not available
}

async function fetchUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return count || 0;
}

export function useUnreadNotifications() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: unreadCount = 0, refetch } = useQuery({
    queryKey: queryKeys.unreadNotifications(user?.id ?? ""),
    queryFn: () => fetchUnreadCount(user!.id),
    enabled: !!user,
    staleTime: 0, // always treat as stale — notifications must be real-time
    refetchInterval: false, // rely on Realtime + AppState instead of polling
  });

  // Update badge count whenever unreadCount changes
  useEffect(() => {
    if (Notifications?.setBadgeCountAsync) {
      Notifications.setBadgeCountAsync(unreadCount);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (!user) return;

    // Refresh when app comes back to foreground
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") refetch();
      }
    );

    // Realtime — invalidate cache whenever a notification row changes
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
          queryClient.invalidateQueries({
            queryKey: queryKeys.unreadNotifications(user.id),
          });
        }
      )
      .subscribe();

    return () => {
      subscription.remove();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { unreadCount, refetch };
}