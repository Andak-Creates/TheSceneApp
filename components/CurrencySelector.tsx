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
      CURRENCY_NAMES[code]?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (currency: string) => {
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
            <Text className="text-white font-semibold">
              {selectedCurrency}
            </Text>
            <Text className="text-gray-400 text-xs">
              {CURRENCY_NAMES[selectedCurrency] || selectedCurrency}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color="#9ca3af" />
      </TouchableOpacity>

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

          <View className="bg-[#191022] rounded-t-3xl" style={{ height: "70%" }}>
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 border-b border-white/10">
              <Text className="text-white text-lg font-bold">
                Select Currency
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
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
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelect(item)}
                  className={`py-4 border-b border-white/10 flex-row items-center justify-between ${
                    item === selectedCurrency ? "bg-purple-600/20" : ""
                  }`}
                >
                  <View className="flex-row items-center flex-1">
                    <Text className="text-white text-2xl mr-3">
                      {getCurrencySymbol(item)}
                    </Text>
                    <View className="flex-1">
                      <Text className="text-white font-semibold">{item}</Text>
                      <Text className="text-gray-400 text-sm">
                        {CURRENCY_NAMES[item] || item}
                      </Text>
                    </View>
                  </View>
                  {item === selectedCurrency && (
                    <Ionicons name="checkmark-circle" size={24} color="#8B5CF6" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className="py-20 items-center">
                  <Ionicons name="search-outline" size={48} color="#666" />
                  <Text className="text-gray-400 mt-3">No currencies found</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
