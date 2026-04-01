import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface WithdrawalRequest {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
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
  address: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  profile: {
    username: string;
    full_name: string | null;
  };
}

type TabType = "withdrawals" | "verifications";

export default function AdminConsole() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabType>("withdrawals");
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [verifications, setVerifications] = useState<HostVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingVerificationId, setProcessingVerificationId] = useState<string | null>(null);

  useEffect(() => {
    checkAdmin();
    fetchRequests();
    fetchVerifications();
  }, []);

  const checkAdmin = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user?.id)
      .single();
    
    if (!profile?.is_admin) {
      Alert.alert("Access Denied", "You do not have permission to view this page.");
      router.replace("/host-dashboard");
    }
  };

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select(`
          *,
          host:profiles(username, full_name, host_verification_status),
          bank_account:host_bank_accounts(bank_name, account_number, account_name, recipient_code)
        `)
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
        .select(`
          *,
          profile:profiles!user_id(username, full_name)
        `)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVerifications((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching verifications:", err);
    }
  };

  const handleVerificationReview = async (verificationId: string, userId: string, approved: boolean, rejectionReason?: string) => {
    setProcessingVerificationId(verificationId);
    try {
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

      Alert.alert("Success", approved ? "Host verification approved. They can now create parties." : "Host verification rejected.");
      fetchVerifications();
    } catch (err) {
      console.error("Verification review error:", err);
      Alert.alert("Error", "Failed to update verification.");
    } finally {
      setProcessingVerificationId(null);
    }
  };

  const handleProcess = async (item: WithdrawalRequest, newStatus: 'completed' | 'rejected') => {
    setProcessingId(item.id);
    try {
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status: newStatus,
          processed_at: new Date().toISOString()
        })
        .eq("id", item.id);

      if (error) throw error;

      // If completing a VERIFIED host's request, trigger automated Paystack transfer
      const isVerifiedHost = item.host?.host_verification_status === "approved";
      if (newStatus === "completed" && isVerifiedHost) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
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
            "The request was marked complete but the Paystack auto-transfer failed. Please send the funds manually and check the edge function logs."
          );
        }
      }

      Alert.alert("Success", `Request ${newStatus === 'completed' ? 'completed' : 'rejected'}.`);
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
              {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View className="flex-row gap-2 items-center">
            {/* Verified / Unverified badge */}
            <View className={`px-2 py-1 rounded-full flex-row items-center gap-1 ${
              isVerifiedHost ? "bg-green-500/20" : "bg-orange-500/20"
            }`}>
              <Ionicons
                name={isVerifiedHost ? "shield-checkmark" : "shield-outline"}
                size={11}
                color={isVerifiedHost ? "#22c55e" : "#f97316"}
              />
              <Text className={`text-xs font-bold ${
                isVerifiedHost ? "text-green-400" : "text-orange-400"
              }`}>
                {isVerifiedHost ? "Verified" : "Unverified"}
              </Text>
            </View>
            {/* Status badge */}
            <View className={`px-3 py-1 rounded-full ${
              item.status === 'pending' ? 'bg-orange-500/20' :
              item.status === 'completed' ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              <Text className={`text-xs font-bold capitalize ${
                item.status === 'pending' ? 'text-orange-500' :
                item.status === 'completed' ? 'text-green-500' : 'text-red-500'
              }`}>
                {item.status}
              </Text>
            </View>
          </View>
        </View>

        <View className="border-t border-white/5 pt-4 mb-4">
          <Text className="text-purple-400 text-xs font-bold uppercase mb-2">Host Details</Text>
          <Text className="text-white font-medium">{item.host?.full_name || item.host?.username}</Text>

          <Text className="text-purple-400 text-xs font-bold uppercase mb-2 mt-4">Bank Details</Text>
          <Text className="text-white">{item.bank_account?.bank_name}</Text>
          <Text className="text-gray-400 text-sm">{item.bank_account?.account_number}</Text>
          <Text className="text-gray-400 text-sm">{item.bank_account?.account_name}</Text>

          {!isVerifiedHost && (
            <View className="mt-3 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
              <Text className="text-orange-400 text-xs">
                ⚠️ Unverified host — process payment manually then mark complete.
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

        {item.status === 'pending' && (
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => Alert.alert(
                "Reject Request",
                "Are you sure you want to reject this payout?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reject", style: "destructive", onPress: () => handleProcess(item, 'rejected') }
                ]
              )}
              disabled={!!processingId}
              className="flex-1 bg-red-500/10 py-3 rounded-xl items-center"
            >
              <Text className="text-red-500 font-bold">Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => Alert.alert(
                isVerifiedHost ? "Approve & Transfer" : "Mark as Completed",
                isVerifiedHost
                  ? `This will auto-transfer ₦${item.amount.toLocaleString()} to ${item.bank_account?.account_name} via Paystack. Continue?`
                  : "Have you manually sent the funds to this host?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: isVerifiedHost ? "Yes, Transfer" : "Yes, Completed", onPress: () => handleProcess(item, 'completed') }
                ]
              )}
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
            {item.profile?.full_name || item.profile?.username || "Unknown"}
          </Text>
          <Text className="text-gray-400 text-xs">
            {new Date(item.created_at).toLocaleDateString()} • {item.id_type} - {item.id_number}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${
          item.status === "pending" ? "bg-amber-500/20" : "bg-red-500/20"
        }`}>
          <Text className={`text-xs font-bold capitalize ${
            item.status === "pending" ? "text-amber-500" : "text-red-500"
          }`}>{item.status}</Text>
        </View>
      </View>
      <View className="border-t border-white/5 pt-4 mb-4">
        <Text className="text-purple-400 text-xs font-bold uppercase mb-1">Address</Text>
        <Text className="text-white text-sm mb-2">{item.address || "—"}</Text>
        <Text className="text-purple-400 text-xs font-bold uppercase mb-1">Phone</Text>
        <Text className="text-white text-sm mb-2">{item.phone || "—"}</Text>
        {item.id_image_url && (() => {
          const { data } = supabase.storage.from("flyers").getPublicUrl(item.id_image_url);
          return (
            <>
              <Text className="text-purple-400 text-xs font-bold uppercase mb-2">ID Photo</Text>
              <ExpoImage source={{ uri: data.publicUrl }} className="w-full h-32 rounded-lg" contentFit="cover" />
            </>
          );
        })()}
      </View>
      {item.status === "pending" && (
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => Alert.alert(
              "Reject Verification",
              "Optionally enter a reason (shown to the user):",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Reject", style: "destructive", onPress: () => handleVerificationReview(item.id, item.user_id, false) },
              ]
            )}
            disabled={!!processingVerificationId}
            className="flex-1 bg-red-500/10 py-3 rounded-xl items-center"
          >
            <Text className="text-red-500 font-bold">Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleVerificationReview(item.id, item.user_id, true)}
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
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-[#191022]">
      {/* Header */}
      <View className="pt-14 px-6 pb-4 border-b border-white/10 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-white/5 rounded-full">
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
      <View className="flex-row mx-6 mt-4 mb-2">
        <TouchableOpacity
          onPress={() => setTab("withdrawals")}
          className={`flex-1 py-3 rounded-xl mr-2 ${tab === "withdrawals" ? "bg-purple-600" : "bg-white/5"}`}
        >
          <Text className={`text-center font-bold ${tab === "withdrawals" ? "text-white" : "text-gray-400"}`}>
            Withdrawals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("verifications")}
          className={`flex-1 py-3 rounded-xl ${tab === "verifications" ? "bg-purple-600" : "bg-white/5"}`}
        >
          <Text className={`text-center font-bold ${tab === "verifications" ? "text-white" : "text-gray-400"}`}>
            Verifications
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : tab === "verifications" ? (
        <FlatList
          data={verifications}
          renderItem={renderVerificationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchVerifications(); fetchRequests(); }} tintColor="#8B5CF6" />
          }
          ListEmptyComponent={
            <View className="mt-20 items-center px-10">
              <Ionicons name="shield-checkmark-outline" size={64} color="#333" />
              <Text className="text-gray-500 text-center mt-4">No pending verifications.</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRequests(); }} tintColor="#8B5CF6" />
          }
          ListEmptyComponent={
            <View className="mt-20 items-center px-10">
              <Ionicons name="receipt-outline" size={64} color="#333" />
              <Text className="text-gray-500 text-center mt-4">No payout requests found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
