import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

interface AttendancePillProps {
  ticketsSold: number;
}

export default function AttendancePill({ ticketsSold }: AttendancePillProps) {
  if (ticketsSold < 10) return null;

  let label = "";
  let bgColor = "";
  let textColor = "";
  let borderColor = "";

  if (ticketsSold >= 100) {
    label = "100+ attending";
    bgColor = "bg-red-500/15";
    textColor = "text-red-400";
    borderColor = "border-red-500/30";
  } else if (ticketsSold >= 50) {
    label = "50+ attending";
    bgColor = "bg-orange-500/15";
    textColor = "text-orange-400";
    borderColor = "border-orange-500/30";
  } else {
    label = "10+ attending";
    bgColor = "bg-green-500/15";
    textColor = "text-green-400";
    borderColor = "border-green-500/30";
  }

  return (
    <View
      className={`flex-row items-center gap-1 self-start px-3 py-1.5 rounded-full border ${bgColor} ${borderColor}`}
    >
      <Ionicons name="flame" size={12} color={ticketsSold >= 100 ? "#f87171" : ticketsSold >= 50 ? "#fb923c" : "#4ade80"} />
      <Text className={`text-xs font-bold ${textColor}`}>{label}</Text>
    </View>
  );
}