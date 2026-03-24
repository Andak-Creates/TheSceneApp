import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getAvailableCurrencies, getCurrencySymbol } from "../lib/currency";

interface CurrencySelectorProps {
  selectedCurrency: string;
  onSelect: (currency: string) => void;
}

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  CNY: "Chinese Yuan",
  INR: "Indian Rupee",
  NGN: "Nigerian Naira",
  KES: "Kenyan Shilling",
  ZAR: "South African Rand",
  GHS: "Ghanaian Cedi",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
};

// Only NGN is supported until Paystack account is fully verified
const SUPPORTED_CURRENCIES = ["NGN"];

export default function CurrencySelector({
  selectedCurrency,
  onSelect,
}: CurrencySelectorProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadCurrencies();
  }, []);

  const loadCurrencies = async () => {
    const available = await getAvailableCurrencies();
    setCurrencies(available);
  };

  const filteredCurrencies = currencies.filter(
    (code) =>
      code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      CURRENCY_NAMES[code]?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelect = (currency: string) => {
    if (!SUPPORTED_CURRENCIES.includes(currency)) return;
    onSelect(currency);
    setModalVisible(false);
    setSearchQuery("");
  };

  return (
    <>
      {/* Selector Button */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
      >
        <View className="flex-row items-center">
          <Text className="text-white text-2xl mr-2">
            {getCurrencySymbol(selectedCurrency)}
          </Text>
          <View>
            <Text className="text-white font-semibold">{selectedCurrency}</Text>
            <Text className="text-gray-400 text-xs">
              {CURRENCY_NAMES[selectedCurrency] || selectedCurrency}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color="#9ca3af" />
      </TouchableOpacity>

      {/* Notice below selector */}
      <View className="flex-row items-center mt-2 px-1 gap-1.5">
        <Ionicons name="information-circle-outline" size={14} color="#a855f7" />
        <Text className="text-purple-400 text-xs">
          Only NGN is supported currently. More currencies coming soon.
        </Text>
      </View>

      {/* Currency Selection Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 bg-black/50">
          <TouchableOpacity
            className="flex-1"
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />

          <View
            className="bg-[#191022] rounded-t-3xl"
            style={{ height: "70%" }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-white/10">
              <Text className="text-white text-lg font-bold">
                Select Currency
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Coming Soon Banner */}
            <View className="mx-6 mt-4 mb-1 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 flex-row items-center gap-3">
              <Ionicons name="lock-closed-outline" size={18} color="#a855f7" />
              <Text className="text-purple-300 text-xs flex-1">
                Only NGN is available right now. Other currencies will be
                unlocked once our payment account is fully verified.
              </Text>
            </View>

            {/* Search */}
            <View className="px-6 py-3">
              <View className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center">
                <Ionicons name="search" size={20} color="#9ca3af" />
                <TextInput
                  className="flex-1 ml-2 text-white"
                  placeholder="Search currencies..."
                  placeholderTextColor="#666"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>

            {/* Currency List */}
            <FlatList
              data={filteredCurrencies}
              keyExtractor={(item) => item}
              contentContainerStyle={{ paddingHorizontal: 24 }}
              renderItem={({ item }) => {
                const isSupported = SUPPORTED_CURRENCIES.includes(item);
                return (
                  <TouchableOpacity
                    onPress={() => handleSelect(item)}
                    disabled={!isSupported}
                    className={`py-4 border-b border-white/10 flex-row items-center justify-between ${
                      item === selectedCurrency ? "bg-purple-600/20" : ""
                    } ${!isSupported ? "opacity-40" : ""}`}
                  >
                    <View className="flex-row items-center flex-1">
                      <Text className="text-white text-2xl mr-3">
                        {getCurrencySymbol(item)}
                      </Text>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-white font-semibold">
                            {item}
                          </Text>
                          {!isSupported && (
                            <View className="bg-white/10 px-2 py-0.5 rounded-full">
                              <Text className="text-gray-400 text-[10px] font-medium">
                                Soon
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-gray-400 text-sm">
                          {CURRENCY_NAMES[item] || item}
                        </Text>
                      </View>
                    </View>
                    {item === selectedCurrency && (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color="#8B5CF6"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-20 items-center">
                  <Ionicons name="search-outline" size={48} color="#666" />
                  <Text className="text-gray-400 mt-3">
                    No currencies found
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
