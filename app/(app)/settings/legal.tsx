import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function LegalScreen() {
  const router = useRouter();

  const LegalSection = ({ title, content }: { title: string; content: string }) => (
    <View className="mb-10">
      <Text className="text-purple-400 font-bold text-lg mb-4 uppercase tracking-wider">{title}</Text>
      <Text className="text-gray-300 leading-6 text-sm">
        {content}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 px-6 pb-6 border-b border-white/10 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-white/5 rounded-full">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text className="text-white text-2xl font-bold">Legal</Text>
          <Text className="text-gray-400 text-sm">Terms and Privacy Policy</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-8" contentContainerStyle={{ paddingBottom: 60 }}>
        <LegalSection 
          title="Terms of Service"
          content={`Last Updated: February 2026

1. Acceptance of Terms
By accessing or using TheScene, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.

2. User Responsibilities
Users must be 18 years or older. You are responsible for all activities that occur under your account. You agree not to use the platform for any illegal activities or to harass others.

3. Ticket Purchases & Refunds
All ticket sales are final unless otherwise stated by the event host. TheScene is a marketplace and is not responsible for event cancellations or quality.

4. Host Obligations
Hosts are responsible for the accuracy of event details and ensuring the safety of attendees. Hosts agree to the service fee structure defined in the Host Dashboard.

5. Limitation of Liability
TheScene is provided "as is" without warranty of any kind. We are not liable for any damages arising from your use of the platform.`}
        />

        <LegalSection 
          title="Privacy Policy"
          content={`Last Updated: February 2026

1. Data Collection
We collect information you provide directly to us, such as your name, email, and location. We also collect automated data about your device and usage.

2. How We Use Data
We use your data to provide, maintain, and improve our services, facilitate ticket purchases, and communicate with you about events.

3. Sharing of Information
We share necessary information with event hosts when you buy a ticket. We do not sell your personal data to third parties.

4. Your Rights
You have the right to access, correct, or delete your personal data. You can delete your account at any time through the profile settings.

5. Security
We implement industry-standard security measures to protect your data, but no method of transmission is 100% secure.`}
        />
      </ScrollView>
    </View>
  );
}
