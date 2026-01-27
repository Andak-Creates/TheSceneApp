import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface Ticket {
  id: string;
  party_id: string;
  purchase_price: number;
  service_fee: number;
  total_paid: number;
  payment_status: string;
  purchased_at: string;
  quantity_purchased: number;
  quantity_used: number;
  party: {
    id: string;
    title: string;
    flyer_url: string;
    date: string;
    location: string;
    city: string;
    host: {
      username: string;
    };
  };
}

type TabType = "upcoming" | "past";

export default function MyTicketsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          `
          *,
          party:parties (
            id,
            title,
            flyer_url,
            date,
            location,
            city,
            host:profiles!host_id (username)
          )
        `,
        )
        .eq("user_id", user.id)
        .eq("payment_status", "completed")
        .order("purchased_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
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

  const upcomingTickets = tickets.filter(
    (t) => new Date(t.party.date) >= new Date(),
  );
  const pastTickets = tickets.filter(
    (t) => new Date(t.party.date) < new Date(),
  );

  const currentTickets =
    activeTab === "upcoming" ? upcomingTickets : pastTickets;

  const renderTicketCard = ({ item: ticket }: { item: Ticket }) => {
    const isExpanded = expandedTicket === ticket.id;
    const isPast = new Date(ticket.party.date) < new Date();

    return (
      <View className="mb-4 bg-white/5 rounded-2xl overflow-hidden">
        {/* Ticket Header */}
        <TouchableOpacity
          onPress={() => setExpandedTicket(isExpanded ? null : ticket.id)}
          activeOpacity={0.8}
        >
          <View className="flex-row p-4">
            <Image
              source={{ uri: ticket.party.flyer_url }}
              className="w-20 h-24 rounded-xl"
              resizeMode="cover"
            />
            <View className="ml-4 flex-1">
              <Text
                className="text-white font-bold text-base mb-1"
                numberOfLines={2}
              >
                {ticket.party.title}
              </Text>
              <Text className="text-gray-400 text-sm mb-2">
                by {ticket.party.host.username}
              </Text>

              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1">
                  {formatDate(ticket.party.date)} •{" "}
                  {formatTime(ticket.party.date)}
                </Text>
              </View>

              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1" numberOfLines={1}>
                  {ticket.party.location}, {ticket.party.city}
                </Text>
              </View>
            </View>

            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={24}
              color="#666"
            />
          </View>

          {/* Status Badge */}
          {/* Status Badge */}
          <View className="px-4 pb-3 flex-row items-center justify-between">
            <View>
              {isPast ? (
                <View className="bg-gray-600/20 px-3 py-2 rounded-full">
                  <Text className="text-gray-400 text-xs font-bold">
                    ATTENDED
                  </Text>
                </View>
              ) : ticket.quantity_used >= ticket.quantity_purchased ? (
                <View className="bg-red-600/20 px-3 py-2 rounded-full">
                  <Text className="text-red-400 text-xs font-bold">
                    FULLY USED
                  </Text>
                </View>
              ) : (
                <View className="bg-green-600/20 px-3 py-2 rounded-full">
                  <Text className="text-green-400 text-xs font-bold">
                    VALID TICKET
                  </Text>
                </View>
              )}
            </View>

            {/* Usage Counter */}
            <View className="bg-purple-600/20 px-3 py-2 rounded-full">
              <Text className="text-purple-400 text-xs font-bold">
                {ticket.quantity_used}/{ticket.quantity_purchased} USED
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Expanded Content */}
        {isExpanded && (
          <View className="border-t border-white/10 p-4">
            {/* QR Code */}
            <View className="items-center py-6 mb-4">
              <View className="bg-white p-4 rounded-2xl">
                <QRCode
                  value={JSON.stringify({
                    ticketId: ticket.id,
                    partyId: ticket.party_id,
                    userId: user?.id,
                  })}
                  size={180}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </View>
              <Text className="text-gray-400 text-xs mt-3">
                Show this QR code at the entrance
              </Text>
            </View>

            {/* Ticket Details */}
            <View className="bg-white/5 rounded-xl p-4 mb-4">
              <Text className="text-white font-bold mb-3">Ticket Details</Text>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Ticket ID</Text>
                <Text className="text-white text-sm font-mono">
                  #{ticket.id.slice(0, 8).toUpperCase()}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Purchase Date</Text>
                <Text className="text-white text-sm">
                  {formatDate(ticket.purchased_at)}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Tickets Purchased</Text>
                <Text className="text-white text-sm font-bold">
                  {ticket.quantity_purchased}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Check-ins Used</Text>
                <Text
                  className={`text-sm font-bold ${
                    ticket.quantity_used >= ticket.quantity_purchased
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {ticket.quantity_used}/{ticket.quantity_purchased}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Ticket Price</Text>
                <Text className="text-white text-sm">
                  ₦{ticket.purchase_price.toLocaleString()}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Service Fee</Text>
                <Text className="text-white text-sm">
                  ₦{ticket.service_fee.toLocaleString()}
                </Text>
              </View>

              <View className="flex-row justify-between pt-2 border-t border-white/10">
                <Text className="text-white font-bold">Total Paid</Text>
                <Text className="text-purple-400 font-bold">
                  ₦{ticket.total_paid.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 bg-purple-600 py-3 rounded-xl items-center"
                onPress={() =>
                  router.push({
                    pathname: "/party/[id]",
                    params: { id: ticket.party_id },
                  })
                }
              >
                <Text className="text-white font-semibold">View Party</Text>
              </TouchableOpacity>

              <TouchableOpacity className="flex-1 bg-white/10 py-3 rounded-xl items-center">
                <Text className="text-white font-semibold">Share Ticket</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 pb-3 px-6 border-b border-white/10">
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold">My Tickets</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View className="flex-row">
          <TouchableOpacity
            onPress={() => setActiveTab("upcoming")}
            className={`flex-1 pb-3 ${
              activeTab === "upcoming" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "upcoming" ? "text-white" : "text-gray-400"
              }`}
            >
              Upcoming ({upcomingTickets.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("past")}
            className={`flex-1 pb-3 ${
              activeTab === "past" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "past" ? "text-white" : "text-gray-400"
              }`}
            >
              Past ({pastTickets.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tickets List */}
      <FlatList
        data={currentTickets}
        renderItem={renderTicketCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8B5CF6"
          />
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-4">
              <Ionicons name="ticket-outline" size={40} color="#666" />
            </View>
            <Text className="text-gray-400 text-lg mb-2">
              No {activeTab} tickets
            </Text>
            <Text className="text-gray-600 text-sm text-center px-8 mb-6">
              {activeTab === "upcoming"
                ? "Get tickets to parties and they'll show up here"
                : "Tickets for attended parties will appear here"}
            </Text>
            {activeTab === "upcoming" && (
              <TouchableOpacity
                className="bg-purple-600 px-6 py-3 rounded-full"
                onPress={() => router.push("/(app)/feed")}
              >
                <Text className="text-white font-semibold">Browse Parties</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}
