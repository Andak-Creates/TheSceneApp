import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";
import { useUserStore } from "../stores/userStore";
import HostProfileSelector from "../components/HostProfileSelector";

type Tab = "parties" | "scanner" | "analytics";
type FilterType = "all" | "owned" | "admin";

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
  date_tba?: boolean;
  host_profile_id?: string | null;
}

// ✅ ADD TIER INFO TO PARTY
interface PartyWithTiers extends Party {
  total_tickets: number;
  total_sold: number;
  total_revenue: number;
  ownershipType: "owned" | "admin";
}

interface Analytics {
  totalRevenue: number;
  totalTicketsSold: number;
  totalParties: number;
  averageRating: number;
  upcomingParties: number;
}

interface HostBalance {
  total_earned: number;
  total_withdrawn: number;
  current_balance: number;
  pending_payout: number;
  currency: string;
}

interface EarningLog {
  id: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  currency: string;
  created_at: string;
  party: {
    title: string;
  };
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
  const [balance, setBalance] = useState<HostBalance | null>(null);
  const [logs, setLogs] = useState<EarningLog[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isVerified, setIsVerified] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const scanLock = useRef(false);
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  // ✅ ADD PARTY SELECTION FOR SCANNER
  const [selectedPartyForScan, setSelectedPartyForScan] = useState<
    string | null
  >(null);
  const [showPartyPicker, setShowPartyPicker] = useState(false);

  // ✅ ADD FILTERING STATE
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [hasOwnedAndAdmin, setHasOwnedAndAdmin] = useState(false);

  useEffect(() => {
    fetchHostData();
  }, []);

