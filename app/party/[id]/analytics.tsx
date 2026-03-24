import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

interface PartyAnalytics {
  party: {
    id: string;
    title: string;
    flyer_url: string;
    date: string;
    location: string;
    city: string;
  };
  ticketStats: {
    totalCapacity: number;
    totalSold: number;
    totalRevenue: number;
    totalCheckedIn: number;
    checkInRate: number;
  };
  tierStats: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    sold: number;
    revenue: number;
    checkedIn: number;
  }[];
  attendees: {
    id: string;
    user_id: string;
    buyer_name: string;
    buyer_avatar: string | null;
    quantity_purchased: number;
    quantity_used: number;
    purchased_at: string;
    total_paid: number;
    tier_name: string;
    last_check_in: string | null;
  }[];
  checkInTimeline: {
    hour: string;
    count: number;
  }[];
  recentCheckIns: {
    id: string;
    buyer_name: string;
    buyer_avatar: string | null;
    checked_in_at: string;
    scan_number: number;
  }[];
}

type Tab = "overview" | "attendees" | "timeline";

export default function PartyAnalyticsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const params = useLocalSearchParams();
  const partyId = params.id as string;

  const [analytics, setAnalytics] = useState<PartyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [attendeeFilter, setAttendeeFilter] = useState<
    "all" | "checked-in" | "not-checked-in"
  >("all");

  useEffect(() => {
    fetchAnalytics();
  }, [partyId]);

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

  const fetchAnalytics = async () => {
    if (!user) return;

    try {
      // Fetch party details
      const { data: party, error: partyError } = await supabase
        .from("parties")
        .select("id, title, flyer_url, date, location, city, host_id")
        .eq("id", partyId)
        .single();

      if (partyError) throw partyError;

      // Verify user is the host
      if (party.host_id !== user.id) {
        router.back();
        return;
      }

      // Fetch ticket tiers with stats
      const { data: tiers, error: tiersError } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("party_id", partyId)
        .eq("is_active", true)
        .order("tier_order", { ascending: true });

      if (tiersError) throw tiersError;

      // Fetch all tickets for this party
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select(
          `
          id,
          user_id,
          quantity_purchased,
          quantity_used,
          purchased_at,
          total_paid,
          ticket_tier_id,
          profiles:user_id (
            username,
            full_name,
            avatar_url
          )
        `,
        )
        .eq("party_id", partyId)
        .eq("payment_status", "completed");

      if (ticketsError) throw ticketsError;

      // Fetch check-in records
      const ticketIds = tickets?.map((t) => t.id) || [];
      const { data: checkIns, error: checkInsError } = await supabase
        .from("ticket_check_ins")
        .select("*")
        .in("ticket_id", ticketIds)
        .order("checked_in_at", { ascending: false });

      if (checkInsError) throw checkInsError;

      // Calculate tier stats
      const tierStats = (tiers || []).map((tier) => {
        const tierTickets =
          tickets?.filter((t) => t.ticket_tier_id === tier.id) || [];
        const tierCheckIns = tierTickets.reduce((sum, ticket) => {
          return (
            sum +
            (checkIns?.filter((ci) => ci.ticket_id === ticket.id).length || 0)
          );
        }, 0);

        return {
          id: tier.id,
          name: tier.name,
          price: tier.price,
          quantity: tier.quantity,
          sold: tier.quantity_sold || 0,
          revenue: tier.price * (tier.quantity_sold || 0),
          checkedIn: tierCheckIns,
        };
      });

      // Calculate overall stats
      const totalCapacity = tierStats.reduce((sum, t) => sum + t.quantity, 0);
      const totalSold = tierStats.reduce((sum, t) => sum + t.sold, 0);
      const totalRevenue = tierStats.reduce((sum, t) => sum + t.revenue, 0);
      const totalCheckedIn = checkIns?.length || 0;
      const checkInRate =
        totalSold > 0 ? (totalCheckedIn / totalSold) * 100 : 0;

      // Build attendees list
      const attendees = (tickets || [])
        .map((ticket) => {
          const lastCheckIn = checkIns?.find(
            (ci) => ci.ticket_id === ticket.id,
          );
          const tier = tiers?.find((t) => t.id === ticket.ticket_tier_id);

          return {
            id: ticket.id,
            user_id: ticket.user_id,
            buyer_name:
              (ticket.profiles as any)?.full_name ||
              (ticket.profiles as any)?.username ||
              "Unknown",
            buyer_avatar: (ticket.profiles as any)?.avatar_url || null,
            quantity_purchased: ticket.quantity_purchased,
            quantity_used: ticket.quantity_used,
            purchased_at: ticket.purchased_at,
            total_paid: ticket.total_paid,
            tier_name: tier?.name || "General",
            last_check_in: lastCheckIn?.checked_in_at || null,
          };
        })
        .sort((a, b) => {
          // Sort by check-in status, then by purchase date
          if (a.quantity_used > 0 && b.quantity_used === 0) return -1;
          if (a.quantity_used === 0 && b.quantity_used > 0) return 1;
          return (
            new Date(b.purchased_at).getTime() -
            new Date(a.purchased_at).getTime()
          );
        });

      // Build check-in timeline (hourly)
      const timeline: { [key: string]: number } = {};
      checkIns?.forEach((checkIn) => {
        const hour = new Date(checkIn.checked_in_at).getHours();
        const hourKey = `${hour}:00`;
        timeline[hourKey] = (timeline[hourKey] || 0) + 1;
      });

      const checkInTimeline = Object.entries(timeline)
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

      // Recent check-ins
      const recentCheckIns = (checkIns || []).slice(0, 10).map((checkIn) => {
        const ticket = tickets?.find((t) => t.id === checkIn.ticket_id);
        return {
          id: checkIn.id,
          buyer_name:
            (ticket?.profiles as any)?.full_name ||
            (ticket?.profiles as any)?.username ||
            "Unknown",
          buyer_avatar: (ticket?.profiles as any)?.avatar_url || null,
          checked_in_at: checkIn.checked_in_at,
          scan_number: checkIn.scan_number,
        };
      });

      setAnalytics({
        party,
        ticketStats: {
          totalCapacity,
          totalSold,
          totalRevenue,
          totalCheckedIn,
          checkInRate,
        },
        tierStats,
        attendees,
        checkInTimeline,
        recentCheckIns,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  const exportGuestList = async () => {
    if (!analytics || analytics.attendees.length === 0) {
      Alert.alert("No Data", "There are no attendees to export.");
      return;
    }

    try {
      const headers = ["Name", "Tier", "Purchased", "Used", "Total Paid", "Purchase Date", "Last Check In"];
      const rows = analytics.attendees.map(a => [
        `"${a.buyer_name.replace(/"/g, '""')}"`,
        `"${a.tier_name}"`,
        a.quantity_purchased,
        a.quantity_used,
        a.total_paid,
        `"${new Date(a.purchased_at).toLocaleString()}"`,
        a.last_check_in ? `"${new Date(a.last_check_in).toLocaleString()}"` : '"Not checked in"'
      ]);

      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

      const filename = `guest_list_${analytics.party.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Export Guest List"
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (e) {
      console.error("Export error:", e);
      Alert.alert("Error", "Could not export guest list.");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getFilteredAttendees = () => {
    if (!analytics) return [];

    switch (attendeeFilter) {
      case "checked-in":
        return analytics.attendees.filter((a) => a.quantity_used > 0);
      case "not-checked-in":
        return analytics.attendees.filter((a) => a.quantity_used === 0);
      default:
        return analytics.attendees;
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!analytics) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <Text className="text-white">Analytics not available</Text>
      </View>
    );
  }

  const filteredAttendees = getFilteredAttendees();

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 pb-3 px-6 border-b border-white/10">
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text
            className="text-white text-xl font-bold flex-1 ml-4"
            numberOfLines={1}
          >
            {analytics.party.title}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View className="flex-row">
          <TouchableOpacity
            onPress={() => setActiveTab("overview")}
            className={`flex-1 pb-3 ${
              activeTab === "overview" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "overview" ? "text-white" : "text-gray-400"
              }`}
            >
              Overview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("attendees")}
            className={`flex-1 pb-3 ${
              activeTab === "attendees" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "attendees" ? "text-white" : "text-gray-400"
              }`}
            >
              Attendees ({analytics.attendees.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("timeline")}
            className={`flex-1 pb-3 ${
              activeTab === "timeline" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "timeline" ? "text-white" : "text-gray-400"
              }`}
            >
              Timeline
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8B5CF6"
          />
        }
      >
        {activeTab === "overview" && (
          <View className="px-6 py-6">
            {/* Party Info Card */}
            <View className="bg-white/5 rounded-2xl p-4 mb-6">
              <View className="flex-row">
                <Image
                  source={{ uri: analytics.party.flyer_url }}
                  className="w-20 h-24 rounded-xl"
                />
                <View className="ml-4 flex-1">
                  <Text className="text-white font-bold text-base mb-1">
                    {analytics.party.title}
                  </Text>
                  <Text className="text-gray-400 text-sm mb-1">
                    {formatDate(analytics.party.date)}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {analytics.party.location}, {analytics.party.city}
                  </Text>
                </View>
              </View>
            </View>

            {/* Key Metrics */}
            <Text className="text-white font-bold text-lg mb-4">
              Key Metrics
            </Text>

            {/* Revenue Card */}
            <View className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl p-6 mb-4">
              <Text className="text-purple-200 text-sm mb-1">
                Total Revenue
              </Text>
              <Text className="text-white text-4xl font-bold mb-2">
                ₦{analytics.ticketStats.totalRevenue.toLocaleString()}
              </Text>
              <Text className="text-purple-200 text-sm">
                From {analytics.ticketStats.totalSold} tickets sold
              </Text>
            </View>

            {/* Stats Grid */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1 bg-white/5 rounded-2xl p-4">
                <Ionicons name="ticket" size={24} color="#8B5CF6" />
                <Text className="text-white text-2xl font-bold mt-2">
                  {analytics.ticketStats.totalSold}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  of {analytics.ticketStats.totalCapacity}
                </Text>
                <Text className="text-gray-500 text-xs">Sold</Text>
              </View>

              <View className="flex-1 bg-white/5 rounded-2xl p-4">
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <Text className="text-white text-2xl font-bold mt-2">
                  {analytics.ticketStats.totalCheckedIn}
                </Text>
                <Text className="text-gray-400 text-xs mt-1">
                  {analytics.ticketStats.checkInRate.toFixed(0)}% rate
                </Text>
                <Text className="text-gray-500 text-xs">Checked In</Text>
              </View>
            </View>

            {/* Tier Breakdown */}
            <Text className="text-white font-bold text-lg mb-4 mt-6">
              Ticket Tiers
            </Text>

            {analytics.tierStats.map((tier) => (
              <View key={tier.id} className="bg-white/5 rounded-2xl p-4 mb-3">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-white font-bold text-base">
                    {tier.name}
                  </Text>
                  <Text className="text-purple-400 font-bold text-lg">
                    ₦{tier.price.toLocaleString()}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-2">
                  <Text className="text-gray-400 text-sm">Sold</Text>
                  <Text className="text-white font-semibold">
                    {tier.sold}/{tier.quantity}
                  </Text>
                </View>

                <View className="flex-row justify-between mb-2">
                  <Text className="text-gray-400 text-sm">Checked In</Text>
                  <Text className="text-white font-semibold">
                    {tier.checkedIn}
                  </Text>
                </View>

                <View className="flex-row justify-between pt-2 border-t border-white/10">
                  <Text className="text-gray-400 text-sm">Revenue</Text>
                  <Text className="text-green-400 font-bold">
                    ₦{tier.revenue.toLocaleString()}
                  </Text>
                </View>

                {/* Progress Bar */}
                <View className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                  <View
                    className="h-full bg-purple-600"
                    style={{
                      width: `${(tier.sold / tier.quantity) * 100}%`,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === "attendees" && (
          <View className="px-6 py-6">
            {/* Guest List Header & Export */}
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-white font-bold text-lg">Guest List</Text>
              <TouchableOpacity 
                onPress={exportGuestList}
                className="bg-purple-600/20 px-4 py-2 rounded-full border border-purple-600/30 flex-row items-center"
              >
                <Ionicons name="download-outline" size={16} color="#a855f7" />
                <Text className="text-purple-400 font-bold ml-2">Export CSV</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Buttons */}
            <View className="flex-row gap-2 mb-6">
              <TouchableOpacity
                onPress={() => setAttendeeFilter("all")}
                className={`flex-1 py-3 rounded-xl ${
                  attendeeFilter === "all" ? "bg-purple-600" : "bg-white/10"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    attendeeFilter === "all" ? "text-white" : "text-gray-400"
                  }`}
                >
                  All ({analytics.attendees.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setAttendeeFilter("checked-in")}
                className={`flex-1 py-3 rounded-xl ${
                  attendeeFilter === "checked-in"
                    ? "bg-green-600"
                    : "bg-white/10"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    attendeeFilter === "checked-in"
                      ? "text-white"
                      : "text-gray-400"
                  }`}
                >
                  Checked In (
                  {
                    analytics.attendees.filter((a) => a.quantity_used > 0)
                      .length
                  }
                  )
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setAttendeeFilter("not-checked-in")}
                className={`flex-1 py-3 rounded-xl ${
                  attendeeFilter === "not-checked-in"
                    ? "bg-orange-600"
                    : "bg-white/10"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    attendeeFilter === "not-checked-in"
                      ? "text-white"
                      : "text-gray-400"
                  }`}
                >
                  Pending (
                  {
                    analytics.attendees.filter((a) => a.quantity_used === 0)
                      .length
                  }
                  )
                </Text>
              </TouchableOpacity>
            </View>

            {/* Attendees List */}
            {filteredAttendees.map((attendee) => (
              <View
                key={attendee.id}
                className="bg-white/5 rounded-2xl p-4 mb-3"
              >
                <View className="flex-row items-center mb-3">
                  {attendee.buyer_avatar ? (
                    <Image
                      source={{ uri: attendee.buyer_avatar }}
                      className="w-12 h-12 rounded-full"
                    />
                  ) : (
                    <View className="w-12 h-12 rounded-full bg-purple-600 items-center justify-center">
                      <Text className="text-white font-bold text-lg">
                        {attendee.buyer_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View className="ml-3 flex-1">
                    <Text className="text-white font-bold text-base">
                      {attendee.buyer_name}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      {attendee.tier_name} • {attendee.quantity_purchased}{" "}
                      ticket
                      {attendee.quantity_purchased > 1 ? "s" : ""}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  {attendee.quantity_used > 0 ? (
                    <View className="bg-green-600/20 px-3 py-1 rounded-full">
                      <Text className="text-green-400 text-xs font-bold">
                        ✓ CHECKED IN
                      </Text>
                    </View>
                  ) : (
                    <View className="bg-orange-600/20 px-3 py-1 rounded-full">
                      <Text className="text-orange-400 text-xs font-bold">
                        PENDING
                      </Text>
                    </View>
                  )}
                </View>

                <View className="flex-row justify-between text-sm">
                  <View className="flex-1">
                    <Text className="text-gray-500 text-xs">Purchased</Text>
                    <Text className="text-gray-300 text-sm">
                      {formatDate(attendee.purchased_at)}
                    </Text>
                  </View>

                  {attendee.last_check_in && (
                    <View className="flex-1">
                      <Text className="text-gray-500 text-xs">
                        Last Check-in
                      </Text>
                      <Text className="text-gray-300 text-sm">
                        {formatTime(attendee.last_check_in)}
                      </Text>
                    </View>
                  )}

                  <View className="flex-1 items-end">
                    <Text className="text-gray-500 text-xs">Usage</Text>
                    <Text className="text-white font-semibold text-sm">
                      {attendee.quantity_used}/{attendee.quantity_purchased}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {filteredAttendees.length === 0 && (
              <View className="items-center py-20">
                <Ionicons name="people-outline" size={64} color="#374151" />
                <Text className="text-gray-400 mt-4">No attendees found</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === "timeline" && (
          <View className="px-6 py-6">
            {/* Check-in Timeline */}
            <Text className="text-white font-bold text-lg mb-4">
              Check-in Activity
            </Text>

            {analytics.checkInTimeline.length > 0 ? (
              <View className="bg-white/5 rounded-2xl p-4 mb-6">
                {analytics.checkInTimeline.map((slot) => (
                  <View key={slot.hour} className="mb-4 last:mb-0">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-gray-400 text-sm">{slot.hour}</Text>
                      <Text className="text-white font-bold">{slot.count}</Text>
                    </View>
                    <View className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <View
                        className="h-full bg-purple-600"
                        style={{
                          width: `${(slot.count / Math.max(...analytics.checkInTimeline.map((s) => s.count))) * 100}%`,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="bg-white/5 rounded-2xl p-8 mb-6 items-center">
                <Ionicons name="time-outline" size={48} color="#374151" />
                <Text className="text-gray-400 mt-3">No check-ins yet</Text>
              </View>
            )}

            {/* Recent Check-ins */}
            <Text className="text-white font-bold text-lg mb-4">
              Recent Check-ins
            </Text>

            {analytics.recentCheckIns.map((checkIn) => (
              <View
                key={checkIn.id}
                className="bg-white/5 rounded-2xl p-4 mb-3 flex-row items-center"
              >
                {checkIn.buyer_avatar ? (
                  <Image
                    source={{ uri: checkIn.buyer_avatar }}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <View className="w-10 h-10 rounded-full bg-purple-600 items-center justify-center">
                    <Text className="text-white font-bold">
                      {checkIn.buyer_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View className="ml-3 flex-1">
                  <Text className="text-white font-semibold">
                    {checkIn.buyer_name}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    Entry #{checkIn.scan_number}
                  </Text>
                </View>

                <Text className="text-gray-400 text-sm">
                  {formatTime(checkIn.checked_in_at)}
                </Text>
              </View>
            ))}

            {analytics.recentCheckIns.length === 0 && (
              <View className="bg-white/5 rounded-2xl p-8 items-center">
                <Ionicons name="scan-outline" size={48} color="#374151" />
                <Text className="text-gray-400 mt-3">No check-ins yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
