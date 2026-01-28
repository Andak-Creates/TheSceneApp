import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string;
  location: string;
  city: string;
  host_id: string;
  host?: {
    username: string;
  };
}

interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantity_sold: number;
  available: number;
}

export default function TicketPurchaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const partyId = params.id as string;

  const [party, setParty] = useState<Party | null>(null);
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  const SERVICE_FEE_PERCENTAGE = 0.07; // 7%

  useEffect(() => {
    if (partyId) {
      fetchPartyAndTickets();
    }
  }, [partyId]);

  const fetchPartyAndTickets = async () => {
    try {
      // Fetch party details
      const { data: partyData, error: partyError } = await supabase
        .from("parties")
        .select(
          `
          *,
          host:profiles!host_id (username)
        `,
        )
        .eq("id", partyId)
        .single();

      if (partyError) throw partyError;
      setParty(partyData);

      // ✅ FETCH REAL TICKET TIERS FROM DATABASE
      const { data: tiersData, error: tiersError } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("party_id", partyId)
        .eq("is_active", true)
        .order("tier_order", { ascending: true });

      if (tiersError) throw tiersError;

      // Calculate available tickets for each tier
      const tiers: TicketTier[] = (tiersData || []).map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        quantity: tier.quantity,
        quantity_sold: tier.quantity_sold || 0,
        available: tier.quantity - (tier.quantity_sold || 0),
      }));

      setTicketTiers(tiers);
      if (tiers.length > 0) {
        setSelectedTier(tiers[0].id);
      }
    } catch (error) {
      console.error("Error fetching party:", error);
      Alert.alert("Error", "Failed to load ticket information");
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!user || !selectedTier || !party) return;

    const tier = ticketTiers.find((t) => t.id === selectedTier);
    if (!tier) return;

    if (quantity > tier.available) {
      Alert.alert("Error", "Not enough tickets available");
      return;
    }

    setPurchasing(true);

    try {
      const ticketPrice = tier.price * quantity;
      const serviceFee = ticketPrice * SERVICE_FEE_PERCENTAGE;
      const totalPrice = ticketPrice + serviceFee;

      // ✅ CREATE TICKET WITH TIER REFERENCE
      const { error: ticketError } = await supabase.from("tickets").insert({
        party_id: partyId,
        user_id: user.id,
        ticket_tier_id: selectedTier, // ✅ Link to tier
        purchase_price: ticketPrice,
        service_fee: serviceFee,
        total_paid: totalPrice,
        payment_status: "completed",
        quantity_purchased: quantity,
        quantity_used: 0,
      });

      if (ticketError) throw ticketError;

      // ✅ REFRESH TIERS TO SHOW UPDATED AVAILABILITY
      await fetchPartyAndTickets();

      Alert.alert(
        "Success! 🎉",
        `You've purchased ${quantity} ${tier.name} ticket${quantity > 1 ? "s" : ""} for ${party.title}`,
        [
          {
            text: "View Tickets",
            onPress: () => router.push("/my-tickets"),
          },
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error: any) {
      console.error("Purchase error:", error);
      Alert.alert("Error", "Failed to complete purchase. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!party) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <Text className="text-white">Party not found</Text>
      </View>
    );
  }

  if (ticketTiers.length === 0) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center px-6">
        <Ionicons name="ticket-outline" size={64} color="#666" />
        <Text className="text-white text-xl font-bold mt-4">
          No Tickets Available
        </Text>
        <Text className="text-gray-400 text-center mt-2">
          This party doesn't have any tickets for sale yet
        </Text>
      </View>
    );
  }

  const selectedTierData = ticketTiers.find((t) => t.id === selectedTier);
  const subtotal = selectedTierData ? selectedTierData.price * quantity : 0;
  const serviceFee = subtotal * SERVICE_FEE_PERCENTAGE;
  const total = subtotal + serviceFee;

  return (
    <View className="flex-1 bg-[#191022]">
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="pt-12 px-6 pb-4 flex-row items-center border-b border-white/10">
          <TouchableOpacity onPress={() => router.back()} className="mr-4">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold flex-1">
            Get Tickets
          </Text>
        </View>

        {/* Party Summary */}
        <View className="px-6 py-6 border-b border-white/10">
          <View className="flex-row">
            <Image
              source={{ uri: party.flyer_url }}
              className="w-20 h-24 rounded-xl"
              resizeMode="cover"
            />
            <View className="ml-4 flex-1">
              <Text className="text-white font-bold text-lg mb-1">
                {party.title}
              </Text>
              <Text className="text-gray-400 text-sm mb-1">
                by {party.host?.username}
              </Text>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1">
                  {formatDate(party.date)} • {formatTime(party.date)}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1" numberOfLines={1}>
                  {party.location}, {party.city}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Ticket Tiers */}
        <View className="px-6 py-6">
          <Text className="text-white font-bold text-lg mb-4">
            Select Ticket Type
          </Text>

          {ticketTiers.map((tier) => (
            <TouchableOpacity
              key={tier.id}
              onPress={() => setSelectedTier(tier.id)}
              disabled={tier.available === 0}
              className={`border rounded-2xl p-4 mb-3 ${
                tier.available === 0
                  ? "bg-white/5 border-white/10 opacity-50"
                  : selectedTier === tier.id
                    ? "bg-purple-600/20 border-purple-600"
                    : "bg-white/5 border-white/10"
              }`}
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-white font-bold text-base">
                  {tier.name}
                </Text>
                <Text className="text-purple-400 font-bold text-lg">
                  ₦{tier.price.toLocaleString()}
                </Text>
              </View>
              <Text
                className={
                  tier.available === 0
                    ? "text-red-400 text-sm"
                    : "text-gray-400 text-sm"
                }
              >
                {tier.available === 0
                  ? "Sold Out"
                  : `${tier.available} ticket${tier.available !== 1 ? "s" : ""} available`}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Quantity Selector */}
          {selectedTierData && selectedTierData.available > 0 && (
            <View className="mt-6">
              <Text className="text-white font-bold text-base mb-3">
                Quantity
              </Text>
              <View className="flex-row items-center justify-between bg-white/5 rounded-2xl p-4">
                <TouchableOpacity
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
                  disabled={quantity <= 1}
                >
                  <Ionicons
                    name="remove"
                    size={20}
                    color={quantity <= 1 ? "#666" : "#fff"}
                  />
                </TouchableOpacity>

                <Text className="text-white font-bold text-2xl">
                  {quantity}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    setQuantity(
                      Math.min(selectedTierData.available, quantity + 1),
                    )
                  }
                  className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
                  disabled={quantity >= selectedTierData.available}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={
                      quantity >= selectedTierData.available ? "#666" : "#fff"
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Price Breakdown */}
        {selectedTierData && selectedTierData.available > 0 && (
          <View className="px-6 py-6 bg-white/5 mx-6 rounded-2xl mb-6">
            <Text className="text-white font-bold text-base mb-4">
              Price Breakdown
            </Text>

            <View className="flex-row justify-between mb-2">
              <Text className="text-gray-400">
                Tickets ({quantity}x ₦{selectedTierData.price.toLocaleString()})
              </Text>
              <Text className="text-white font-semibold">
                ₦{subtotal.toLocaleString()}
              </Text>
            </View>

            <View className="flex-row justify-between mb-3 pb-3 border-b border-white/10">
              <Text className="text-gray-400">Service Fee (5%)</Text>
              <Text className="text-white font-semibold">
                ₦{serviceFee.toLocaleString()}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-white font-bold text-lg">Total</Text>
              <Text className="text-purple-400 font-bold text-xl">
                ₦{total.toLocaleString()}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fixed Purchase Button */}
      <View className="px-6 py-6 border-t border-white/10 bg-[#191022]">
        <TouchableOpacity
          onPress={handlePurchase}
          disabled={
            purchasing ||
            !selectedTier ||
            !selectedTierData ||
            selectedTierData.available === 0
          }
          className={`py-4 rounded-xl items-center ${
            !selectedTier ||
            !selectedTierData ||
            selectedTierData.available === 0
              ? "bg-gray-600"
              : "bg-purple-600"
          }`}
          style={
            selectedTier && selectedTierData && selectedTierData.available > 0
              ? {
                  shadowColor: "#8B5CF6",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }
              : {}
          }
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">
              {!selectedTierData || selectedTierData.available === 0
                ? "Sold Out"
                : `Purchase for ₦${total.toLocaleString()}`}
            </Text>
          )}
        </TouchableOpacity>

        <Text className="text-gray-500 text-xs text-center mt-3">
          By purchasing, you agree to our Terms & Conditions
        </Text>
      </View>
    </View>
  );
}
