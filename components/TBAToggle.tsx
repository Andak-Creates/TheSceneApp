import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Switch, Text, View } from "react-native";

interface TBAToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

export default function TBAToggle({
  label,
  value,
  onChange,
  description,
}: TBAToggleProps) {
  return (
    <View className="bg-white/10 border border-white/20 rounded-xl p-4 mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center">
            <Ionicons
              name="time-outline"
              size={20}
              color={value ? "#8B5CF6" : "#9ca3af"}
            />
            <Text className="text-white font-semibold ml-2">{label}</Text>
          </View>
          {description && (
            <Text className="text-gray-400 text-sm mt-1">{description}</Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: "#374151", true: "#8B5CF6" }}
          thumbColor={value ? "#fff" : "#9ca3af"}
        />
      </View>

      {value && (
        <View className="mt-3 bg-purple-600/20 border border-purple-500/30 rounded-lg p-3">
          <View className="flex-row items-center">
            <Ionicons name="information-circle" size={16} color="#a78bfa" />
            <Text className="text-purple-300 text-xs ml-2 flex-1">
              This field will show as "Coming Soon" or "TBA" to attendees
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