  const fetchHostData = async () => {
    if (!user) return;

    try {
      // 1. Fetch host profiles where user is owner or admin
      const { data: ownedProfiles } = await supabase
        .from("host_profiles")
        .select("id")
        .eq("owner_id", user.id);

      const { data: adminProfiles } = await supabase
        .from("host_admins")
        .select("host_profile_id")
        .eq("user_id", user.id);

      const ownedIds = ownedProfiles?.map(p => p.id) || [];
      const adminIds = adminProfiles?.map(p => p.host_profile_id) || [];
      
      const profileIds = [...ownedIds, ...adminIds];

      // If user has both their own profile AND is an admin for someone else, show the filter
      setHasOwnedAndAdmin(ownedIds.length > 0 && adminIds.length > 0);

      // fallback to legacy host_id if no profileIds found (for backward compatibility during migration)
      let partiesData = [];
      if (profileIds.length > 0) {
        const { data, error } = await supabase
          .from("parties")
          .select("*")
          .or(`host_profile_id.in.(${profileIds.join(',')}),host_id.eq.${user.id}`)
          .order("date", { ascending: true });
        if (error) throw error;
        partiesData = data || [];
      } else {
        const { data, error } = await supabase
          .from("parties")
          .select("*")
          .eq("host_id", user.id)
          .order("date", { ascending: true });
        if (error) throw error;
        partiesData = data || [];
      }

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

          // Determine ownership type
          let ownershipType: "owned" | "admin" = "owned";
          if (party.host_profile_id) {
            if (adminIds.includes(party.host_profile_id) && !ownedIds.includes(party.host_profile_id)) {
              ownershipType = "admin";
            }
          } else if (party.host_id !== user.id) {
            ownershipType = "admin";
          }

          return {
            ...party,
            total_tickets: totalTickets,
            total_sold: totalSold,
            total_revenue: totalRevenue,
            ownershipType,
          };
        }),
      );

      setParties(partiesWithTiers);

      // ✅ FETCH BALANCE + verification status in one query
      const { data: balanceData } = await supabase
        .from("host_balances")
        .select("*")
        .eq("user_id", user.id)
        .single();

      setBalance(balanceData || { total_earned: 0, total_withdrawn: 0, current_balance: 0, pending_payout: 0, currency: "NGN" });

      // Fetch host verification status
      if (user) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("host_verification_status, host_verified_at")
          .eq("id", user.id)
          .single();
        if (profileRow) {
          setIsVerified(
            profileRow.host_verification_status === "approved" ||
            !!profileRow.host_verified_at
          );
        }
      }

      // ✅ FETCH EARNINGS LOGS
      const { data: logsData } = await supabase
        .from("host_earnings_logs")
        .select(`
          *,
          party:parties(title)
        `)
        .eq("host_id", user.id) // Personal earnings for managing parties
        .order("created_at", { ascending: false })
        .limit(10);
      
      setLogs(logsData || []);

      // ✅ AUTO-SELECT FIRST UPCOMING PARTY FOR SCANNER
      const upcomingParties = partiesWithTiers.filter(
        (p) => p.date_tba || new Date(p.date) >= new Date(),
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

  // ✅ DYNAMICALLY CALCULATE ANALYTICS BASED ON FILTER
  useEffect(() => {
    const computeAnalytics = async () => {
      const filteredParties = parties.filter(p => filterType === "all" || p.ownershipType === filterType);
      
      const totalRevenue = filteredParties.reduce((sum, p) => sum + p.total_revenue, 0);
      const totalTicketsSold = filteredParties.reduce((sum, p) => sum + p.total_sold, 0);
      const upcomingCount = filteredParties.filter(p => p.date_tba || new Date(p.date) >= new Date()).length;

      const partyIds = filteredParties.map(p => p.id);
      let avgRating = 0;
      if (partyIds.length > 0) {
        const { data: reviews } = await supabase
          .from("reviews")
          .select("rating")
          .in("party_id", partyIds);

        avgRating = reviews && reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
      }

      setAnalytics({
        totalRevenue,
        totalTicketsSold,
        totalParties: filteredParties.length,
        averageRating: avgRating,
        upcomingParties: upcomingCount,
      });
    };

    if (!loading) {
      computeAnalytics();
    }
  }, [parties, filterType, loading]);

  const handleWithdraw = async () => {
    if (!user || !balance) return;
    if (balance.current_balance <= 0) {
      Alert.alert("No Balance", "You have no available balance to withdraw.");
      return;
    }

    // Check bank account exists
    const { data: bankAccount } = await supabase
      .from("host_bank_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!bankAccount) {
      Alert.alert(
        "Bank Account Required",
        "Please add your bank account details before withdrawing.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add Bank", onPress: () => router.push("/host/bank-account") },
        ]
      );
      return;
    }

    Alert.alert(
      "Confirm Withdrawal Request",
      `Request withdrawal of ${formatCurrency(balance.current_balance, balance.currency)}?\n\nThis will be reviewed by the team and processed within 1-2 business days.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Request",
          onPress: async () => {
            setWithdrawing(true);
            try {
              const { error } = await supabase
                .from("withdrawal_requests")
                .insert({
                  host_id: user.id,
                  bank_account_id: bankAccount.id,
                  amount: balance.current_balance,
                  currency: balance.currency,
                  status: "pending",
                });
              if (error) throw error;
              Alert.alert("Request Submitted ✓", "Your withdrawal request has been submitted. We'll process it within 1-2 business days.");
              handleRefresh();
            } catch (err) {
              console.error("Withdrawal error:", err);
              Alert.alert("Error", "Failed to submit withdrawal request. Please try again.");
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ]
    );
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

  const renderFilterControl = () => {
    if (!hasOwnedAndAdmin) return null;

    return (
      <View className="px-6 mb-4 mt-2">
        <View className="flex-row bg-white/5 rounded-full p-1 border border-white/5">
          <TouchableOpacity
            className={`flex-1 py-2 rounded-full items-center ${
              filterType === "all" ? "bg-purple-600" : "bg-transparent"
            }`}
            onPress={() => setFilterType("all")}
          >
            <Text
              className={`text-sm font-bold ${
                filterType === "all" ? "text-white" : "text-gray-400"
              }`}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-2 rounded-full items-center ${
              filterType === "owned" ? "bg-purple-600" : "bg-transparent"
            }`}
            onPress={() => setFilterType("owned")}
          >
            <Text
              className={`text-sm font-bold ${
                filterType === "owned" ? "text-white" : "text-gray-400"
              }`}
            >
              My Brands
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-2 rounded-full items-center ${
              filterType === "admin" ? "bg-purple-600" : "bg-transparent"
            }`}
            onPress={() => setFilterType("admin")}
          >
            <Text
              className={`text-sm font-bold ${
                filterType === "admin" ? "text-white" : "text-gray-400"
              }`}
            >
              Admin For
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPartiesTab = () => {
    const filteredParties = parties.filter(p => filterType === "all" || p.ownershipType === filterType);
    
    const upcomingParties = filteredParties.filter(
      (p) => p.date_tba || (p.date && new Date(p.date) >= new Date()),
    );
    const pastParties = filteredParties.filter(
      (p) => !p.date_tba && p.date && new Date(p.date) < new Date(),
    );

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
        {renderFilterControl()}

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
            <View className="items-center py-16 bg-white/5 rounded-3xl border border-white/5 border-dashed">
              <View className="w-16 h-16 rounded-full bg-white/5 items-center justify-center mb-4">
                <Ionicons name="calendar-outline" size={32} color="#444" />
              </View>
              <Text className="text-gray-400 font-bold">No upcoming parties</Text>
              <Text className="text-gray-600 text-xs mt-1">Time to host your next vibe!</Text>
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
      (p) => p.date_tba || (p.date && new Date(p.date) >= new Date()),
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

  const formatCurrency = (amount: number, code: string) => {
    const symbols: Record<string, string> = {
      NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵",
      KES: "KSh", ZAR: "R", AUD: "A$", CAD: "CA$",
    };
    const symbol = symbols[code] || code + " ";
    return `${symbol}${(amount || 0).toLocaleString()}`;
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
      {renderFilterControl()}

      <View className="px-6 py-6">
        {/* ✅ BALANCE CARD - Hidden from non-host admins */}
        {profile?.is_host && (
          <View
            className="bg-purple-600 rounded-3xl p-6 mb-6 shadow-lg shadow-purple-600/20"
            style={{
              shadowColor: "#8B5CF6",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 10,
            }}
          >
            <Text className="text-purple-200 text-sm font-semibold mb-1">
              Available Balance
            </Text>
            <Text className="text-white text-4xl font-bold mb-4">
              {balance ? formatCurrency(balance.current_balance, balance.currency) : "₦0"}
            </Text>

            {balance && balance.pending_payout > 0 && (
              <View className="mb-4 bg-white/10 border border-white/20 rounded-xl p-3 flex-row items-center">
                <Ionicons name="time" size={16} color="#fff" />
                <Text className="text-white text-xs ml-2 font-medium">
                  Pending Payout: {formatCurrency(balance.pending_payout, balance.currency)}
                </Text>
              </View>
            )}

            {/* Unverified notice */}
            {!isVerified && (
              <View className="mb-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 flex-row items-center">
                <Ionicons name="shield-outline" size={16} color="#f97316" />
                <Text className="text-orange-400 text-xs ml-2 flex-1 leading-relaxed">
                  Complete host verification to unlock withdrawals.
                </Text>
                <TouchableOpacity onPress={() => router.push("/(app)/host-verification")}>
                  <Text className="text-orange-300 text-xs font-bold underline ml-2">Verify</Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={isVerified ? handleWithdraw : () => router.push("/(app)/host-verification")}
                disabled={withdrawing || (isVerified && (!balance || balance.current_balance <= 0))}
                className={`flex-1 py-4 rounded-2xl items-center flex-row justify-center ${
                  !isVerified
                    ? "bg-white/10 opacity-40"
                    : !balance || balance.current_balance <= 0 || withdrawing
                    ? "bg-white/10 opacity-50"
                    : "bg-white"
                }`}
              >
                {withdrawing ? (
                  <ActivityIndicator color="#8B5CF6" size="small" />
                ) : !isVerified ? (
                  <>
                    <Ionicons name="lock-closed" size={18} color="#aaa" />
                    <Text className="text-gray-400 font-bold ml-2 text-sm">Verify to Withdraw</Text>
                  </>
                ) : !balance || balance.current_balance <= 0 ? (
                  <>
                    <Ionicons name="wallet-outline" size={18} color="#aaa" />
                    <Text className="text-gray-400 font-bold ml-2">No Balance</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="wallet" size={20} color="#8B5CF6" />
                    <Text className="text-purple-600 font-bold ml-2">Withdraw</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/host/bank-account")}
                className="bg-white/10 w-14 h-14 rounded-2xl items-center justify-center border border-white/20"
              >
                <Ionicons name="business" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}


        {/* Stats Row */}
        <View className="flex-row gap-4 mb-8">
          <View className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/10">
            <Text className="text-gray-400 text-xs mb-1">Total Earned</Text>
            <Text className="text-white font-bold text-lg">
              {balance ? formatCurrency(balance.total_earned, balance.currency) : "₦0"}
            </Text>
          </View>
          <View className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/10">
            <Text className="text-gray-400 text-xs mb-1">Tickets Sold</Text>
            <Text className="text-white font-bold text-lg">
              {analytics.totalTicketsSold}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-xs mb-1">Total Parties</Text>
            <Text className="text-white text-xl font-bold">
              {analytics.totalParties}
            </Text>
          </View>
          <View className="flex-1 bg-white/5 rounded-2xl p-4">
            <Text className="text-gray-400 text-xs mb-1">Avg Rating</Text>
            <View className="flex-row items-center">
              <Text className="text-white text-xl font-bold mr-1">
                {analytics.averageRating.toFixed(1)}
              </Text>
              <Ionicons name="star" size={16} color="#8B5CF6" />
            </View>
          </View>
        </View>

        {/* Sales History */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white font-bold text-lg">Sales History</Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={() => router.push("/host/earnings")}>
                <Text className="text-purple-400 text-sm">See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {logs.map((item) => (
            <View key={item.id} className="mb-3 bg-white/5 p-4 rounded-2xl border border-white/5 flex-row justify-between items-center">
              <View className="flex-1 mr-4">
                <Text className="text-white font-bold mb-1" numberOfLines={1}>{item.party?.title}</Text>
                <Text className="text-gray-400 text-[10px]">{formatDate(item.created_at)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-green-400 font-bold text-sm">
                  +{formatCurrency(item.net_amount, item.currency)}
                </Text>
              </View>
            </View>
          ))}

          {logs.length === 0 && (
            <View className="bg-white/5 rounded-2xl p-8 items-center justify-center">
              <Ionicons name="receipt-outline" size={32} color="#333" />
              <Text className="text-gray-500 mt-2 text-sm">No sales yet</Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <Text className="text-white font-bold text-lg mb-3 mt-4">
          Quick Actions
        </Text>

        {profile?.is_host && (
          <TouchableOpacity
            className="bg-white/5 rounded-2xl p-4 flex-row items-center justify-between mb-3"
            onPress={() => router.push("/(app)/host-profile-setup")}
          >
            <View className="flex-row items-center">
              <Ionicons name="business" size={24} color="#8B5CF6" />
              <Text className="text-white font-semibold ml-3">Manage Host Profiles</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        )}

        {profile?.is_host && (
          <TouchableOpacity
            className="bg-white/5 rounded-2xl p-4 flex-row items-center justify-between mb-3"
            onPress={async () => {
              const { data } = await supabase
                .from("host_profiles")
                .select("id")
                .eq("owner_id", user?.id)
                .is("deletion_requested_at", null);

              if (!data || data.length === 0) {
                Alert.alert(
                  "No Profile",
                  "Please create a host profile first to manage admins."
                );
              } else if (data.length === 1) {
                // Only 1 profile, go straight to it
                router.push({
                  pathname: "/(app)/host-profile-admins",
                  params: { hostProfileId: data[0].id },
                } as any);
              } else {
                // Multiple profiles, show selector
                setShowProfileSelector(true);
              }
            }}
          >
            <View className="flex-row items-center">
              <Ionicons name="people-circle" size={24} color="#8B5CF6" />
              <Text className="text-white font-semibold ml-3">Manage Admins</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        )}

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

      <HostProfileSelector
        isVisible={showProfileSelector}
        onClose={() => setShowProfileSelector(false)}
        onSelect={(profileId: string) => {
          router.push({
            pathname: "/(app)/host-profile-admins",
            params: { hostProfileId: profileId },
          } as any);
        }}
      />
    </View>
  );
}
