import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}

export default function BankAccountScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAccount, setExistingAccount] = useState<BankAccount | null>(null);

  useEffect(() => {
    if (user) {
      fetchBankAccount();
    }
  }, [user]);

  const fetchBankAccount = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("host_bank_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setExistingAccount(data);
        setBankName(data.bank_name);
        setAccountNumber(data.account_number);
        setAccountName(data.account_name);
      }
    } catch (error) {
      console.error("Error fetching bank account:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !bankName || !accountNumber || !accountName) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setSaving(true);
    try {
      const bankData = {
        user_id: user.id,
        bank_name: bankName.trim(),
        bank_code: "000", // Placeholder for actual bank code if needed for Paystack
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existingAccount) {
        const { error } = await supabase
          .from("host_bank_accounts")
          .update(bankData)
          .eq("id", existingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("host_bank_accounts")
          .insert(bankData);
        if (error) throw error;
      }

      Alert.alert("Success", "Bank account updated successfully");
      router.back();
    } catch (error) {
      console.error("Error saving bank account:", error);
      Alert.alert("Error", "Failed to save bank account details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      className="flex-1 bg-[#191022]"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="pt-12 px-6 pb-4 flex-row items-center border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold flex-1">Bank Account</Text>
      </View>

      <ScrollView className="flex-1 p-6" keyboardShouldPersistTaps="handled">
        <View className="bg-white/5 p-6 rounded-3xl border border-white/10 mb-8">
          <Ionicons name="business-outline" size={48} color="#8B5CF6" className="mb-4" />
          <Text className="text-white text-xl font-bold mb-2">Payout Destination</Text>
          <Text className="text-gray-400 text-sm">
            Enter the bank account details where you want to receive your earnings.
          </Text>
        </View>

        <View className="space-y-6">
          <View>
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Bank Name</Text>
            <TextInput
              className="bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-base"
              value={bankName}
              onChangeText={setBankName}
              placeholder="e.g. Zenith Bank"
              placeholderTextColor="#666"
            />
          </View>

          <View className="mt-4">
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Account Number</Text>
            <TextInput
              className="bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-base"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="10 digits"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          <View className="mt-4">
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Account Name</Text>
            <TextInput
              className="bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-base"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Full Account Name"
              placeholderTextColor="#666"
              autoCapitalize="characters"
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className="bg-purple-600 py-4 rounded-2xl items-center mt-12 mb-10"
          style={{ shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">Save Account Details</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
