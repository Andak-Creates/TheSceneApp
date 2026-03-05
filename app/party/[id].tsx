import CommentsBottomSheet from "@/components/CommentsBottomSheet";
import MediaGalleryViewer from "@/components/MediaGalleryViewer";
import TBAToggle from "@/components/TBAToggle";
import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Image as RNImage,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Party {
  id: string;
  title: string;
  description: string | null;
  flyer_url: string;
  date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  ticket_price: number | null;
  ticket_quantity: number;
  tickets_sold: number;
  music_genres: string[];
  vibes: string[];
  host_id: string;
  // TBA fields
  date_tba?: boolean;
  location_tba?: boolean;
  ticket_price_tba?: boolean;
  // New fields
  lineup?: string[];
  dress_code?: string;
  host?: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_host: boolean;
  };
  host_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
  media?: {
    id: string;
    media_url: string;
    media_type: "image" | "video";
    is_primary: boolean;
    display_order: number;
    thumbnail_url?: string;
  }[];
}

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  reply_count: number;
  parent_comment_id: string | null;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantity_sold: number;
}

export default function PartyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const partyId = params.id as string;
  const viewRecorded = useRef(false);
  const { setActiveVideoId } = useAudioStore();
  const { setFeedActive } = useAudioStore();

  useFocusEffect(
    useCallback(() => {
      setFeedActive(false); // pause feed when this screen is focused
      return () => {
        setFeedActive(true); // resume feed when leaving
      };
    }, []),
  );

  useEffect(() => {
    // Kill any feed video when this screen mounts
    setActiveVideoId(null);
  }, []);

  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);

  // Floating button movement
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
    Dimensions.get("window");
  const translateX = useSharedValue(SCREEN_WIDTH - 80); // Start near right
  const translateY = useSharedValue(SCREEN_HEIGHT - 200); // Start above tickets bar
  const context = useSharedValue({ x: 0, y: 0 });

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value = context.value.x + event.translationX;
      translateY.value = context.value.y + event.translationY;
    })
    .onEnd(() => {
      // Snap to horizontal edges
      const snapTo =
        translateX.value > SCREEN_WIDTH / 2 ? SCREEN_WIDTH - 80 : 20;
      translateX.value = withSpring(snapTo);

      // Constraints for vertical (stay within 100 to SCREEN_HEIGHT - 160)
      if (translateY.value < 100) {
        translateY.value = withSpring(100);
      } else if (translateY.value > SCREEN_HEIGHT - 160) {
        translateY.value = withSpring(SCREEN_HEIGHT - 160);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // Editing States
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedLocation, setEditedLocation] = useState("");
  const [editedCity, setEditedCity] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedDateTba, setEditedDateTba] = useState(false);
  const [editedLocationTba, setEditedLocationTba] = useState(false);
  const [editedDressCode, setEditedDressCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Ticket States
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalSold, setTotalSold] = useState(0);
  const [minPrice, setMinPrice] = useState(0);

  const recordPartyView = async () => {
    if (!partyId || viewRecorded.current) return;

    try {
      await supabase.from("party_views").insert({
        party_id: partyId,
        user_id: user?.id ?? null,
      });

      viewRecorded.current = true; // prevent duplicate view in same session
    } catch (error) {
      console.log("View tracking failed:", error);
    }
  };

  useEffect(() => {
    if (partyId) {
      fetchPartyDetails();
      fetchTicketTiers();
      recordPartyView();
    }
  }, [partyId]);

  // ✅ NEW FUNCTION TO FETCH TICKET TIERS
  const fetchTicketTiers = async () => {
    try {
      const { data: tiersData, error } = await supabase
        .from("ticket_tiers")
        .select("*")
        .eq("party_id", partyId)
        .eq("is_active", true)
        .order("tier_order", { ascending: true });

      if (error) throw error;

      if (tiersData && tiersData.length > 0) {
        setTicketTiers(tiersData);

        // Calculate totals from tiers
        const total = tiersData.reduce((sum, tier) => sum + tier.quantity, 0);
        const sold = tiersData.reduce(
          (sum, tier) => sum + (tier.quantity_sold || 0),
          0,
        );
        const lowest = Math.min(...tiersData.map((t) => t.price));

        setTotalTickets(total);
        setTotalSold(sold);
        setMinPrice(lowest);
      }
    } catch (error) {
      console.error("Error fetching ticket tiers:", error);
    }
  };

  const fetchPartyDetails = async () => {
    try {
      const { data: partyData, error: partyError } = await supabase
        .from("parties")
        .select(
          `
          *,
          host:profiles!host_id (
            id,
            username,
            full_name,
            avatar_url,
            is_host
          ),
          host_profile:host_profiles!host_profile_id (
            id,
            name,
            avatar_url
          ),
          media:party_media(*)
        `,
        )
        .eq("id", partyId)
        .single();

      if (partyError) throw partyError;

      // Sort media: primary first, then by display_order
      if (partyData.media && Array.isArray(partyData.media)) {
        // Filter out non-http(s) urls (broken legacy local paths)
        partyData.media = partyData.media.filter(
          (m: any) =>
            m.media_url &&
            (m.media_url.startsWith("http") || m.media_url.startsWith("https")),
        );

        partyData.media.sort((a: any, b: any) => {
          if (a.is_primary) return -1;
          if (b.is_primary) return 1;
          return (a.display_order || 0) - (b.display_order || 0);
        });
      }

      // Get engagement counts
      const { count: likesCount } = await supabase
        .from("party_likes")
        .select("*", { count: "exact", head: true })
        .eq("party_id", partyId);

      const { count: commentsCount } = await supabase
        .from("party_comments")
        .select("*", { count: "exact", head: true })
        .eq("party_id", partyId);

      // Check if user liked and bookmarked
      let isLiked = false;
      let isBookmarked = false;
      if (user) {
        const [likeRes, bookmarkRes] = await Promise.all([
          supabase
            .from("party_likes")
            .select("id")
            .eq("party_id", partyId)
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("party_bookmarks")
            .select("id")
            .eq("party_id", partyId)
            .eq("user_id", user.id)
            .single(),
        ]);
        isLiked = !!likeRes.data;
        isBookmarked = !!bookmarkRes.data;
      }

      setParty({
        ...partyData,
        likes_count: likesCount || 0,
        comments_count: commentsCount || 0,
        is_liked: isLiked,
        is_bookmarked: isBookmarked,
      });
    } catch (error) {
      console.error("Error fetching party:", error);
      Alert.alert("Error", "Failed to load party details");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateParty = async () => {
    if (!party) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("parties")
        .update({
          title: editedTitle.trim(),
          description: editedDescription.trim(),
          location: editedLocation.trim(),
          city: editedCity.trim(),
          date: editedDateTba ? null : editedDate,
          date_tba: editedDateTba,
          location_tba: editedLocationTba,
          dress_code: editedDressCode.trim() || null,
        })
        .eq("id", partyId);

      if (error) throw error;

      setParty({
        ...party,
        title: editedTitle,
        description: editedDescription,
        location: editedLocation.trim(),
        city: editedCity.trim(),
        date: editedDateTba ? null : editedDate,
        date_tba: editedDateTba,
        location_tba: editedLocationTba,
        dress_code: editedDressCode.trim() || null,
      } as Party);
      setIsEditing(false);
      Alert.alert("Success", "Party updated successfully");
    } catch (error) {
      console.error("Error updating party:", error);
      Alert.alert("Error", "Failed to update party");
    } finally {
      setSaving(false);
    }
  };

  const toggleEditing = () => {
    if (!isEditing && party) {
      setEditedTitle(party.title);
      setEditedDescription(party.description || "");
      setEditedLocation(party.location || "");
      setEditedCity(party.city || "");
      setEditedDate(party.date || "");
      setEditedDateTba(party.date_tba || false);
      setEditedLocationTba(party.location_tba || false);
      setEditedDressCode(party.dress_code || "");
    }
    setIsEditing(!isEditing);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (selectedDate) {
      const current = editedDate ? new Date(editedDate) : new Date();
      current.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      setEditedDate(current.toISOString());
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === "ios");
    if (selectedTime) {
      const current = editedDate ? new Date(editedDate) : new Date();
      current.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setEditedDate(current.toISOString());
    }
  };

  const handleAddMedia = async () => {
    if (!user || !party) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please grant photo library access");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets[0].base64) return;

      setSaving(true);
      const asset = result.assets[0];
      const isVideo = asset.type === "video";
      const fileExt = isVideo ? "mp4" : "jpg";
      const fileName = `${partyId}/${Date.now()}.${fileExt}`;
      const filePath = `parties/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("party-media")
        .upload(filePath, decode(asset.base64!), {
          contentType: isVideo ? "video/mp4" : "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("party-media").getPublicUrl(filePath);

      // Insert into database
      const { error: dbError } = await supabase.from("party_media").insert({
        party_id: partyId,
        media_url: publicUrl,
        media_type: isVideo ? "video" : "image",
        display_order: (party.media?.length || 0) + 1,
        is_primary: (party.media?.length || 0) === 0,
      });

      if (dbError) throw dbError;

      await fetchPartyDetails();
      Alert.alert("Success", "Media added successfully");
    } catch (error: any) {
      console.error("Error adding media:", error);
      Alert.alert("Error", error.message || "Failed to add media");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    Alert.alert(
      "Remove Media",
      "Are you sure you want to remove this image/video?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              const { error } = await supabase
                .from("party_media")
                .delete()
                .eq("id", mediaId)
                .eq("party_id", partyId);

              if (error) throw error;

              await fetchPartyDetails();
            } catch (error) {
              console.error("Error deleting media:", error);
              Alert.alert("Error", "Failed to remove media");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleLike = async () => {
    if (!user || !party) return;

    const wasLiked = party.is_liked;

    setParty({
      ...party,
      is_liked: !wasLiked,
      likes_count: wasLiked ? party.likes_count! - 1 : party.likes_count! + 1,
    });

    try {
      if (wasLiked) {
        await supabase
          .from("party_likes")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase.from("party_likes").insert({
          party_id: partyId,
          user_id: user.id,
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      setParty({
        ...party,
        is_liked: wasLiked,
        likes_count: wasLiked ? party.likes_count! + 1 : party.likes_count! - 1,
      });
    }
  };

  const handleShareLink = async () => {
    if (!party) return;
    const url = `https://thescene.app/party/${partyId}`;
    try {
      await Share.share({
        message: `Check out "${party.title}" on TheScene! ${url}`,
        url: Platform.OS !== "web" ? url : undefined,
        title: party.title,
      });
    } catch (e) {
      // User cancelled or share failed
    }
  };

  const handleBookmark = async () => {
    if (!user || !party) return;
    const wasBookmarked = party.is_bookmarked;
    setParty({ ...party, is_bookmarked: !wasBookmarked });
    try {
      if (wasBookmarked) {
        await supabase
          .from("party_bookmarks")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase.from("party_bookmarks").insert({
          party_id: partyId,
          user_id: user.id,
        });
      }
    } catch (error) {
      setParty({ ...party, is_bookmarked: wasBookmarked });
    }
  };

  const handleOpenMaps = () => {
    if (!party) return;
    if (party.location_tba) return;

    const address = encodeURIComponent(`${party.location}, ${party.city}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${address}`;
    Linking.openURL(url);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
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

  if (loading) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (!party) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <Text className="text-white">Party not found</Text>
      </View>
    );
  }

  // ✅ CALCULATE REMAINING FROM TIERS
  const ticketsRemaining = totalTickets - totalSold;
  const displayPrice = ticketTiers.length > 0 ? minPrice : party.ticket_price;
  // ✅ Check if event is over
  const now = new Date();
  const eventEndTime = party.end_date
    ? new Date(party.end_date)
    : party.date
      ? new Date(party.date)
      : null;
  const eventEnded = eventEndTime ? now > eventEndTime : false;

  return (
    <View className="flex-1 bg-[#191022]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Header with Back Button */}
        <View className="absolute top-12 left-4 right-4 z-10 flex-row justify-between items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View className="flex-row gap-2">
            {user?.id === party.host_id && (
              <View className="flex-row gap-2">
                {!isEditing && (
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/party/[id]/analytics",
                          params: { id: partyId },
                        })
                      }
                      className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                    >
                      <Ionicons
                        name="stats-chart-outline"
                        size={20}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => router.push("/host/earnings")}
                      className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                    >
                      <Ionicons name="wallet-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  onPress={isEditing ? handleUpdateParty : toggleEditing}
                  disabled={saving}
                  className={`px-4 h-10 rounded-full items-center justify-center flex-row ${
                    isEditing ? "bg-green-600" : "bg-purple-600"
                  }`}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View className="flex-row items-center">
                      <Ionicons
                        name={isEditing ? "checkmark" : "create-outline"}
                        size={20}
                        color="#fff"
                      />
                      <Text className="text-white font-bold ml-1">
                        {isEditing ? "Save" : "Edit"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {isEditing && (
              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            )}

            {!isEditing && (
              <TouchableOpacity
                onPress={handleShareLink}
                className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
              >
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Media Gallery */}
        <View className="relative">
          {party.media && party.media.length > 0 ? (
            <MediaGalleryViewer
              media={party.media}
              showDelete={isEditing}
              onDelete={handleDeleteMedia}
            />
          ) : party.flyer_url &&
            (party.flyer_url.startsWith("http") ||
              party.flyer_url.startsWith("https")) ? (
            <View style={{ aspectRatio: 4 / 5 }} className="w-full relative">
              <RNImage
                source={{ uri: party.flyer_url }}
                className="w-full h-full"
                resizeMode="cover"
              />
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(25,16,34,0.8)",
                  "rgba(25,16,34,1)",
                ]}
                className="absolute inset-0"
              />
            </View>
          ) : (
            <View
              style={{ aspectRatio: 4 / 5 }}
              className="w-full bg-gray-800 items-center justify-center"
            >
              <Ionicons name="image-outline" size={64} color="#444" />
            </View>
          )}

          {isEditing && (
            <TouchableOpacity
              onPress={handleAddMedia}
              className="absolute bottom-10 right-6 bg-purple-600 w-12 h-12 rounded-full items-center justify-center shadow-lg border border-purple-500/30"
            >
              <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Party Title & Description */}
        <View className="px-6 py-4">
          {isEditing ? (
            <TextInput
              className="text-white text-3xl font-bold bg-white/5 p-2 rounded-lg mb-2"
              value={editedTitle}
              onChangeText={setEditedTitle}
              placeholder="Party Title"
              placeholderTextColor="#666"
            />
          ) : (
            <Text className="text-white text-3xl font-bold">{party.title}</Text>
          )}

          <Text className="text-purple-400 font-semibold mb-2">
            Hosted by {party.host_profile?.name || "Unknown Brand"}
          </Text>

          {isEditing ? (
            <TextInput
              className="text-gray-300 text-base bg-white/5 p-2 rounded-lg mb-4"
              value={editedDescription}
              onChangeText={setEditedDescription}
              placeholder="Party Description"
              placeholderTextColor="#666"
              multiline
            />
          ) : (
            party.description && (
              <Text className="text-gray-300 text-base mb-4">
                {party.description}
              </Text>
            )
          )}
        </View>

        {/* Party Info */}
        <View className="px-6 pb-6">
          {/* Date & Time */}
          <View className=" mb-4 flex flex-row items-center">
            <View className="bg-white/5 rounded-2xl p-4">
              <Ionicons name="calendar" size={20} color="#8B5CF6" />
            </View>
            <View className="ml-3 flex-1">
              {isEditing ? (
                <View>
                  <TBAToggle
                    label="Date & Time TBA"
                    value={editedDateTba}
                    onChange={setEditedDateTba}
                  />
                  {!editedDateTba && (
                    <View className="flex-row gap-2 mt-2">
                      <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-row items-center justify-between"
                      >
                        <Text className="text-white font-medium">
                          {editedDate
                            ? new Date(editedDate).toLocaleDateString()
                            : "Select Date"}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color="#8B5CF6"
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setShowTimePicker(true)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex-row items-center justify-between"
                      >
                        <Text className="text-white font-medium">
                          {editedDate
                            ? new Date(editedDate).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Select Time"}
                        </Text>
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color="#8B5CF6"
                        />
                      </TouchableOpacity>
                    </View>
                  )}

                  {showDatePicker && (
                    <Modal
                      transparent
                      animationType="fade"
                      visible={showDatePicker}
                    >
                      <View className="flex-1 justify-center bg-black/80 px-4">
                        <View className="bg-[#191022] rounded-3xl overflow-hidden">
                          <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                            <TouchableOpacity
                              onPress={() => setShowDatePicker(false)}
                            >
                              <Text className="text-gray-400 font-semibold">
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text className="text-white font-bold">
                              Select Date
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowDatePicker(false)}
                            >
                              <Text className="text-purple-500 font-bold">
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <View className="p-4 bg-[#191022]">
                            <DateTimePicker
                              value={
                                editedDate ? new Date(editedDate) : new Date()
                              }
                              mode="date"
                              display={
                                Platform.OS === "ios" ? "spinner" : "default"
                              }
                              textColor="white"
                              onChange={onDateChange}
                            />
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}

                  {showTimePicker && (
                    <Modal
                      transparent
                      animationType="fade"
                      visible={showTimePicker}
                    >
                      <View className="flex-1 justify-center bg-black/80 px-4">
                        <View className="bg-[#191022] rounded-3xl overflow-hidden">
                          <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                            <TouchableOpacity
                              onPress={() => setShowTimePicker(false)}
                            >
                              <Text className="text-gray-400 font-semibold">
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text className="text-white font-bold">
                              Select Time
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowTimePicker(false)}
                            >
                              <Text className="text-purple-500 font-bold">
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <View className="p-4 bg-[#191022]">
                            <DateTimePicker
                              value={
                                editedDate ? new Date(editedDate) : new Date()
                              }
                              mode="time"
                              display={
                                Platform.OS === "ios" ? "spinner" : "default"
                              }
                              textColor="white"
                              onChange={onTimeChange}
                            />
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>
              ) : (
                <View>
                  <Text className="text-white font-semibold text-base">
                    {party.date_tba ? "Date TBA" : formatDate(party.date)}
                  </Text>
                  {!party.date_tba && (
                    <Text className="text-gray-400 text-sm">
                      {formatTime(party.date)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Location */}
          <TouchableOpacity
            className=" mb-8 flex-row items-center"
            onPress={handleOpenMaps}
            disabled={!!party.location_tba || isEditing}
          >
            <View className="bg-white/5 rounded-2xl p-4">
              <Ionicons name="location" size={20} color="#8B5CF6" />
            </View>

            <View className="ml-3 flex-1">
              {isEditing ? (
                <View>
                  <TBAToggle
                    label="Location TBA"
                    value={editedLocationTba}
                    onChange={setEditedLocationTba}
                  />
                  {!editedLocationTba && (
                    <View className="gap-2 mt-2">
                      <TextInput
                        className="text-white font-semibold text-base bg-white/5 p-3 rounded-xl border border-white/10"
                        value={editedLocation}
                        onChangeText={setEditedLocation}
                        placeholder="Venue Name"
                        placeholderTextColor="#666"
                      />
                      <TextInput
                        className="text-gray-400 text-sm bg-white/5 p-2 rounded-lg"
                        value={editedCity}
                        onChangeText={setEditedCity}
                        placeholder="City"
                        placeholderTextColor="#666"
                      />
                    </View>
                  )}
                </View>
              ) : (
                <View>
                  <Text className="text-white font-semibold text-base">
                    {party.location_tba ? "Location TBA" : party.location}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {party.location_tba ? "Venue to be announced" : party.city}
                  </Text>
                </View>
              )}
            </View>
            {!party.location_tba && !isEditing && (
              <Ionicons name="chevron-forward" size={20} color="#666" />
            )}
          </TouchableOpacity>

          {/* Music & Vibes */}
          <View className="mb-6">
            <Text className="text-white font-bold text-base mb-2">
              Music & Vibe
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {party.music_genres.map((genre) => (
                <View
                  key={genre}
                  className="bg-purple-600/20 px-3 py-2 rounded-full"
                >
                  <Text className="text-purple-300 text-sm">{genre}</Text>
                </View>
              ))}
              {party.vibes.map((vibe) => (
                <View key={vibe} className="bg-white/10 px-3 py-2 rounded-full">
                  <Text className="text-gray-300 text-sm">{vibe}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Additional Info Grid */}
          <View className="flex-row flex-wrap gap-3 mb-6">
            {/* Dress Code */}
            {isEditing ? (
              <View className="w-full bg-white/5 p-3 rounded-xl border border-white/10">
                <Text className="text-gray-400 text-xs mb-1">Dress Code</Text>
                <TextInput
                  className="text-white font-semibold bg-white/5 p-1 rounded"
                  value={editedDressCode}
                  onChangeText={setEditedDressCode}
                  placeholder="e.g., Smart Casual"
                  placeholderTextColor="#666"
                />
              </View>
            ) : (
              party.dress_code && (
                <View className="w-full bg-white/5 p-3 rounded-xl border border-white/10">
                  <Text className="text-gray-400 text-xs mb-1">Dress Code</Text>
                  <Text className="text-white font-semibold">
                    {party.dress_code}
                  </Text>
                </View>
              )
            )}
          </View>

          {/* ✅ UPDATED TICKET INFO - NOW USES TIERS */}
          {/* If Price is TBA, we can hide exact price or show TBA */}
          <View className="bg-purple-600/10 border border-purple-600/30 rounded-2xl p-4 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-white font-bold text-lg">Tickets</Text>
              <Text className="text-purple-400 font-bold text-xl">
                {party.ticket_price_tba
                  ? "Price TBA"
                  : `${ticketTiers.length > 1 ? "From " : ""}₦${displayPrice?.toLocaleString() ?? "0"}`}
              </Text>
            </View>
            {!party.ticket_price_tba && (
              <Text className="text-gray-400 text-sm">
                {ticketsRemaining} of {totalTickets} available
              </Text>
            )}

            {/* ✅ SHOW TIER BREAKDOWN IF MULTIPLE TIERS AND NOT TBA */}
            {!party.ticket_price_tba && ticketTiers.length > 1 && (
              <View className="mt-3 pt-3 border-t border-white/10">
                {ticketTiers.map((tier) => (
                  <View
                    key={tier.id}
                    className="flex-row justify-between items-center py-1"
                  >
                    <Text className="text-gray-400 text-xs">{tier.name}</Text>
                    <Text className="text-gray-400 text-xs">
                      {tier.quantity - tier.quantity_sold}/{tier.quantity} left
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Engagement Stats */}
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              className="flex-row items-center mr-6"
              onPress={handleLike}
            >
              <Ionicons
                name={party.is_liked ? "heart" : "heart-outline"}
                size={28}
                color={party.is_liked ? "#ef4444" : "#fff"}
              />
              <Text className="text-white ml-2 font-semibold text-base">
                {party.likes_count}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center"
              onPress={handleBookmark}
            >
              <Ionicons
                name={party.is_bookmarked ? "bookmark" : "bookmark-outline"}
                size={26}
                color={party.is_bookmarked ? "#a855f7" : "#fff"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Floating Comment Button (Draggable) */}
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[{ position: "absolute", zIndex: 50 }, animatedStyle]}
        >
          <TouchableOpacity
            onPress={() => setIsCommentsVisible(true)}
            activeOpacity={0.8}
            className="w-14 h-14 bg-purple-600 rounded-full items-center justify-center shadow-lg border border-purple-500/30"
          >
            <Ionicons name="chatbubble-outline" size={26} color="#fff" />
            {party?.comments_count! > 0 && (
              <View className="absolute -top-1 -right-1 bg-red-500 rounded-full px-1.5 py-0.5 border-2 border-[#191022]">
                <Text className="text-white text-[10px] font-bold">
                  {party?.comments_count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>

      {/* Fixed Bottom Tickets Button */}
      <View className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#191022] to-transparent">
        <TouchableOpacity
          disabled={eventEnded}
          onPress={() =>
            !eventEnded &&
            router.push({
              pathname: "/party/[id]/tickets",
              params: { id: partyId },
            })
          }
          className={`w-full py-4 rounded-xl items-center ${
            eventEnded ? "bg-gray-700" : "bg-purple-600"
          }`}
        >
          <Text className="text-white font-bold text-lg">
            {eventEnded
              ? "This event has ended"
              : party.ticket_price_tba
                ? "Get Tickets • TBA"
                : `Get Tickets • ${ticketTiers.length > 1 ? "From " : ""}₦${displayPrice?.toLocaleString() ?? "0"}`}
          </Text>
        </TouchableOpacity>
      </View>

      <CommentsBottomSheet
        partyId={partyId}
        isVisible={isCommentsVisible}
        onClose={() => setIsCommentsVisible(false)}
      />
    </View>
  );
}
