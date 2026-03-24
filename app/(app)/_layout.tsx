import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { FontAwesome6, Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

export default function AppLayout() {
  usePushNotifications();
  const { unreadCount } = useUnreadNotifications();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0d0514", // Solid elegant dark color instead of blur
          borderTopWidth: 1,
          borderTopColor: "rgba(255, 255, 255, 0.05)",
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
          position: "absolute",
          elevation: 0,
        },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#6b7280",
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) => (
            <View className="items-center">
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={26}
                color={color}
              />
              {focused && (
                <View className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 absolute -bottom-3" />
              )}
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings/index"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings/notifications"
        options={{
          href: null,
         
        }}
      />

      <Tabs.Screen
        name="settings/support"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings/legal"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="settings/preferences"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="host-verification"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="createParty"
        options={{
          title: "",
          tabBarIcon: () => (
            <View className="w-14 h-14 rounded-full bg-white items-center justify-center -mt-6 shadow-xl shadow-white/20 border-4 border-[#09030e]">
              <FontAwesome6 name="plus" size={20} color="#000" />
            </View>
          ),
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="host-profile-setup"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="host-profile-admins"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View className="items-center">
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={26}
                color={color}
              />
              {focused && (
                <View className="w-1.5 h-1.5 rounded-full bg-white mt-1.5 absolute -bottom-3" />
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
