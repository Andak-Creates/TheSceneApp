// app/(app)/notifications.tsx
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  data: any;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, { name: any; color: string }> = {
  party_update:   { name: "megaphone-outline",            color: "#a855f7" },
  new_party:      { name: "sparkles-outline",             color: "#f59e0b" },
  party_comment:  { name: "chatbubble-outline",           color: "#a855f7" },
  party_like:     { name: "heart-outline",                color: "#ef4444" },
  comment_like:   { name: "heart-outline",                color: "#ef4444" },
  comment_reply:  { name: "chatbubble-ellipses-outline",  color: "#a855f7" },
  new_follower:   { name: "person-add-outline",           color: "#10b981" },
  host_follower:  { name: "person-add-outline",           color: "#f59e0b" },
  ticket_purchase:{ name: "ticket-outline",               color: "#10b981" },
  verification:   { name: "shield-checkmark-outline",     color: "#3b82f6" },
  general:        { name: "notifications-outline",        color: "#6b7280" },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, []),
  );

  useEffect(() => {
  if (!user) return;

  const channel = supabase
    .channel("notifications-realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // Prepend new notification to the top of the list
        setNotifications((prev) => [payload.new as AppNotification, ...prev]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    setMarkingAll(false);
  };

  const handleNotificationPress = async (notification: AppNotification) => {
    if (!notification.is_read) await markAsRead(notification.id);

    const { type, data } = notification;

    switch (type) {
      case "party_update":
      case "new_party":
      case "party_like":
        if (data?.party_id) {
          router.push({ pathname: "/party/[id]", params: { id: data.party_id } });
        }
        break;

      case "party_comment":
        if (data?.party_id) {
          router.push({
            pathname: "/party/[id]",
            params: { id: data.party_id, openComments: "true" },
          });
        }
        break;

      case "comment_like":
      case "comment_reply":
        if (data?.party_id) {
          router.push({
            pathname: "/party/[id]",
            params: { id: data.party_id, openComments: "true" },
          });
        } else if (data?.comment_id) {
          try {
            const { data: comment } = await supabase
              .from("party_comments")
              .select("party_id")
              .eq("id", data.comment_id)
              .single();
            if (comment?.party_id) {
              router.push({
                pathname: "/party/[id]",
                params: { id: comment.party_id, openComments: "true" },
              });
            }
          } catch {
            // no-op
          }
        }
        break;

      case "new_follower":
        if (data?.follower_id) {
          router.push({ pathname: "/user/[id]", params: { id: data.follower_id } });
        }
        break;

      case "host_follower":
        if (data?.host_profile_id) {
          router.push({ pathname: "/host/[id]", params: { id: data.host_profile_id } });
        } else if (data?.follower_id) {
          router.push({ pathname: "/user/[id]", params: { id: data.follower_id } });
        }
        break;

      case "verification":
        router.push("/host-verification");
        break;

      default:
        break;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderNotification = ({ item }: { item: AppNotification }) => {
    const icon = TYPE_ICON[item.type] || TYPE_ICON.general;

    return (
      <TouchableOpacity
        onPress={() => handleNotificationPress(item)}
        className={`flex-row items-start px-4 py-4 border-b border-white/5 ${
          !item.is_read ? "bg-purple-500/5" : ""
        }`}
        activeOpacity={0.7}
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3 mt-0.5"
          style={{ backgroundColor: icon.color + "20" }}
        >
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>

        <View className="flex-1">
          <Text
            className={`text-sm font-bold mb-0.5 ${
              item.is_read ? "text-gray-300" : "text-white"
            }`}
          >
            {item.title}
          </Text>
          <Text className="text-gray-400 text-sm leading-relaxed">
            {item.body}
          </Text>
          <Text className="text-gray-600 text-xs mt-1.5">
            {formatTime(item.created_at)}
          </Text>
        </View>

        {!item.is_read && (
          <View className="w-2 h-2 rounded-full bg-purple-500 mt-2 ml-2" />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#09030e]">
      {/* Header */}
      <View className="pt-14 pb-4 px-6 flex-row items-center justify-between border-b border-white/5">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/5 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View className="items-center">
          <Text className="text-white text-xl font-extrabold">Notifications</Text>
          {unreadCount > 0 && (
            <Text className="text-purple-400 text-xs mt-0.5">
              {unreadCount} unread
            </Text>
          )}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={markingAll}
            className="bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-full"
          >
            {markingAll ? (
              <ActivityIndicator size="small" color="#a855f7" />
            ) : (
              <Text className="text-purple-400 text-xs font-semibold">
                Mark all read
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View className="w-10" />
        )}
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#a855f7"
            colors={["#a855f7"]}
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-32">
            <View className="w-20 h-20 rounded-full bg-[#150d1e] items-center justify-center mb-6 border border-white/5">
              <Ionicons name="notifications-off-outline" size={32} color="#a855f7" />
            </View>
            <Text className="text-gray-200 text-xl font-bold mb-2">
              No notifications yet
            </Text>
            <Text className="text-gray-500 text-center max-w-[80%]">
              We'll let you know when something exciting happens
            </Text>
          </View>
        }
      />
    </View>
  );
}