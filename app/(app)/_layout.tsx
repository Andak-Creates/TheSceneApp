import { Tabs } from "expo-router";
import { Text } from "react-native";

// TODO: Replace with proper icons (lucide-react-native or expo-icons)
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#e5e5e5",
        },
        tabBarActiveTintColor: "#8B5CF6",
        tabBarInactiveTintColor: "#666",
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>🎉</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="create-party"
        options={{
          title: "Create",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>➕</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24, color }}>👤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
