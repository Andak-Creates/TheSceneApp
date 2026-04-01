import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  Image,
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
  tier?: {
    name: string;
  };
  party: {
    id: string;
    title: string;
    flyer_url: string;
    date: string | null;
    location: string | null;
    city: string | null;
    date_tba?: boolean;
    location_tba?: boolean;
    currency_code?: string;
    host: {
      username: string;
    };
    host_profile?: {
      name: string;
    };
    party_media?: {
      media_url: string;
      media_type: string;
      thumbnail_url: string | null;
      is_primary: boolean;
    }[];
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
          tier:ticket_tiers (name),
          party:parties (
            id,
            title,
            flyer_url,
            date,
            date_tba,
            location,
            location_tba,
            city,
            currency_code,
            host:profiles!host_id (username),
            host_profile:host_profiles!host_profile_id (name),
            party_media(media_url, media_type, thumbnail_url, is_primary)
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
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

  const isVideoUrl = (url: string) => {
    const lower = url.toLowerCase().split("?")[0];
    return (
      lower.endsWith(".mp4") ||
      lower.endsWith(".mov") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".m4v") ||
      lower.endsWith(".3gp")
    );
  };

  const resolvePreviewUri = (
    flyerUrl: string | null | undefined,
    primaryMedia: any | null | undefined
  ) => {
    if (primaryMedia) {
      if (primaryMedia.media_type === "video" || (primaryMedia.media_url && isVideoUrl(primaryMedia.media_url))) {
        if (primaryMedia.thumbnail_url) {
          return { uri: primaryMedia.thumbnail_url, isThumb: true };
        }
        return null;
      } else if (primaryMedia.media_url) {
        return { uri: primaryMedia.media_url, isThumb: false };
      }
    }

    if (
      flyerUrl &&
      (flyerUrl.startsWith("http") || flyerUrl.startsWith("https"))
    ) {
      if (!isVideoUrl(flyerUrl)) {
        return { uri: flyerUrl, isThumb: false };
      } else if (primaryMedia?.thumbnail_url) {
        return { uri: primaryMedia.thumbnail_url, isThumb: true };
      }
    }
    return null;
  };

  const upcomingTickets = tickets.filter((t) => {
    if (t.party.date_tba || !t.party.date) return true;
    return new Date(t.party.date) >= new Date();
  });

  const pastTickets = tickets.filter((t) => {
    if (t.party.date_tba || !t.party.date) return false;
    return new Date(t.party.date) < new Date();
  });

  const currentTickets =
    activeTab === "upcoming" ? upcomingTickets : pastTickets;

  const captureAndShare = async (ticket: Ticket) => {
    try {
      const qrData = encodeURIComponent(
        JSON.stringify({
          ticketId: ticket.id,
          partyId: ticket.party_id,
          userId: user?.id,
        })
      );
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${qrData}`;

      const dateStr = ticket.party.date_tba
        ? "Date TBA"
        : `${formatDate(ticket.party.date)} • ${formatTime(ticket.party.date)}`;

      const locationStr = ticket.party.location_tba
        ? "Location TBA"
        : `${ticket.party.location}, ${ticket.party.city}`;

      const ticketHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background-color: #f3f4f6;
        color: #111827;
        margin: 0;
        padding: 40px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
      .ticket-container {
        max-width: 550px;
        width: 100%;
        background-color: #ffffff;
        border-radius: 32px;
        padding: 0;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        position: relative;
        border: 1px solid #e5e7eb;
      }
      .flare-strip {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 12px;
        background: linear-gradient(to bottom, #9333ea, #7c3aed);
      }
      .watermark1 {
        position: absolute;
        top: -20px;
        right: -30px;
        transform: rotate(15deg);
        font-size: 180px;
        opacity: 0.04;
        pointer-events: none;
        z-index: 0;
      }
      .watermark2 {
        position: absolute;
        bottom: 15%;
        left: -40px;
        transform: rotate(-10deg);
        font-size: 220px;
        opacity: 0.05;
        pointer-events: none;
        z-index: 0;
      }
      .watermark3 {
        position: absolute;
        top: 45%;
        right: -50px;
        transform: rotate(25deg);
        font-size: 160px;
        opacity: 0.08;
        pointer-events: none;
        z-index: 0;
      }
      .header-section {
        background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
        padding: 25px 40px;
        text-align: center;
        color: white;
        position: relative;
        z-index: 1;
        margin-left: 12px;
      }
      .tier-badge {
        display: inline-block;
        background: rgba(255, 255, 255, 0.25);
        padding: 8px 20px;
        border-radius: 100px;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 10px;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.3);
      }
      .title {
        font-size: 36px;
        font-weight: 900;
        margin-bottom: 10px;
        line-height: 1.1;
        letter-spacing: -0.5px;
      }
      .host {
        font-size: 18px;
        opacity: 0.95;
        font-weight: 500;
      }
      .main-content {
        padding: 0px 40px;
        text-align: center;
        position: relative;
        z-index: 1;
        margin-left: 12px;
      }
      .qr-wrapper {
        background: white;
        padding: 25px;
        border-radius: 28px;
        display: inline-block;
        box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.1);
        margin-bottom: 40px;
        border: 2px solid #f3f4f6;
      }
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 30px;
        text-align: left;
        margin-top: 25px;
        padding-top: 35px;
        border-top: 3px dashed #e5e7eb;
      }
      .info-item .label {
        font-size: 12px;
        text-transform: uppercase;
        color: #4b5563; /* Darker gray for better contrast */
        letter-spacing: 1px;
        font-weight: 800;
        margin-bottom: 6px;
      }
      .info-item .value {
        font-size: 16px;
        color: #111827; /* Dark black */
        font-weight: 700;
      }
      .footer-strip {
        background: #f9fafb;
        padding: 20px 40px;
        text-align: center;
        font-size: 12px;
        color: #374151; /* Much darker gray for readability */
        border-top: 1px solid #e5e7eb;
        margin-left: 12px;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="ticket-container">
      <div class="flare-strip"></div>
      <div class="watermark1">🌺</div>
      <div class="watermark2">🌺</div>
      <div class="watermark3">🌺</div>
      
      <div class="header-section">
        <div class="tier-badge">${ticket.tier?.name || "General Admission"}</div>
        <div class="title">${ticket.party.title}</div>
        <div class="host">Hosted by ${ticket.party.host_profile?.name || ticket.party.host.username}</div>
      </div>
      
      <div class="main-content">
        <div class="qr-wrapper">
          <img src="${qrUrl}" width="320" height="320" />
        </div>
        
        <div class="info-grid">
          <div class="info-item">
            <div class="label">Date & Time</div>
            <div class="value">${dateStr}</div>
          </div>
          <div class="info-item">
            <div class="label">Location</div>
            <div class="value">${locationStr}</div>
          </div>
          <div class="info-item">
            <div class="label">Ticket ID</div>
            <div class="value" style="font-family: monospace; font-size: 14px;">#${ticket.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div class="info-item">
            <div class="label">Purchased On</div>
            <div class="value">${formatDate(ticket.purchased_at)}</div>
          </div>
        </div>
      </div>
      
      <div class="footer-strip">
        Please present this ticket at the entrance. Each QR code is valid for ${ticket.quantity_purchased} person(s).
      </div>
    </div>
  </body>
</html>
      `;


      const { uri } = await Print.printToFileAsync({
        html: ticketHtml,
        base64: false,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Ticket",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error sharing ticket:", error);
      Alert.alert("Error", "Failed to share ticket.");
    }
  };

  const handleShareTicket = (ticket: Ticket) => {
    if (ticket.quantity_purchased > 1) {
      Alert.alert(
        "Warning",
        "Only share with trusted people. This QR code is not unique per person, if someone else uses it before you, you could lose access to the event.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Proceed", onPress: () => captureAndShare(ticket) },
        ]
      );
    } else {
      captureAndShare(ticket);
    }
  };

  const renderTicketCard = ({ item: ticket }: { item: Ticket }) => {
    const isExpanded = expandedTicket === ticket.id;
    const isPast =
      !ticket.party.date_tba &&
      ticket.party.date &&
      new Date(ticket.party.date) < new Date();

    const mediaRows: any[] = ticket.party.party_media || [];
    const primaryMedia =
      mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
    const preview = resolvePreviewUri(
      ticket.party.flyer_url,
      primaryMedia
    );
    const currencySymbol = getCurrencySymbol(ticket.party.currency_code || "NGN");

    return (
      <View className="mb-4 bg-white/5 rounded-2xl overflow-hidden">
        {/* Ticket Header */}
        <TouchableOpacity
          onPress={() => setExpandedTicket(isExpanded ? null : ticket.id)}
          activeOpacity={0.8}
        >
          <View className="flex-row p-4">
            {preview ? (
              <View>
                <Image
                  source={{ uri: preview.uri }}
                  className="w-20 h-24 rounded-xl"
                  resizeMode="cover"
                />
                {preview.isThumb && (
                  <View className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
                    <Ionicons name="videocam" size={10} color="#fff" />
                  </View>
                )}
              </View>
            ) : (
              <View className="w-20 h-24 rounded-xl bg-gray-800 items-center justify-center">
                <Ionicons name="image-outline" size={24} color="#444" />
              </View>
            )}
            <View className="ml-4 flex-1">
              <Text
                className="text-white font-bold text-base mb-1"
                numberOfLines={2}
              >
                {ticket.party.title}
              </Text>
              <Text className="text-gray-400 text-sm mb-2">
                by {ticket.party.host_profile?.name || ticket.party.host.username} • {ticket.tier?.name || "General"}
              </Text>

              <View className="flex-row items-center mb-1">
                <Ionicons name="calendar-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1">
                  {ticket.party.date_tba
                    ? "Date TBA"
                    : `${formatDate(ticket.party.date)} • ${formatTime(ticket.party.date)}`}
                </Text>
              </View>

              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-xs ml-1" numberOfLines={1}>
                  {ticket.party.location_tba
                    ? "Location TBA"
                    : `${ticket.party.location}, ${ticket.party.city}`}
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
          <View className="border-t border-white/10 p-4 bg-[#191022]">
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
                <Text className="text-gray-400 text-sm">Ticket Tier</Text>
                <Text className="text-white text-sm font-bold">
                  {ticket.tier?.name || "General Admission"}
                </Text>
              </View>

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
                  {currencySymbol}{ticket.purchase_price.toLocaleString()}
                </Text>
              </View>

              <View className="flex-row justify-between mb-2">
                <Text className="text-gray-400 text-sm">Service Fee</Text>
                <Text className="text-white text-sm">
                  {currencySymbol}{ticket.service_fee.toLocaleString()}
                </Text>
              </View>

              <View className="flex-row justify-between pt-2 border-t border-white/10">
                <Text className="text-white font-bold">Total Paid</Text>
                <Text className="text-purple-400 font-bold">
                  {currencySymbol}{ticket.total_paid.toLocaleString()}
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

              <TouchableOpacity 
                className="flex-1 bg-white/10 py-3 rounded-xl items-center"
                onPress={() => handleShareTicket(ticket)}
              >
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
          <View className="items-center justify-center py-20 px-10">
            <View className="w-24 h-24 rounded-full bg-white/5 items-center justify-center mb-8 border border-white/5">
              <Ionicons name="ticket" size={48} color="#a855f7" />
            </View>
            <Text className="text-white text-2xl font-extrabold mb-3 text-center">
              No {activeTab} tickets
            </Text>
            <Text className="text-gray-500 text-base text-center leading-6 mb-8">
              {activeTab === "upcoming"
                ? "Experience the vibe! Once you get tickets to a party, they'll appear here for easy access."
                : "Looking back? Your history of attended parties will be stored safely here."}
            </Text>
            {activeTab === "upcoming" && (
              <TouchableOpacity
                className="bg-white py-4 px-10 rounded-2xl shadow-xl shadow-white/10"
                activeOpacity={0.8}
                onPress={() => router.push("/(app)/feed")}
              >
                <Text className="text-black font-extrabold text-base">Explore Parties</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}
