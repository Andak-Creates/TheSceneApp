import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface WithdrawalRequest {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected" | "completed";
  created_at: string;
  host_id: string;
  host: {
    username: string;
    full_name: string | null;
    host_verification_status: string | null;
  };
  bank_account: {
    bank_name: string;
    account_number: string;
    account_name: string;
    recipient_code: string | null;
  };
}

interface HostVerification {
  id: string;
  user_id: string;
  full_name: string | null;
  id_type: string | null;
  id_number: string | null;
  id_image_url: string | null;
  selfie_image_url: string | null;
  utility_bill_url: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  api_status?: string;
  api_verification_results?: any;
  created_at: string;
  profile: {
    username: string;
    full_name: string | null;
  };
}

interface Agent {
  id: string;
  code: string;
  window_start_date: string;
  exit_date: string | null;
  created_at: string;
}

interface ReferralInfo {
  id: string;
  referred_by_code: string;
  referred_user_id: string;
  created_at: string;
  profile: {
    username: string;
    full_name: string;
    is_host: boolean;
  };
}

type TabType = "withdrawals" | "verifications" | "referrals";

export default function AdminConsole() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabType>("withdrawals");
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [verifications, setVerifications] = useState<HostVerification[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [referrals, setReferrals] = useState<ReferralInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingVerificationId, setProcessingVerificationId] = useState<
    string | null
  >(null);
  const [newAgentUsername, setNewAgentUsername] = useState("");
  const [newAgentCode, setNewAgentCode] = useState("");
  const [addingAgent, setAddingAgent] = useState(false);

  // Reject Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [verificationToReject, setVerificationToReject] = useState<string | null>(null);
  const [verificationUserIdToReject, setVerificationUserIdToReject] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
    fetchRequests();
    fetchVerifications();
    fetchAgentsAndReferrals();
  }, []);

  const fetchAgentsAndReferrals = async () => {
    try {
      const { data: agData } = await supabase
        .from("agents")
        .select("*")
        .order("created_at", { ascending: false });
      if (agData) setAgents(agData);

      const { data: refData } = await supabase
        .from("referrals")
        .select("*");
        
      if (refData && refData.length > 0) {
        const userIds = refData.map((r: any) => r.referred_user_id);
        const { data: profData } = await supabase
          .from("profiles")
          .select("id, username, full_name, is_host")
          .in("id", userIds);
          
        const profMap: Record<string, any> = {};
        profData?.forEach((p: any) => { profMap[p.id] = p; });
        
        const mappedRefs = refData.map((r: any) => ({
          ...r,
          profile: profMap[r.referred_user_id]
        }));
        setReferrals(mappedRefs as any);
      } else {
        setReferrals([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getCommissionStatus = (agent: Agent, ref: ReferralInfo) => {
    const now = new Date();
    const agentExit = agent.exit_date ? new Date(agent.exit_date) : null;

    if (agentExit) {
      const monthsSinceExit =
        (now.getTime() - agentExit.getTime()) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSinceExit > 12)
        return { text: "EXPIRED (Agent Exited)", color: "text-red-500" };
    }

    const refStart = new Date(ref.created_at);
    const monthsSinceRef =
      (now.getTime() - refStart.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (monthsSinceRef <= 12) {
      return ref.profile?.is_host
        ? { text: "TIER 1 (30% HOST)", color: "text-green-500" }
        : { text: "TIER 1 (20% USER)", color: "text-green-500" };
    } else {
      return { text: "TIER 2 (10% ONGOING)", color: "text-amber-500" };
    }
  };

  const checkAdmin = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user?.id)
      .single();

    if (!profile?.is_admin) {
      Alert.alert(
        "Access Denied",
        "You do not have permission to view this page.",
      );
      router.replace("/host-dashboard");
    }
  };

  const handleAddAgent = async () => {
    if (!newAgentUsername.trim() || !newAgentCode.trim()) {
      Alert.alert("Error", "Please fill in both fields");
      return;
    }
    setAddingAgent(true);

    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", newAgentUsername.trim().toLowerCase())
        .single();

      if (!userProfile) {
        Alert.alert("Error", "User not found with that username");
        setAddingAgent(false);
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ referral_code: newAgentCode.trim().toUpperCase() })
        .eq("id", userProfile.id);

      if (profileError) throw profileError;

      const { error: agentError } = await supabase.from("agents").insert({
        user_id: userProfile.id,
        code: newAgentCode.trim().toUpperCase(),
      });

      if (agentError) throw agentError;

      Alert.alert("Success", "Ambassador created!");
      setNewAgentUsername("");
      setNewAgentCode("");
      fetchAgentsAndReferrals();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message || "Failed to create ambassador.");
    } finally {
      setAddingAgent(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select(
          `
          *,
          host:profiles(username, full_name, host_verification_status),
          bank_account:host_bank_accounts(bank_name, account_number, account_name, recipient_code)
        `,
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data as any[]);
    } catch (err) {
      console.error("Error fetching requests:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchVerifications = async () => {
    try {
      const { data, error } = await supabase
        .from("host_verifications")
        .select(
          `
          *,
          profile:profiles!host_verifications_user_id_fkey(username, full_name)
        `,
        )
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVerifications((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching verifications:", err);
    }
  };

  const handleVerificationReview = async (
    verificationId: string,
    userId: string,
    approved: boolean,
    rejectionReason?: string,
    isApiCheck: boolean = false,
  ) => {
    setProcessingVerificationId(verificationId);
    try {
      if (isApiCheck) {
        // Trigger the Edge Function for authenticity check
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke(
          "verify-host-id",
          {
            body: { verification_id: verificationId },
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
          },
        );

        if (error) throw error;

        Alert.alert(
          data.status === "success"
            ? "Verification Successful"
            : "Verification Warning",
          data.summary || "ID checked against government records.",
        );
        fetchVerifications();
        return;
      }

      const { error: verError } = await supabase
        .from("host_verifications")
        .update({
          status: approved ? "approved" : "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", verificationId);

      if (verError) throw verError;

      if (approved) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            host_verified_at: new Date().toISOString(),
            host_verification_status: "approved",
            is_host: true,
          })
          .eq("id", userId);

        if (profileError) throw profileError;

        // Also verify all host profiles owned by this user
        const { error: hostProfileError } = await supabase
          .from("host_profiles")
          .update({ is_verified: true })
          .eq("owner_id", userId);

        if (hostProfileError) throw hostProfileError;
      }

      Alert.alert(
        "Success",
        approved
          ? "Host verification approved. They can now create parties."
          : "Host verification rejected.",
      );
      fetchVerifications();
      if (!approved) {
        setRejectModalVisible(false);
        setRejectReason("");
      }
    } catch (err: any) {
      console.error("Verification review error:", err);
      Alert.alert("Error", err.message || "Failed to update verification.");
    } finally {
      setProcessingVerificationId(null);
    }
  };

  const openRejectModal = (verificationId: string, userId: string) => {
    setVerificationToReject(verificationId);
    setVerificationUserIdToReject(userId);
    setRejectReason("");
    setRejectModalVisible(true);
  };

  const handleProcess = async (
    item: WithdrawalRequest,
    newStatus: "completed" | "rejected",
  ) => {
    setProcessingId(item.id);
    try {
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status: newStatus,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      // If completing a VERIFIED host's request, trigger automated Paystack transfer
      const isVerifiedHost = item.host?.host_verification_status === "approved";
      if (newStatus === "completed" && isVerifiedHost) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          await supabase.functions.invoke("process-payout", {
            body: { record: { ...item, status: "approved" } },
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
          });
        } catch (payoutErr) {
          // Log but don't block — the DB row is already marked completed
          console.error("Paystack transfer trigger failed:", payoutErr);
          Alert.alert(
            "Manually Verify Transfer",
            "The request was marked complete but the Paystack auto-transfer failed. Please send the funds manually and check the edge function logs.",
          );
        }
      }

      Alert.alert(
        "Success",
        `Request ${newStatus === "completed" ? "completed" : "rejected"}.`,
      );
      fetchRequests();
      fetchVerifications();
    } catch (err) {
      console.error("Error processing request:", err);
      Alert.alert("Error", "Failed to update request.");
    } finally {
      setProcessingId(null);
    }
  };

  const renderRequestItem = ({ item }: { item: WithdrawalRequest }) => {
    const isVerifiedHost = item.host?.host_verification_status === "approved";
    return (
      <View className="bg-white/5 mx-6 mb-4 p-5 rounded-3xl border border-white/10">
        <View className="flex-row justify-between items-start mb-4">
          <View>
            <Text className="text-white text-lg font-bold">
              ₦{item.amount.toLocaleString()}
            </Text>
            <Text className="text-gray-400 text-xs">
              {new Date(item.created_at).toLocaleDateString()} at{" "}
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          <View className="flex-row gap-2 items-center">
            {/* Verified / Unverified badge */}
            <View
              className={`px-2 py-1 rounded-full flex-row items-center gap-1 ${
                isVerifiedHost ? "bg-green-500/20" : "bg-orange-500/20"
              }`}
            >
              <Ionicons
                name={isVerifiedHost ? "shield-checkmark" : "shield-outline"}
                size={11}
                color={isVerifiedHost ? "#22c55e" : "#f97316"}
              />
              <Text
                className={`text-xs font-bold ${
                  isVerifiedHost ? "text-green-400" : "text-orange-400"
                }`}
              >
                {isVerifiedHost ? "Verified" : "Unverified"}
              </Text>
            </View>
            {/* Status badge */}
            <View
              className={`px-3 py-1 rounded-full ${
                item.status === "pending"
                  ? "bg-orange-500/20"
                  : item.status === "completed" || item.status === "approved"
                    ? "bg-green-500/20"
                    : "bg-red-500/20"
              }`}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  item.status === "pending"
                    ? "text-orange-500"
                    : item.status === "completed" || item.status === "approved"
                      ? "text-green-500"
                      : "text-red-500"
                }`}
              >
                {item.status}
              </Text>
            </View>
          </View>
        </View>

        <View className="border-t border-white/5 pt-4 mb-4">
          <Text className="text-purple-400 text-xs font-bold uppercase mb-2">
            Host Details
          </Text>
          <Text className="text-white font-medium">
            {item.host?.full_name || item.host?.username}
          </Text>

          <Text className="text-purple-400 text-xs font-bold uppercase mb-2 mt-4">
            Bank Details
          </Text>
          <Text className="text-white">{item.bank_account?.bank_name}</Text>
          <Text className="text-gray-400 text-sm">
            {item.bank_account?.account_number}
          </Text>
          <Text className="text-gray-400 text-sm">
            {item.bank_account?.account_name}
          </Text>

          {!isVerifiedHost && (
            <View className="mt-3 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
              <Text className="text-orange-400 text-xs">
                ⚠️ Unverified host — process payment manually then mark
                complete.
              </Text>
            </View>
          )}
          {isVerifiedHost && (
            <View className="mt-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
              <Text className="text-green-400 text-xs">
                ✓ Verified host — approving will auto-trigger Paystack transfer.
              </Text>
            </View>
          )}
        </View>

        {item.status === "pending" && (
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Reject Request",
                  "Are you sure you want to reject this payout?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Reject",
                      style: "destructive",
                      onPress: () => handleProcess(item, "rejected"),
                    },
                  ],
                )
              }
              disabled={!!processingId}
              className="flex-1 bg-red-500/10 py-3 rounded-xl items-center"
            >
              <Text className="text-red-500 font-bold">Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  isVerifiedHost ? "Approve & Transfer" : "Mark as Completed",
                  isVerifiedHost
                    ? `This will auto-transfer ₦${item.amount.toLocaleString()} to ${item.bank_account?.account_name} via Paystack. Continue?`
                    : "Have you manually sent the funds to this host?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: isVerifiedHost ? "Yes, Transfer" : "Yes, Completed",
                      onPress: () => handleProcess(item, "completed"),
                    },
                  ],
                )
              }
              disabled={!!processingId}
              className="flex-3 bg-green-500 py-3 rounded-xl items-center"
            >
              {processingId === item.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-bold">
                  {isVerifiedHost ? "Approve & Transfer" : "Mark Completed"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderVerificationItem = ({ item }: { item: HostVerification }) => (
    <View className="bg-white/5 mx-6 mb-4 p-5 rounded-3xl border border-white/10">
      <View className="flex-row justify-between items-start mb-4">
        <View>
          <Text className="text-white text-lg font-bold">
            {item.full_name || item.profile?.full_name || item.profile?.username || "Unknown"}
          </Text>
          <Text className="text-gray-400 text-xs">
            {new Date(item.created_at).toLocaleDateString()} • {item.id_type}
          </Text>
        </View>
        <View
          className={`px-3 py-1 rounded-full ${
            item.status === "pending" ? "bg-amber-500/20" : "bg-red-500/20"
          }`}
        >
          <Text
            className={`text-xs font-bold capitalize ${
              item.status === "pending" ? "text-amber-500" : "text-red-500"
            }`}
          >
            {item.status}
          </Text>
        </View>
      </View>
      <View className="border-t border-white/5 pt-4 mb-4">
        <Text className="text-purple-400 text-xs font-bold uppercase mb-1">
          Address
        </Text>
        <Text className="text-white text-sm mb-2">{item.address || "—"}</Text>
        <Text className="text-purple-400 text-xs font-bold uppercase mb-1">
          Phone
        </Text>
        <Text className="text-white text-sm mb-2">{item.phone || "—"}</Text>
        <View className="flex-row gap-2 mb-4">
          {item.selfie_image_url &&
            !item.utility_bill_url &&
            (() => {
              const { data } = supabase.storage
                .from("flyers")
                .getPublicUrl(item.selfie_image_url);
              return (
                <View className="flex-1">
                  <Text className="text-purple-400 text-[10px] font-bold uppercase mb-1">
                    Selfie
                  </Text>
                  <ExpoImage
                    source={{ uri: data.publicUrl }}
                    className="w-full h-24 rounded-lg"
                    contentFit="cover"
                  />
                </View>
              );
            })()}
        </View>

        {/* API Verification Status */}
        {item.api_status && item.api_status !== "not_checked" && (
          <View
            className={`mt-3 p-3 rounded-xl border ${
              item.api_status === "success"
                ? "bg-green-500/10 border-green-500/30"
                : item.api_status === "suspicious"
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-white/5 border-white/10"
            }`}
          >
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons
                name={
                  item.api_status === "success"
                    ? "shield-checkmark"
                    : "warning"
                }
                size={16}
                color={item.api_status === "success" ? "#22c55e" : "#ef4444"}
              />
              <Text
                className={`font-bold text-xs uppercase ${
                  item.api_status === "success"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                Authenticity: {item.api_status}
              </Text>
            </View>
            {item.api_verification_results?.summary && (
              <Text className="text-gray-400 text-[10px] leading-tight">
                {item.api_verification_results.summary}
              </Text>
            )}
          </View>
        )}
      </View>
      {item.status === "pending" && (
        <View className="flex-col gap-3">
          {/* Authenticity Check Button */}
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Authenticity Check",
                "This will verify the submitted ID against government databases via Smile ID. (MOCK MODE ENABLED)",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Verify Now",
                    onPress: () =>
                      handleVerificationReview(
                        item.id,
                        item.user_id,
                        true,
                        undefined,
                        true,
                      ),
                  },
                ],
              )
            }
            disabled={!!processingVerificationId}
            className="w-full bg-purple-600/20 border border-purple-600/30 py-3 rounded-xl items-center flex-row justify-center gap-2"
          >
            <Ionicons name="finger-print" size={18} color="#a855f7" />
            <Text className="text-purple-400 font-bold">
              Check Identity Authenticity
            </Text>
          </TouchableOpacity>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => openRejectModal(item.id, item.user_id)}
              disabled={!!processingVerificationId}
              className="flex-1 bg-red-500/10 py-3 rounded-xl items-center"
            >
              <Text className="text-red-500 font-bold">Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                handleVerificationReview(item.id, item.user_id, true)
              }
              disabled={!!processingVerificationId}
              className="flex-1 bg-green-500 py-3 rounded-xl items-center"
            >
              {processingVerificationId === item.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text className="text-white font-bold">Approve</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 px-6 pb-4 border-b border-white/10 flex-row items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-4 p-2 bg-white/5 rounded-full"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text className="text-white text-2xl font-bold">Admin Console</Text>
          <Text className="text-gray-400 text-sm">
            {tab === "withdrawals" ? "Payout Requests" : "Host Verifications"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-6 mt-4 mb-2 bg-white/5 p-1 rounded-xl">
        <TouchableOpacity
          onPress={() => setTab("withdrawals")}
          className={`flex-1 py-3 rounded-lg ${tab === "withdrawals" ? "bg-purple-600" : ""}`}
        >
          <Text
            className={`text-center font-bold text-xs ${tab === "withdrawals" ? "text-white" : "text-gray-400"}`}
          >
            Withdrawals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("verifications")}
          className={`flex-1 py-3 rounded-lg ${tab === "verifications" ? "bg-purple-600" : ""}`}
        >
          <Text
            className={`text-center font-bold text-xs ${tab === "verifications" ? "text-white" : "text-gray-400"}`}
          >
            Verifications
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("referrals")}
          className={`flex-1 py-3 rounded-lg ${tab === "referrals" ? "bg-purple-600" : ""}`}
        >
          <Text
            className={`text-center font-bold text-xs ${tab === "referrals" ? "text-white" : "text-gray-400"}`}
          >
            Ambassadors
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : tab === "referrals" ? (
        <ScrollView className="px-6 mt-4 pb-20">
          {/* Add Ambassador Form */}
          <View className="bg-white/5 p-5 mb-6 rounded-3xl border border-white/10">
            <Text className="text-white font-bold text-lg mb-4">
              Create Ambassador
            </Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white mb-2"
              placeholder="Username (e.g. taz)"
              placeholderTextColor="#666"
              autoCapitalize="none"
              value={newAgentUsername}
              onChangeText={setNewAgentUsername}
            />
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white mb-3"
              placeholder="Vanity Code (e.g. TAZ)"
              placeholderTextColor="#666"
              autoCapitalize="characters"
              value={newAgentCode}
              onChangeText={setNewAgentCode}
            />
            <TouchableOpacity
              onPress={handleAddAgent}
              disabled={addingAgent}
              className="bg-purple-600 rounded-xl h-12 items-center justify-center flex-row"
            >
              {addingAgent ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold">Add Ambassador</Text>
              )}
            </TouchableOpacity>
          </View>

          {agents.length === 0 && (
            <View className="mt-20 items-center">
              <Ionicons name="people-outline" size={64} color="#333" />
              <Text className="text-gray-500 text-center mt-4">
                No ambassadors registered.
              </Text>
            </View>
          )}
          {agents.map((agent) => (
            <View
              key={agent.id}
              className="bg-white/5 p-5 mb-4 rounded-3xl border border-white/10"
            >
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-white font-bold text-xl">
                  {agent.code}
                </Text>
                <View className="bg-green-500/20 px-3 py-1 rounded-full">
                  <Text className="text-green-500 text-xs font-bold font-mono">
                    ACTIVE
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center border-b border-white/10 pb-4 mb-4 gap-4">
                <View>
                  <Text className="text-gray-400 text-xs uppercase font-bold">
                    Start Date
                  </Text>
                  <Text className="text-white text-sm mt-1">
                    {new Date(agent.window_start_date).toLocaleDateString()}
                  </Text>
                </View>
                <View>
                  <Text className="text-gray-400 text-xs uppercase font-bold">
                    Total Referrals
                  </Text>
                  <Text className="text-white text-sm mt-1">
                    {
                      referrals.filter((r) => r.referred_by_code === agent.code)
                        .length
                    }
                  </Text>
                </View>
              </View>
              <Text className="text-purple-400 text-xs font-bold uppercase mb-2">
                Referred Users
              </Text>
              {referrals
                .filter((r) => r.referred_by_code === agent.code)
                .map((ref) => {
                  const status = getCommissionStatus(agent, ref);
                  return (
                    <View
                      key={ref.id}
                      className="flex-row justify-between items-center bg-black/20 p-3 rounded-xl mb-2"
                    >
                      <View>
                        <Text className="text-white font-semibold flex-row items-center">
                          {ref.profile?.full_name || ref.profile?.username}
                          {ref.profile?.is_host && (
                            <Text className="text-purple-400 text-[10px]">
                              {" "}
                              (HOST)
                            </Text>
                          )}
                        </Text>
                        <Text className="text-gray-500 text-xs mt-0.5">
                          Joined {new Date(ref.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text
                        className={`${status.color} text-[10px] font-bold font-mono`}
                      >
                        {status.text}
                      </Text>
                    </View>
                  );
                })}
            </View>
          ))}
        </ScrollView>
      ) : tab === "verifications" ? (
        <FlatList
          data={verifications}
          renderItem={renderVerificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchVerifications();
                fetchRequests();
              }}
              tintColor="#8B5CF6"
            />
          }
          ListEmptyComponent={
            <View className="mt-20 items-center px-10">
              <Ionicons
                name="shield-checkmark-outline"
                size={64}
                color="#333"
              />
              <Text className="text-gray-500 text-center mt-4">
                No pending verifications.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequestItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchRequests();
              }}
              tintColor="#8B5CF6"
            />
          }
          ListEmptyComponent={
            <View className="mt-20 items-center px-10">
              <Ionicons name="receipt-outline" size={64} color="#333" />
              <Text className="text-gray-500 text-center mt-4">
                No payout requests found.
              </Text>
            </View>
          }
        />
      )}

      {/* Reject Verification Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-[#150d1e] w-full rounded-3xl p-6 border border-white/10">
            <Text className="text-white text-xl font-bold mb-2">
              Reject Verification
            </Text>
            <Text className="text-gray-400 text-sm mb-4">
              Please provide a reason for rejecting this verification (e.g., "ID blurry", "Names don't match"). The user will see this.
            </Text>

            <TextInput
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white mb-6"
              placeholder="Enter rejection reason..."
              placeholderTextColor="#666"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              autoFocus
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setRejectModalVisible(false)}
                className="flex-1 bg-white/5 py-3 rounded-xl items-center"
              >
                <Text className="text-white font-bold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (verificationToReject && verificationUserIdToReject) {
                    handleVerificationReview(
                      verificationToReject,
                      verificationUserIdToReject,
                      false,
                      rejectReason.trim()
                    );
                  }
                }}
                disabled={!!processingVerificationId}
                className="flex-1 bg-red-500 py-3 rounded-xl items-center"
              >
                {processingVerificationId ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold">Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
