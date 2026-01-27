import { FontAwesome6 } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#191022",
          borderTopWidth: 1,
          borderTopColor: "rgba(255, 255, 255, 0.1)",
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: "#8B5CF6",
        tabBarInactiveTintColor: "#666",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6 name="house" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="createParty"
        options={{
          title: "",
          tabBarIcon: () => (
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#8B5CF6",
                alignItems: "center",
                justifyContent: "center",
                marginTop: -20,
                shadowColor: "#8B5CF6",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <FontAwesome6 name="plus" size={26} color="#fff" />
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <FontAwesome6 name="user" size={focused ? 24 : 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
