import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PaystackProvider, usePaystack } from "react-native-paystack-webview";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

const PAYSTACK_PUBLIC_KEY = process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string | null;
  location: string | null;
  city: string | null;
  currency_code?: string;
  host_id: string;
  host?: {
    username: string;
  };
  host_profile?: {
    name: string;
  };
  media?: {
    media_url: string;
    media_type: string;
    thumbnail_url: string | null;
    is_primary: boolean;
  }[];
  show_ticket_count?: boolean;
  community_link?: string | null;
  community_platform?: string | null;
}

interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantity_sold: number;
  available: number;
  max_per_order?: number | null;
}

// App fee: 5% of ticket subtotal
const APP_FEE_PERCENTAGE = 0.05;

// Paystack supported currencies
const PAYSTACK_CURRENCIES = ["NGN", "GHS", "USD", "ZAR", "KES", "XOF"];

export default function TicketPurchaseScreen() {
  const [channels, setChannels] = useState<any[]>(["card", "bank_transfer"]);

  return (
    <PaystackProvider
      publicKey={PAYSTACK_PUBLIC_KEY}
      defaultChannels={channels}
    >
      <InnerTicketPurchaseScreen setChannels={setChannels} />
    </PaystackProvider>
  );
}

function InnerTicketPurchaseScreen({
  setChannels,
}: {
  setChannels: (c: any[]) => void;
}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const { popup } = usePaystack();
  const partyId = params.id as string;

  const [party, setParty] = useState<Party | null>(null);
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Inside the component:
  const { setFeedActive } = useAudioStore();

  useFocusEffect(
    useCallback(() => {
      setFeedActive(false);
      return () => {
        setFeedActive(true);
      };
    }, []),
  );

  // Store pending purchase data for use in Paystack callbacks
  const pendingPurchase = useRef<{
    tierId: string;
    tierName: string;
    quantity: number;
    ticketPrice: number;
    appFee: number;
    totalPrice: number;
  } | null>(null);

  useEffect(() => {
    if (partyId) {
      fetchPartyAndTickets();
    }
  }, [partyId]);

  const fetchPartyAndTickets = async () => {
    try {
      const { data: partyData, error: partyError } = await supabase
        .from("parties")
        .select(
          `
          *,
          host:profiles!host_id (username),
          host_profile:host_profiles!host_profile_id (name),
          media:party_media(media_url, media_type, thumbnail_url, is_primary)
        `,
        )
        .eq("id", partyId)
        .single();

      if (partyError) throw partyError;
      setParty(partyData);

      const { data: tiersData, error: tiersError } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("party_id", partyId)
        .eq("is_active", true)
        .order("tier_order", { ascending: true });

      if (tiersError) throw tiersError;

      const tiers: TicketTier[] = (tiersData || []).map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        quantity: tier.quantity,
        quantity_sold: tier.quantity_sold || 0,
        available: tier.quantity - (tier.quantity_sold || 0),
        max_per_order: tier.max_per_order,
      }));

      setTicketTiers(tiers);
      if (tiers.length > 0) {
        const firstAvailable = tiers.find((t) => t.available > 0);
        setSelectedTier(firstAvailable ? firstAvailable.id : tiers[0].id);
      }
    } catch (error) {
      console.error("Error fetching party:", error);
      Alert.alert("Error", "Failed to load ticket information");
    } finally {
      setLoading(false);
    }
  };

  const handleInitiatePurchase = () => {
    if (!user || !selectedTier || !party) return;

    const tier = ticketTiers.find((t) => t.id === selectedTier);
    if (!tier) return;

    if (quantity > tier.available) {
      Alert.alert("Error", "Not enough tickets available");
      return;
    }
    const maxLimit = tier.max_per_order ?? 999999;
    if (quantity > maxLimit) {
      Alert.alert(
        "Error",
        `Max ${tier.max_per_order} tickets per order for this tier`,
      );
      return;
    }

    const ticketPrice = tier.price * quantity;
    const appFee = ticketPrice * APP_FEE_PERCENTAGE;
    const totalPrice = ticketPrice + appFee;

    // Handle Free Tickets (0 Naira/Currency)
    if (totalPrice === 0) {
      handlePurchase("free");
      return;
    }

    setShowPaymentModal(true);
  };

  const handlePurchase = async (channel: string) => {
    if (!user || !selectedTier || !party) return;

    const tier = ticketTiers.find((t) => t.id === selectedTier);
    if (!tier) return;

    const ticketPrice = tier.price * quantity;
    const appFee = ticketPrice * APP_FEE_PERCENTAGE;
    const totalPrice = ticketPrice + appFee;

    // Determine currency — alert if unsupported instead of silently falling back to NGN
    const partyCurrency = party.currency_code || "NGN";
    if (!PAYSTACK_CURRENCIES.includes(partyCurrency)) {
      Alert.alert(
        "Currency Not Supported",
        `Paystack does not support ${partyCurrency} payments. The host needs to set their party currency to NGN, GHS, USD, ZAR, KES, or XOF.`,
      );
      return;
    }
    const paystackCurrency = partyCurrency;

    // Store for use in success callback
    pendingPurchase.current = {
      tierId: selectedTier,
      tierName: tier.name,
      quantity,
      ticketPrice,
      appFee,
      totalPrice,
    };

    setShowPaymentModal(false);
    setPurchasing(true);

    const amountInSmallestUnit = totalPrice;

    // Handle Free Tickets (0 Naira/Currency)
    if (totalPrice === 0) {
      try {
        await handlePaymentSuccess("FREE_TICKET_" + Date.now());
        return;
      } catch (error) {
        setPurchasing(false);
        console.error("Free ticket success error:", error);
        Alert.alert("Error", "Failed to process free ticket.");
        return;
      }
    }

    // PRE-RESERVE capacity BEFORE opening Paystack.
    // This prevents two users from both paying for the last ticket simultaneously.
    const { data: capacityResult, error: capacityError } = await supabase.rpc(
      "purchase_tickets_atomic",
      {
        p_tier_id: selectedTier,
        p_quantity: quantity,
      },
    );

    if (capacityError || !capacityResult?.success) {
      const errReason =
        capacityResult?.error || capacityError?.message || "Unknown error";
      let errMsg = "These tickets are no longer available.";
      if (errReason === "sold_out") {
        errMsg = "Sorry, these tickets just sold out!";
      } else if (errReason === "exceeds_limit") {
        errMsg = `Max ${capacityResult.max} tickets per order for this tier.`;
      }
      setPurchasing(false);
      Alert.alert("Cannot Reserve Tickets", errMsg);
      await fetchPartyAndTickets(); // refresh UI to show updated availability
      return;
    }

    try {
      popup.checkout({
        email: user.email || "",
        amount: amountInSmallestUnit,
        currency: paystackCurrency,
        channels: ["card", "bank_transfer"],
        reference: `TK_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        metadata: {
          party_id: partyId,
          party_title: party.title,
          tier_id: selectedTier,
          tier_name: tier.name,
          quantity,
          custom_fields: [
            {
              display_name: "Party",
              variable_name: "party_title",
              value: party.title,
            },
            {
              display_name: "Ticket Type",
              variable_name: "tier_name",
              value: tier.name,
            },
            {
              display_name: "Quantity",
              variable_name: "quantity",
              value: String(quantity),
            },
          ],
        },
        onSuccess: async (res: any) => {
          const ref = res.transactionRef || res.transaction || res.trans || "";
          await handlePaymentSuccess(ref);
        },
        onCancel: async () => {
          // Release the pre-reserved capacity since user cancelled
          await supabase.rpc("release_tickets_atomic", {
            p_tier_id: selectedTier,
            p_quantity: quantity,
          });
          setPurchasing(false);
          pendingPurchase.current = null;
          Alert.alert("Cancelled", "Your ticket purchase was cancelled.");
        },
        onError: async (error: any) => {
          // Release the pre-reserved capacity since payment failed
          await supabase.rpc("release_tickets_atomic", {
            p_tier_id: selectedTier,
            p_quantity: quantity,
          });
          setPurchasing(false);
          pendingPurchase.current = null;
          console.error("Paystack checkout error:", error);
          Alert.alert(
            "Error",
            "Could not open payment gateway. Please try again.",
          );
        },
        onClose: () => {
          setPurchasing(false);
        },
      } as any);
    } catch (error) {
      // Release pre-reserved capacity if popup itself fails to open
      await supabase.rpc("release_tickets_atomic", {
        p_tier_id: selectedTier,
        p_quantity: quantity,
      });
      console.error("Paystack initiation error:", error);
      setPurchasing(false);
      pendingPurchase.current = null;
      Alert.alert("Error", "Failed to start payment process.");
    }
  };

  const handlePaymentSuccess = async (reference: string) => {
    const purchase = pendingPurchase.current;
    if (!purchase || !user || !party) {
      setPurchasing(false);
      return;
    }

    try {
      // Capacity was already reserved in handlePurchase before opening Paystack.
      // Just insert the ticket directly.
      const { data: ticketData, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          party_id: partyId,
          user_id: user.id,
          ticket_tier_id: purchase.tierId,
          purchase_price: purchase.ticketPrice,
          service_fee: purchase.appFee,
          total_paid: purchase.totalPrice,
          payment_status: "completed",
          reference: reference,
          quantity_purchased: purchase.quantity,
          quantity_used: 0,
        })
        .select()
        .single();

      if (ticketError) {
        // Compensate — release the capacity we reserved since the insert failed
        await supabase.rpc("release_tickets_atomic", {
          p_tier_id: purchase.tierId,
          p_quantity: purchase.quantity,
        });
        throw ticketError;
      }

      // Record earnings for the host
      const { error: earningsError } = await supabase
        .from("host_earnings_logs")
        .insert({
          host_id: party.host_id,
          party_id: partyId,
          ticket_id: ticketData.id,
          amount: purchase.totalPrice,
          fee_amount: purchase.appFee,
          net_amount: purchase.ticketPrice,
          currency: party.currency_code || "NGN",
        });

      if (earningsError) {
        console.error("Error recording host earnings:", earningsError);
        // We don't throw here to avoid preventing the user from seeing their ticket,
        // but it should be logged for manual reconciliation if it fails.
      }

      pendingPurchase.current = null;
      await fetchPartyAndTickets();

      if (party.community_link) {
        Alert.alert(
          "🎉 You're in!",
          `${purchase.quantity} × ${purchase.tierName} ticket${purchase.quantity > 1 ? "s" : ""} for ${party.title}\n\nThe host has a community group for this party. Would you like to join it now?`,
          [
            {
              text: "Join Group",
              onPress: () => {
                Linking.openURL(party.community_link!);
                router.push("/my-tickets");
              },
            },
            {
              text: "Maybe Later",
              onPress: () => router.push("/my-tickets"),
            },
            { text: "Done", onPress: () => router.back() },
          ],
        );
      } else {
        Alert.alert(
          "🎉 You're in!",
          `${purchase.quantity} × ${purchase.tierName} ticket${purchase.quantity > 1 ? "s" : ""} for ${party.title}`,
          [
            {
              text: "View My Tickets",
              onPress: () => router.push("/my-tickets"),
            },
            { text: "Done", onPress: () => router.back() },
          ],
        );
      }
    } catch (error: any) {
      console.error("Ticket creation error:", error);
      const isFree = purchase.totalPrice === 0;
      if (isFree) {
        Alert.alert(
          "Ticket Creation Failed",
          "We had trouble creating your ticket. Please try again or contact support with reference: " +
            reference,
        );
      } else {
        Alert.alert(
          "Payment Received",
          "Your payment was successful but we had trouble creating your ticket. Please contact support with reference: " +
            reference,
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = {
      NGN: "₦",
      USD: "$",
      GBP: "£",
      EUR: "€",
      GHS: "₵",
      KES: "KSh",
      ZAR: "R",
      AUD: "A$",
      CAD: "CA$",
    };
    return symbols[code] || code + " ";
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
  const appFee = subtotal * APP_FEE_PERCENTAGE;
  const total = subtotal + appFee;
  const currencySymbol = getCurrencySymbol(party.currency_code || "NGN");

  return (
    <View className="flex-1 bg-[#191022]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
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
            {(() => {
              let imageSource = null;
              if (party.media && party.media.length > 0) {
                const primary =
                  party.media.find((m: any) => m.is_primary) || party.media[0];
                const isVideo = (url: string) => {
                  const lower = url.toLowerCase().split("?")[0];
                  return (
                    lower.endsWith(".mp4") ||
                    lower.endsWith(".mov") ||
                    lower.endsWith(".webm")
                  );
                };

                if (
                  primary.media_type === "video" ||
                  isVideo(primary.media_url)
                ) {
                  imageSource =
                    (primary as any).thumbnail_url || primary.media_url;
                } else {
                  imageSource = primary.media_url;
                }
              } else {
                imageSource = party.flyer_url;
              }
              return imageSource ? (
                <Image
                  source={{ uri: imageSource }}
                  className="w-20 h-24 rounded-xl"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-20 h-24 rounded-xl bg-gray-800 items-center justify-center">
                  <Ionicons name="image-outline" size={24} color="#666" />
                </View>
              );
            })()}
            <View className="ml-4 flex-1">
              <Text className="text-white font-bold text-lg mb-1">
                {party.title}
              </Text>
              <Text className="text-gray-400 text-sm mb-1">
                by {party.host_profile?.name || party.host?.username}
              </Text>
              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1">
                  {formatDate(party.date)}{" "}
                  {party.date ? `• ${formatTime(party.date)}` : ""}
                </Text>
              </View>
              {party.location && (
                <View className="flex-row items-center">
                  <Ionicons name="location-outline" size={14} color="#9ca3af" />
                  <Text
                    className="text-gray-400 text-xs ml-1"
                    numberOfLines={1}
                  >
                    {party.location}
                    {party.city ? `, ${party.city}` : ""}
                  </Text>
                </View>
              )}
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
              onPress={() => {
                setSelectedTier(tier.id);
                setQuantity(1);
              }}
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
                  {currencySymbol}
                  {tier.price.toLocaleString()}
                </Text>
              </View>
              {tier.available === 0 ? (
                <Text className="text-red-400 text-sm font-semibold">
                  Sold Out
                </Text>
              ) : party?.show_ticket_count ? (
                <Text className="text-gray-400 text-sm">
                  {tier.available} ticket{tier.available !== 1 ? "s" : ""}{" "}
                  available
                </Text>
              ) : (
                <Text className="text-gray-400 text-sm font-semibold">
                  Available
                </Text>
              )}
            </TouchableOpacity>
          ))}

          {/* Quantity Selector */}
          {selectedTierData && selectedTierData.available > 0 && (
            <View className="mt-6">
              <View className="flex-row items-center gap-2 mb-3">
                <Text className="text-white font-bold text-base">Quantity</Text>
                {selectedTierData.max_per_order && (
                  <View className="bg-purple-600/20 px-2 py-1 rounded-md">
                    <Text className="text-purple-400 text-xs font-semibold">
                      Max {selectedTierData.max_per_order}
                    </Text>
                  </View>
                )}
              </View>
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
                      Math.min(
                        selectedTierData.available,
                        selectedTierData.max_per_order ?? 999999,
                        quantity + 1,
                      ),
                    )
                  }
                  className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
                  disabled={
                    quantity >= selectedTierData.available ||
                    !!(
                      selectedTierData.max_per_order &&
                      quantity >= selectedTierData.max_per_order
                    )
                  }
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={
                      quantity >= selectedTierData.available ||
                      (selectedTierData.max_per_order &&
                        quantity >= selectedTierData.max_per_order)
                        ? "#666"
                        : "#fff"
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
                {quantity}× {selectedTierData.name} ({currencySymbol}
                {selectedTierData.price.toLocaleString()} each)
              </Text>
              <Text className="text-white font-semibold">
                {currencySymbol}
                {subtotal.toLocaleString()}
              </Text>
            </View>

            <View className="flex-row justify-between mb-3 pb-3 border-b border-white/10">
              <Text className="text-gray-400">Service Fee (5%)</Text>
              <Text className="text-white font-semibold">
                {currencySymbol}
                {appFee.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-white font-bold text-lg">Total</Text>
              <Text className="text-purple-400 font-bold text-xl">
                {currencySymbol}
                {total.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>

            <Text className="text-gray-600 text-xs mt-3">
              * Paystack processing fees may apply separately
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed Purchase Button */}
      <View className="absolute bottom-0 left-0 right-0 px-6 py-6 border-t border-white/10 bg-[#191022]">
        <TouchableOpacity
          onPress={handleInitiatePurchase}
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
                : `Pay ${currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
            </Text>
          )}
        </TouchableOpacity>

        <Text className="text-gray-500 text-xs text-center mt-3">
          Secured by Paystack • By purchasing you agree to our Terms
        </Text>
      </View>

      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-[#191022] rounded-t-3xl p-6 min-h-[40%] border-t border-white/10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white text-xl font-bold">
                Select Payment Method
              </Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            <Text className="text-gray-400 mb-4">
              How would you like to pay {currencySymbol}
              {total.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
              ?
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                {
                  id: "card",
                  title: "Debit / Credit Card",
                  icon: "card-outline",
                },
                {
                  id: "bank_transfer",
                  title: "Bank Transfer",
                  icon: "swap-horizontal-outline",
                },
              ].map((method) => (
                <TouchableOpacity
                  key={method.id}
                  onPress={() => {
                    setChannels([method.id]);
                    // Tiny delay to ensure state batches and updates context properly
                    setTimeout(() => {
                      handlePurchase(method.id);
                    }, 50);
                  }}
                  className="flex-row items-center bg-white/5 border border-white/10 p-4 rounded-2xl mb-3"
                >
                  <View className="w-10 h-10 rounded-full bg-purple-600/20 items-center justify-center mr-4">
                    <Ionicons
                      name={method.icon as any}
                      size={20}
                      color="#a78bfa"
                    />
                  </View>
                  <Text className="text-white font-semibold text-base flex-1">
                    {method.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
