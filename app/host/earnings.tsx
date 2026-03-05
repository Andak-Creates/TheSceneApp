import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface HostBalance {
  total_earned: number;
  total_withdrawn: number;
  current_balance: number;
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

export default function HostEarningsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [balance, setBalance] = useState<HostBalance | null>(null);
  const [logs, setLogs] = useState<EarningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  useEffect(() => {
    if (user) {
      fetchEarningsData();
    }
  }, [user]);

  const fetchEarningsData = async () => {
    if (!user) return;

    try {
      // Fetch balance
      const { data: balanceData, error: balanceError } = await supabase
        .from("host_balances")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (balanceError && balanceError.code !== "PGRST116") {
        console.error("Error fetching balance:", balanceError);
      }
      setBalance(
        balanceData || {
          total_earned: 0,
          total_withdrawn: 0,
          current_balance: 0,
          currency: "NGN",
        },
      );

      // Fetch logs
      const { data: logsData, error: logsError } = await supabase
        .from("host_earnings_logs")
        .select(
          `
          *,
          party:parties(title)
        `,
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error) {
      console.error("Error fetching earnings data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarningsData();
  };

  const formatCurrency = (amount: number, code: string) => {
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
    const symbol = symbols[code] || code + " ";
    return `${symbol}${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      <View className="pt-12 px-6 pb-4 flex-row items-center border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold flex-1">
          Earnings & Payouts
        </Text>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
          />
        }
        ListHeaderComponent={
          <View className="p-6">
            {/* Balance Card */}
            <View className="bg-purple-600 rounded-3xl p-6 mb-8 shadow-lg shadow-purple-600/20">
              <Text className="text-purple-200 text-sm font-semibold mb-1">
                Available Balance
              </Text>
              <Text className="text-white text-4xl font-bold mb-6">
                {balance
                  ? formatCurrency(balance.current_balance, balance.currency)
                  : "₦0"}
              </Text>

              <View className="flex-row gap-4">
                <TouchableOpacity
                  onPress={() => router.push("/host/bank-account")}
                  className="flex-1 bg-white/20 py-3 rounded-xl items-center"
                >
                  <Text className="text-white font-bold">Bank Account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!balance || balance.current_balance <= 0}
                  className={`flex-1 py-3 rounded-xl items-center ${
                    !balance || balance.current_balance <= 0
                      ? "bg-white/10"
                      : "bg-white"
                  }`}
                >
                  <Text
                    className={
                      !balance || balance.current_balance <= 0
                        ? "text-white/30"
                        : "text-purple-600 font-bold"
                    }
                  >
                    Withdraw
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats Row */}
            <View className="flex-row gap-4 mb-8">
              <View className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/10">
                <Text className="text-gray-400 text-xs mb-1">Total Earned</Text>
                <Text className="text-white font-bold text-lg">
                  {balance
                    ? formatCurrency(balance.total_earned, balance.currency)
                    : "₦0"}
                </Text>
              </View>
              <View className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/10">
                <Text className="text-gray-400 text-xs mb-1">Withdrawn</Text>
                <Text className="text-white font-bold text-lg">
                  {balance
                    ? formatCurrency(balance.total_withdrawn, balance.currency)
                    : "₦0"}
                </Text>
              </View>
            </View>

            <Text className="text-white font-bold text-lg mb-4">
              Sales History
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mx-6 mb-3 bg-white/5 p-4 rounded-2xl border border-white/5 flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <Text className="text-white font-bold mb-1" numberOfLines={1}>
                {item.party?.title}
              </Text>
              <Text className="text-gray-400 text-xs">
                {formatDate(item.created_at)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-green-400 font-bold text-base">
                +{formatCurrency(item.net_amount, item.currency)}
              </Text>
              <Text className="text-gray-500 text-[10px]">
                Fee: {formatCurrency(item.fee_amount, item.currency)}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Ionicons name="receipt-outline" size={48} color="#333" />
            <Text className="text-gray-500 mt-2">No earnings yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}
