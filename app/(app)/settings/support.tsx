import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function SupportScreen() {
  const router = useRouter();

  const handleEmailSupport = () => {
    Linking.openURL("mailto:kelvinandak@gmail.com?subject=Support Request");
  };

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 px-6 pb-6 border-b border-white/10 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-white/5 rounded-full">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text className="text-white text-2xl font-bold">Help & Support</Text>
          <Text className="text-gray-400 text-sm">We're here to help</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-8" contentContainerStyle={{ paddingBottom: 60 }}>
        <View className="mb-8">
          <Text className="text-white text-xl font-bold mb-4">Contact Us</Text>
          <Text className="text-gray-300 mb-6 leading-6">
            If you are experiencing issues with a ticket, host payouts, or need to report a problem with the app, please reach out to our support team.
          </Text>
          
          <TouchableOpacity 
            onPress={handleEmailSupport}
            className="bg-purple-600 flex-row items-center justify-center py-4 rounded-xl"
          >
            <Ionicons name="mail-outline" size={20} color="#fff" />
            <Text className="text-white font-bold text-lg ml-2">Email Support</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white/5 p-6 rounded-2xl border border-white/10 mt-6">
          <Text className="text-white font-bold mb-2">Response Times</Text>
          <Text className="text-gray-400 text-sm">
            Our team typically responds within 24-48 hours. For urgent ticket matters on the day of an event, please include "URGENT" in your subject line.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
