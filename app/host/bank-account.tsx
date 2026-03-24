import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

// Nigerian bank list with Paystack bank codes
// Source: GET https://api.paystack.co/bank
const BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "OPay (PayCom)", code: "100004" },
  { name: "Paga", code: "100002" },
  { name: "PalmPay", code: "100033" },
  { name: "Polaris Bank", code: "076" },
  { name: "Providus Bank", code: "101" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Suntrust Bank", code: "100" },
  { name: "Titan Trust Bank", code: "102" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

interface BankAccount {
  id: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
}

export default function BankAccountScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { setFeedActive } = useAudioStore();

  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingAccount, setExistingAccount] = useState<BankAccount | null>(null);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      setFeedActive(false);
      return () => setFeedActive(true);
    }, []),
  );

  useEffect(() => {
    if (user) fetchBankAccount();
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
        // Pre-select bank from saved code
        const saved = BANKS.find((b) => b.code === data.bank_code);
        setSelectedBank(saved || { name: data.bank_name, code: data.bank_code });
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
    if (!user || !selectedBank || !accountNumber || !accountName) {
      Alert.alert("Missing Fields", "Please fill in all fields including selecting a bank.");
      return;
    }
    if (accountNumber.length !== 10) {
      Alert.alert("Invalid Account", "Account number must be exactly 10 digits.");
      return;
    }

    setSaving(true);
    try {
      const bankData = {
        user_id: user.id,
        bank_name: selectedBank.name,
        bank_code: selectedBank.code,       // ← actual Paystack bank code
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
        is_active: true,
        recipient_code: null,               // reset if bank changed
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

      Alert.alert("Saved ✓", "Bank account updated successfully.");
      router.back();
    } catch (error) {
      console.error("Error saving bank account:", error);
      Alert.alert("Error", "Failed to save bank account details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const filteredBanks = bankSearch.trim()
    ? BANKS.filter((b) => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
    : BANKS;

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
        {/* Info card */}
        <View className="bg-white/5 p-5 rounded-3xl border border-white/10 mb-8 flex-row items-start gap-3">
          <Ionicons name="information-circle-outline" size={22} color="#8B5CF6" />
          <View className="flex-1">
            <Text className="text-white font-bold mb-1">Payout Destination</Text>
            <Text className="text-gray-400 text-sm leading-relaxed">
              Enter the bank account where you'd like to receive your earnings. This must be a Nigerian bank account.
            </Text>
          </View>
        </View>

        <View className="gap-5">
          {/* Bank Picker */}
          <View>
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Bank</Text>
            <TouchableOpacity
              onPress={() => setShowBankPicker(true)}
              className="bg-white/5 border border-white/10 p-4 rounded-2xl flex-row justify-between items-center"
            >
              <Text className={selectedBank ? "text-white text-base" : "text-gray-600 text-base"}>
                {selectedBank ? selectedBank.name : "Select your bank"}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
            {selectedBank && (
              <Text className="text-gray-600 text-xs ml-1 mt-1">
                Bank code: {selectedBank.code}
              </Text>
            )}
          </View>

          {/* Account Number */}
          <View>
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Account Number</Text>
            <TextInput
              className="bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-base"
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder="10-digit NUBAN number"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>

          {/* Account Name */}
          <View>
            <Text className="text-gray-400 text-sm font-semibold mb-2 ml-1">Account Name</Text>
            <TextInput
              className="bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-base"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Full name on account"
              placeholderTextColor="#666"
              autoCapitalize="characters"
            />
            <Text className="text-gray-600 text-xs ml-1 mt-1">
              Must match exactly what your bank has on file.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className="bg-purple-600 py-4 rounded-2xl items-center mt-10 mb-10"
          style={{
            shadowColor: "#8B5CF6",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">Save Account Details</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Bank Picker Modal */}
      <Modal
        visible={showBankPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBankPicker(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-[#1e1330] rounded-t-3xl max-h-[80%]">
            {/* Modal Header */}
            <View className="px-6 pt-5 pb-3 flex-row justify-between items-center border-b border-white/10">
              <Text className="text-white text-lg font-bold">Select Bank</Text>
              <TouchableOpacity onPress={() => setShowBankPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View className="px-6 py-3">
              <View className="bg-white/10 border border-white/10 rounded-xl flex-row items-center px-4">
                <Ionicons name="search" size={18} color="#666" />
                <TextInput
                  className="flex-1 text-white text-sm py-3 ml-2"
                  placeholder="Search banks..."
                  placeholderTextColor="#666"
                  value={bankSearch}
                  onChangeText={setBankSearch}
                  autoFocus
                />
              </View>
            </View>

            {/* Bank List */}
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredBanks.map((bank) => (
                <TouchableOpacity
                  key={bank.code}
                  onPress={() => {
                    setSelectedBank(bank);
                    setBankSearch("");
                    setShowBankPicker(false);
                  }}
                  className={`px-6 py-4 border-b border-white/5 flex-row justify-between items-center ${
                    selectedBank?.code === bank.code ? "bg-purple-600/20" : ""
                  }`}
                >
                  <Text className="text-white font-medium">{bank.name}</Text>
                  {selectedBank?.code === bank.code && (
                    <Ionicons name="checkmark-circle" size={20} color="#a855f7" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
