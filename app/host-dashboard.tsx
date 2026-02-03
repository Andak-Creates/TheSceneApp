import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";
import { useUserStore } from "../stores/userStore";

type Tab = "parties" | "scanner" | "analytics";

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string;
  location: string;
  city: string;
  ticket_price: number;
  ticket_quantity: number;
  tickets_sold: number;
}

// ✅ ADD TIER INFO TO PARTY
interface PartyWithTiers extends Party {
  total_tickets: number;
  total_sold: number;
  total_revenue: number;
}

interface Analytics {
  totalRevenue: number;
  totalTicketsSold: number;
  totalParties: number;
  averageRating: number;
  upcomingParties: number;
}

interface ScanResult {
  success: boolean;
  message: string;
  scan_number?: number;
  total_tickets?: number;
  remaining?: number;
  buyer_name?: string;
  party_title?: string;
  error_code?: string;
}

export default function HostDashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { profile } = useUserStore();

  const [activeTab, setActiveTab] = useState<Tab>("parties");
  const [parties, setParties] = useState<PartyWithTiers[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({
    totalRevenue: 0,
    totalTicketsSold: 0,
    totalParties: 0,
    averageRating: 0,
    upcomingParties: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);

  // ✅ ADD PARTY SELECTION FOR SCANNER
  const [selectedPartyForScan, setSelectedPartyForScan] = useState<
    string | null
  >(null);
  const [showPartyPicker, setShowPartyPicker] = useState(false);

  useEffect(() => {
    fetchHostData();
  }, []);

  const fetchHostData = async () => {
    if (!user) return;

    try {
      // Fetch parties
      const { data: partiesData, error: partiesError } = await supabase
        .from("parties")
        .select("*")
        .eq("host_id", user.id)
        .order("date", { ascending: true });

      if (partiesError) throw partiesError;

      // ✅ FETCH TIER DATA FOR EACH PARTY
      const partiesWithTiers = await Promise.all(
        (partiesData || []).map(async (party) => {
          const { data: tiers } = await supabase
            .from("ticket_tiers")
            .select("*")
            .eq("party_id", party.id)
            .eq("is_active", true);

          const totalTickets =
            tiers?.reduce((sum, t) => sum + t.quantity, 0) || 0;
          const totalSold =
            tiers?.reduce((sum, t) => sum + (t.quantity_sold || 0), 0) || 0;
          const totalRevenue =
            tiers?.reduce(
              (sum, t) => sum + t.price * (t.quantity_sold || 0),
              0,
            ) || 0;

          return {
            ...party,
            total_tickets: totalTickets,
            total_sold: totalSold,
            total_revenue: totalRevenue,
          };
        }),
      );

      setParties(partiesWithTiers);

      // ✅ CALCULATE ANALYTICS FROM TIER DATA
      const totalRevenue = partiesWithTiers.reduce(
        (sum, p) => sum + p.total_revenue,
        0,
      );
      const totalTicketsSold = partiesWithTiers.reduce(
        (sum, p) => sum + p.total_sold,
        0,
      );
      const upcomingCount = partiesWithTiers.filter(
        (p) => new Date(p.date) >= new Date(),
      ).length;

      // Get reviews
      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("host_id", user.id);

      const avgRating =
        reviews && reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      setAnalytics({
        totalRevenue,
        totalTicketsSold,
        totalParties: partiesWithTiers.length,
        averageRating: avgRating,
        upcomingParties: upcomingCount,
      });

      // ✅ AUTO-SELECT FIRST UPCOMING PARTY FOR SCANNER
      const upcomingParties = partiesWithTiers.filter(
        (p) => new Date(p.date) >= new Date(),
      );
      if (upcomingParties.length > 0 && !selectedPartyForScan) {
        setSelectedPartyForScan(upcomingParties[0].id);
      }
    } catch (error) {
      console.error("Error fetching host data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHostData();
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanning(true);

    try {
      console.log("📱 RAW QR Code data:", data);

      // Parse QR code data
      let qrData;
      try {
        qrData = JSON.parse(data);
        console.log("📦 Parsed QR data:", JSON.stringify(qrData, null, 2));
      } catch (parseError) {
        console.error("❌ Failed to parse QR code:", parseError);
        setScanResult({
          success: false,
          message: "Invalid QR code format",
        });
        setTimeout(() => setScanning(false), 3000);
        return;
      }

      const { ticketId, partyId, userId } = qrData;
      console.log("🎫 Extracted values:");
      console.log("  ticketId:", ticketId, "type:", typeof ticketId);
      console.log("  partyId:", partyId, "type:", typeof partyId);
      console.log("  userId:", userId, "type:", typeof userId);

      if (!ticketId) {
        setScanResult({
          success: false,
          message: "Invalid QR code - missing ticket ID",
        });
        setTimeout(() => setScanning(false), 3000);
        return;
      }

      // ✅ VERIFY TICKET BELONGS TO SELECTED PARTY
      if (selectedPartyForScan) {
        console.log("🔍 Selected party for scan:", selectedPartyForScan);

        const qrPartyId = String(partyId);
        const selectedPartyId = String(selectedPartyForScan);

        console.log("🔍 Comparing:", { qrPartyId, selectedPartyId });

        if (qrPartyId !== selectedPartyId) {
          const { data: qrParty } = await supabase
            .from("parties")
            .select("title")
            .eq("id", partyId)
            .single();

          const { data: selectedParty } = await supabase
            .from("parties")
            .select("title")
            .eq("id", selectedPartyForScan)
            .single();

          console.log("❌ Party mismatch!");
          console.log("  Ticket is for:", qrParty?.title);
          console.log("  Scanning for:", selectedParty?.title);

          setScanResult({
            success: false,
            message: `This ticket is for "${qrParty?.title}" not "${selectedParty?.title}"`,
          });
          setTimeout(() => setScanning(false), 3000);
          return;
        }

        console.log("✅ Party verification passed!");
      }

      // ✅ FIRST: CHECK IF TICKET EXISTS AT ALL
      console.log("🔍 Looking up ticket with ID:", ticketId);

      const { data: ticketCheck, error: checkError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId);

      console.log("📊 Ticket lookup result:");
      console.log("  Found tickets:", ticketCheck?.length || 0);
      if (ticketCheck && ticketCheck.length > 0) {
        console.log("  Ticket data:", JSON.stringify(ticketCheck[0], null, 2));
      }
      console.log("  Error:", checkError);

      // If no ticket found, try to help debug
      if (!ticketCheck || ticketCheck.length === 0) {
        console.log("❌ No ticket found with this ID");

        // Check if ANY tickets exist for this party
        const { data: partyTickets, error: partyError } = await supabase
          .from("tickets")
          .select("id, user_id, party_id")
          .eq("party_id", partyId)
          .limit(5);

        console.log(
          "📋 Sample tickets for this party:",
          partyTickets?.length || 0,
        );
        if (partyTickets && partyTickets.length > 0) {
          console.log(
            "  Sample IDs:",
            partyTickets.map((t) => t.id.substring(0, 8)),
          );
        }

        setScanResult({
          success: false,
          message: `Ticket not found. ID: ${ticketId.substring(0, 8)}...`,
        });
        setTimeout(() => setScanning(false), 3000);
        return;
      }

      const ticket = ticketCheck[0];

      // Check payment status
      if (ticket.payment_status !== "completed") {
        console.log("❌ Ticket payment not completed");
        setScanResult({
          success: false,
          message: "Ticket payment not completed",
        });
        setTimeout(() => setScanning(false), 3000);
        return;
      }

      // Check if ticket is already fully used
      if (ticket.quantity_used >= ticket.quantity_purchased) {
        console.log("❌ Ticket fully used");
        setScanResult({
          success: false,
          message: `All ${ticket.quantity_purchased} entries have been used`,
        });
        setTimeout(() => setScanning(false), 5000);
        return;
      }

      console.log("✅ Ticket is valid! Proceeding to check-in...");
      console.log(
        `  Usage: ${ticket.quantity_used}/${ticket.quantity_purchased}`,
      );

      // ✅ CALL CHECK-IN FUNCTION
      console.log("📞 Calling check_in_ticket RPC...");
      const { data: result, error: rpcError } = await supabase.rpc(
        "check_in_ticket",
        {
          ticket_id_param: ticketId,
          host_id_param: user?.id,
        },
      );

      if (rpcError) {
        console.error("❌ RPC error:", rpcError);
        throw rpcError;
      }

      console.log("✅ Check-in result:", result);
      setScanResult(result);
    } catch (error: any) {
      console.error("❌ Scan error:", error);
      setScanResult({
        success: false,
        message: error.message || "Failed to validate ticket",
      });
    } finally {
      setTimeout(() => {
        setScanning(false);
        scanLock.current = false; // 🔓 unlock scanner
      }, 3000); // 3 seconds is
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

  const renderPartiesTab = () => {
    const upcomingParties = parties.filter(
      (p) => new Date(p.date) >= new Date(),
    );
    const pastParties = parties.filter((p) => new Date(p.date) < new Date());

    return (
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
        {/* Upcoming Parties */}
        <View className="px-6 py-4">
          <Text className="text-white text-lg font-bold mb-4">
            Upcoming Parties ({upcomingParties.length})
          </Text>

          {upcomingParties.map((party) => (
            <TouchableOpacity
              key={party.id}
              className="bg-white/5 rounded-2xl mb-3 overflow-hidden"
              onPress={() =>
                router.push({
                  pathname: "/party/[id]",
                  params: { id: party.id },
                })
              }
            >
              <View className="flex-row p-4">
                <Image
                  source={{ uri: party.flyer_url }}
                  className="w-20 h-24 rounded-xl"
                />
                <View className="ml-4 flex-1">
                  <Text
                    className="text-white font-bold text-base mb-1"
                    numberOfLines={2}
                  >
                    {party.title}
                  </Text>
                  <Text className="text-gray-400 text-sm mb-2">
                    {formatDate(party.date)}
                  </Text>
                  <View className="flex-row items-center gap-4">
                    <View>
                      {/* ✅ USE TIER TOTALS */}
                      <Text className="text-purple-400 font-bold">
                        {party.total_sold}/{party.total_tickets}
                      </Text>
                      <Text className="text-gray-500 text-xs">Sold</Text>
                    </View>
                    <View>
                      {/* ✅ USE CALCULATED REVENUE */}
                      <Text className="text-green-400 font-bold">
                        ₦{party.total_revenue.toLocaleString()}
                      </Text>
                      <Text className="text-gray-500 text-xs">Revenue</Text>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {upcomingParties.length === 0 && (
            <View className="items-center py-12">
              <Ionicons name="calendar-outline" size={48} color="#666" />
              <Text className="text-gray-400 mt-3">No upcoming parties</Text>
            </View>
          )}
        </View>

        {/* Past Parties */}
        {pastParties.length > 0 && (
          <View className="px-6 py-4">
            <Text className="text-white text-lg font-bold mb-4">
              Past Parties ({pastParties.length})
            </Text>

            {pastParties.map((party) => (
              <TouchableOpacity
                key={party.id}
                className="bg-white/5 rounded-2xl mb-3 p-4 opacity-60"
                onPress={() =>
                  router.push({
                    pathname: "/party/[id]",
                    params: { id: party.id },
                  })
                }
              >
                <Text className="text-white font-bold mb-1">{party.title}</Text>
                <Text className="text-gray-400 text-sm">
                  {formatDate(party.date)} • {party.total_sold} tickets sold
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderScannerTab = () => {
    if (!permission) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text className="text-white text-lg font-bold mt-4 mb-2">
            Camera Permission Required
          </Text>
          <Text className="text-gray-400 text-center mb-6">
            We need camera access to scan ticket QR codes
          </Text>
          <TouchableOpacity
            className="bg-purple-600 px-6 py-3 rounded-full"
            onPress={requestPermission}
          >
            <Text className="text-white font-semibold">Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const upcomingParties = parties.filter(
      (p) => new Date(p.date) >= new Date(),
    );
    const selectedParty = parties.find((p) => p.id === selectedPartyForScan);

    return (
      <View className="flex-1">
        {/* ✅ PARTY SELECTOR */}
        <View className="bg-[#191022] px-6 py-4 border-b border-white/10">
          <Text className="text-gray-400 text-xs mb-2">Scanning for:</Text>
          <TouchableOpacity
            onPress={() => setShowPartyPicker(!showPartyPicker)}
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row justify-between items-center"
          >
            <Text className="text-white font-semibold">
              {selectedParty ? selectedParty.title : "Select a party"}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>

          {/* ✅ PARTY PICKER DROPDOWN */}
          {showPartyPicker && (
            <View className="mt-2 bg-white/10 rounded-xl overflow-hidden">
              {upcomingParties.length === 0 ? (
                <View className="p-4">
                  <Text className="text-gray-400 text-center">
                    No upcoming parties
                  </Text>
                </View>
              ) : (
                upcomingParties.map((party) => (
                  <TouchableOpacity
                    key={party.id}
                    onPress={() => {
                      setSelectedPartyForScan(party.id);
                      setShowPartyPicker(false);
                    }}
                    className={`p-4 border-b border-white/10 ${
                      selectedPartyForScan === party.id
                        ? "bg-purple-600/20"
                        : ""
                    }`}
                  >
                    <Text className="text-white font-semibold">
                      {party.title}
                    </Text>
                    <Text className="text-gray-400 text-sm mt-1">
                      {formatDate(party.date)} • {party.total_sold}/
                      {party.total_tickets} sold
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        <CameraView
          style={{ flex: 1 }}
          facing="back"
          // ✅ ONLY SCAN WHEN NOT ALREADY SCANNING AND NO RESULT SHOWING
          onBarcodeScanned={
            scanning || scanResult ? undefined : handleBarCodeScanned
          }
        >
          {/* Scanner Overlay */}
          <View className="flex-1 bg-black/50">
            {/* Top Info */}
            <View className="pt-20 px-6">
              <Text className="text-white text-2xl font-bold text-center mb-2">
                Scan Ticket QR Code
              </Text>
              <Text className="text-gray-300 text-center">
                {scanResult
                  ? "Check result below"
                  : scanning
                    ? "Processing..."
                    : "Position QR code in frame"}
              </Text>
            </View>

            {/* Scanner Frame */}
            <View className="flex-1 items-center justify-center">
              <View
                className={`w-72 h-72 border-4 rounded-3xl ${
                  scanResult
                    ? scanResult.success
                      ? "border-green-500"
                      : "border-red-500"
                    : scanning
                      ? "border-yellow-500"
                      : "border-purple-500"
                }`}
              />

              {/* ✅ SCANNING INDICATOR */}
              {scanning && !scanResult && (
                <View className="absolute">
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              )}
            </View>

            {/* Result Display */}
            {scanResult && (
              <View className="absolute bottom-0 left-0 right-0 p-6">
                <View
                  className={`rounded-2xl p-6 ${
                    scanResult.success ? "bg-green-600" : "bg-red-600"
                  }`}
                >
                  <View className="flex-row items-center mb-3">
                    <Ionicons
                      name={
                        scanResult.success ? "checkmark-circle" : "close-circle"
                      }
                      size={32}
                      color="#fff"
                    />
                    <Text className="text-white text-xl font-bold ml-3">
                      {scanResult.success ? "✓ Valid Ticket" : "✗ Invalid"}
                    </Text>
                  </View>

                  {scanResult.success ? (
                    <>
                      <Text className="text-white text-lg font-bold mb-2">
                        {scanResult.buyer_name}
                      </Text>
                      <Text className="text-white/90 text-base mb-1">
                        Entry {scanResult.scan_number} of{" "}
                        {scanResult.total_tickets}
                      </Text>
                      {scanResult.remaining! > 0 && (
                        <Text className="text-white/80 text-sm mt-2 mb-3">
                          💡 {scanResult.remaining} more{" "}
                          {scanResult.remaining === 1 ? "entry" : "entries"}{" "}
                          remaining on this ticket
                        </Text>
                      )}
                      {scanResult.remaining === 0 && (
                        <Text className="text-white/80 text-sm mt-2 mb-3">
                          ⚠️ This was the last entry for this ticket
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text className="text-white text-base mb-3">
                      {scanResult.message}
                    </Text>
                  )}

                  {/* ✅ READY FOR NEXT SCAN BUTTON */}
                  <TouchableOpacity
                    className="bg-white/30 py-4 rounded-xl mt-2"
                    onPress={() => {
                      setScanResult(null);
                      setScanning(false);
                    }}
                  >
                    <Text className="text-white text-center font-bold text-base">
                      ✓ Ready for Next Scan
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ✅ INSTRUCTION OVERLAY WHEN IDLE */}
            {!scanning && !scanResult && (
              <View className="absolute bottom-0 left-0 right-0 p-6">
                <View className="bg-purple-600/90 rounded-2xl p-6">
                  <Text className="text-white text-center text-base font-semibold mb-2">
                    📱 Point camera at QR code
                  </Text>
                  <Text className="text-white/80 text-center text-sm">
                    Scanning will happen automatically when QR code is detected
                  </Text>
                </View>
              </View>
            )}
          </View>
        </CameraView>
      </View>
    );
  };

  const renderAnalyticsTab = () => (
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
      <View className="px-6 py-6">
        {/* Stats Cards */}
        <View className="bg-purple-600 rounded-2xl p-6 mb-4">
          <Text className="text-purple-200 text-sm mb-1">Total Revenue</Text>
          <Text className="text-white text-3xl font-bold">
            ₦{analytics.totalRevenue.toLocaleString()}
          </Text>
        </View>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm mb-1">Tickets Sold</Text>
            <Text className="text-white text-2xl font-bold">
              {analytics.totalTicketsSold}
            </Text>
          </View>
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm mb-1">Total Parties</Text>
            <Text className="text-white text-2xl font-bold">
              {analytics.totalParties}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm mb-1">Avg Rating</Text>
            <View className="flex-row items-center">
              <Text className="text-white text-2xl font-bold mr-1">
                {analytics.averageRating.toFixed(1)}
              </Text>
              <Ionicons name="star" size={20} color="#8B5CF6" />
            </View>
          </View>
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-sm mb-1">Upcoming</Text>
            <Text className="text-white text-2xl font-bold">
              {analytics.upcomingParties}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text className="text-white font-bold text-lg mb-3 mt-4">
          Quick Actions
        </Text>

        <TouchableOpacity
          className="bg-white/5 rounded-2xl p-4 flex-row items-center justify-between mb-3"
          onPress={() => router.push("/(app)/createParty")}
        >
          <View className="flex-row items-center">
            <Ionicons name="add-circle" size={24} color="#8B5CF6" />
            <Text className="text-white font-semibold ml-3">Create Party</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white/5 rounded-2xl p-4 flex-row items-center justify-between"
          onPress={() => setActiveTab("scanner")}
        >
          <View className="flex-row items-center">
            <Ionicons name="qr-code" size={24} color="#8B5CF6" />
            <Text className="text-white font-semibold ml-3">Scan Tickets</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

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
          <Text className="text-white text-xl font-bold">Host Dashboard</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View className="flex-row">
          <TouchableOpacity
            onPress={() => setActiveTab("parties")}
            className={`flex-1 pb-3 ${
              activeTab === "parties" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "parties" ? "text-white" : "text-gray-400"
              }`}
            >
              Parties
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("scanner")}
            className={`flex-1 pb-3 ${
              activeTab === "scanner" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "scanner" ? "text-white" : "text-gray-400"
              }`}
            >
              Scanner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("analytics")}
            className={`flex-1 pb-3 ${
              activeTab === "analytics" ? "border-b-2 border-purple-600" : ""
            }`}
          >
            <Text
              className={`text-center font-semibold ${
                activeTab === "analytics" ? "text-white" : "text-gray-400"
              }`}
            >
              Analytics
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === "parties" && renderPartiesTab()}
      {activeTab === "scanner" && renderScannerTab()}
      {activeTab === "analytics" && renderAnalyticsTab()}
    </View>
  );
}
