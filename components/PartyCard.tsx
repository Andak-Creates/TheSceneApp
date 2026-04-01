import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export interface PartyCardItem {
  id: string;
  title: string;
  flyer_url?: string | null;
  thumbnail_url?: string | null;
  date?: string | null;
  city?: string | null;
  date_tba?: boolean;
  views_count?: number;
  host_profile?: { name: string; is_verified?: boolean } | null;
}

interface PartyCardProps {
  party: PartyCardItem;
}

/** Returns true if the URL looks like a raw video file (not an image) */
function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0]; // strip query params
  return lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm");
}

/**
 * Resolves the best preview image URI for a party card.
 * Priority: flyer_url (if it's an image) → thumbnail_url → null
 */
function resolvePreviewUri(
  flyerUrl: string | null | undefined,
  thumbnailUrl: string | null | undefined,
): { uri: string; isThumb: boolean } | null {
  if (flyerUrl && (flyerUrl.startsWith("http") || flyerUrl.startsWith("https"))) {
    if (!isVideoUrl(flyerUrl)) {
      return { uri: flyerUrl, isThumb: false };
    }
  }
  if (thumbnailUrl && (thumbnailUrl.startsWith("http") || thumbnailUrl.startsWith("https"))) {
    return { uri: thumbnailUrl, isThumb: true };
  }
  return null;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "TBA";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function PartyCard({ party }: PartyCardProps) {
  const router = useRouter();
  const preview = resolvePreviewUri(party.flyer_url, party.thumbnail_url);

  const renderHostPill = () => {
    if (!party.host_profile?.name) return null;
    return (
      <View className="absolute top-2 left-2 flex-row items-center bg-black/60 px-2.5 py-1 rounded-full border border-white/10 z-10 max-w-[80%] shadow-sm">
        <Text className="text-white text-[10px] font-semibold" numberOfLines={1}>
          {party.host_profile.name}
        </Text>
        {party.host_profile.is_verified && (
          <Ionicons name="checkmark-circle" size={10} color="#a855f7" style={{ marginLeft: 5 }} />
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={{ flex: 1 }}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: "/party/[id]", params: { id: party.id } })}
    >
      <View className="bg-[#150d1e] rounded-2xl overflow-hidden border border-white/5">
        {preview ? (
          <View className="relative">
            {renderHostPill()}
            <ExpoImage
              source={{ uri: preview.uri }}
              className="w-full"
              style={{ aspectRatio: 4 / 5 }}
              contentFit="cover"
              transition={200}
            />
            {preview.isThumb && (
              <View className="absolute top-2 right-2 bg-black/60 rounded-full p-1 z-10">
                <Ionicons name="videocam" size={12} color="#fff" />
              </View>
            )}
          </View>
        ) : (
          <View
            className="w-full relative bg-white/5 items-center justify-center"
            style={{ aspectRatio: 4 / 5 }}
          >
            {renderHostPill()}
            <Ionicons name="image-outline" size={36} color="#444" />
          </View>
        )}
        <View className="p-3">
          <Text className="text-white font-bold text-sm mb-1.5" numberOfLines={1}>
            {party.title}
          </Text>
          <View className="flex-row items-center bg-white/5 self-start px-2 py-1 rounded-full mb-1.5">
            <Ionicons name="calendar-outline" size={10} color="#a855f7" />
            <Text className="text-gray-300 text-[10px] ml-1 font-medium">
              {party.date_tba ? "Date TBA" : formatDate(party.date)}
            </Text>
          </View>
          {party.city ? (
            <View className="flex-row items-center bg-white/5 self-start px-2 py-1 rounded-full mb-1.5">
              <Ionicons name="location-outline" size={10} color="#a855f7" />
              <Text className="text-gray-300 text-[10px] ml-1 font-medium" numberOfLines={1}>
                {party.city}
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-center">
            <Ionicons name="eye-outline" size={10} color="#6b7280" />
            <Text className="text-gray-500 text-[10px] ml-1">
              {party.views_count || 0} views
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
