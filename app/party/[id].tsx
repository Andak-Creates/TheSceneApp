import AttendancePill from "@/components/AttendancePill";
import CommentsBottomSheet from "@/components/CommentsBottomSheet";
import MediaGalleryViewer from "@/components/MediaGalleryViewer";
import TBAToggle from "@/components/TBAToggle";
import { shareParty } from "@/lib/share";
import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Switch,
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
import { getCurrencySymbol } from "../../lib/currency";
import { queryKeys } from "../../lib/queryKeys";
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
  currency_code?: string;
  // TBA fields
  date_tba?: boolean;
  location_tba?: boolean;
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
  has_ticket?: boolean;
  has_reviewed?: boolean;
  show_ticket_count?: boolean;
}

interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantity_sold: number;
  max_per_order?: number | null;
}

export default function PartyDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuthStore();
  const partyId = params.id as string;
  const openComments = params.openComments === "true";
  const viewRecorded = useRef(false);
  const { setActiveVideoId } = useAudioStore();
  const [isFocused, setIsFocused] = useState(true);
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useEffect(() => {
    // Kill any feed video when this screen mounts
    setActiveVideoId(null);
  }, []);

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

  // Ticket Management States
  const [isManagingTickets, setIsManagingTickets] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierQuantity, setNewTierQuantity] = useState("");
  const [restockAmounts, setRestockAmounts] = useState<{
    [key: string]: string;
  }>({});
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierName, setEditTierName] = useState("");
  const [editTierPrice, setEditTierPrice] = useState("");
  const [editTierMaxPerOrder, setEditTierMaxPerOrder] = useState("");
  const [editTierLimitOn, setEditTierLimitOn] = useState(true);
  const [newTierMaxPerOrder, setNewTierMaxPerOrder] = useState("2");
  const [newTierLimitOn, setNewTierLimitOn] = useState(true);

  // Ticket count visibility toggle
  const [showTicketCount, setShowTicketCount] = useState(true);

  const recordPartyView = async () => {
    if (!partyId || viewRecorded.current) return;
    viewRecorded.current = true; // prevent duplicate calls in the same session

    try {
      if (user) {
        // Check if this user already viewed this party (unique per user)
        const { data: existing } = await supabase
          .from("party_views")
          .select("id")
          .eq("party_id", partyId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) return; // already counted — don't add another row
      }

      await supabase.from("party_views").insert({
        party_id: partyId,
        user_id: user?.id ?? null,
      });
    } catch (error) {
      console.log("View tracking failed:", error);
    }
  };

  useEffect(() => {
    if (partyId) recordPartyView();
  }, [partyId]);

  // ---------------------------------------------------------------------------
  // Pure fetch functions — return data for useQuery
  // ---------------------------------------------------------------------------
  async function fetchPartyDetails(): Promise<Party> {
    const { data: partyData, error: partyError } = await supabase
      .from("parties")
      .select(
        `
        *,
        host:profiles!host_id (id, username, full_name, avatar_url, is_host),
        host_profile:host_profiles!host_profile_id (id, name, avatar_url),
        media:party_media(*)
      `,
      )
      .eq("id", partyId)
      .single();
    if (partyError) throw partyError;

    if (partyData.media && Array.isArray(partyData.media)) {
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

    const [{ count: likesCount }, { count: commentsCount }] = await Promise.all(
      [
        supabase
          .from("party_likes")
          .select("*", { count: "exact", head: true })
          .eq("party_id", partyId),
        supabase
          .from("party_comments")
          .select("*", { count: "exact", head: true })
          .eq("party_id", partyId),
      ],
    );

    let isLiked = false,
      isBookmarked = false,
      hasTicket = false,
      hasReviewed = false;
    if (user) {
      const [likeRes, bookmarkRes, ticketRes, reviewRes] = await Promise.all([
        supabase
          .from("party_likes")
          .select("id")
          .eq("party_id", partyId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("party_bookmarks")
          .select("id")
          .eq("party_id", partyId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("tickets")
          .select("id")
          .eq("party_id", partyId)
          .eq("user_id", user.id)
          .eq("payment_status", "completed")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("reviews")
          .select("id")
          .eq("party_id", partyId)
          .eq("reviewer_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);
      isLiked = !!likeRes.data;
      isBookmarked = !!bookmarkRes.data;
      hasTicket = !!ticketRes.data;
      hasReviewed = !!reviewRes.data;
    }

    return {
      ...partyData,
      likes_count: likesCount || 0,
      comments_count: commentsCount || 0,
      is_liked: isLiked,
      is_bookmarked: isBookmarked,
      has_ticket: hasTicket,
      has_reviewed: hasReviewed,
    };
  }

  async function fetchTicketTiersData(): Promise<{
    tiers: TicketTier[];
    totalTickets: number;
    totalSold: number;
    minPrice: number;
  }> {
    const { data: tiersData, error } = await supabase
      .from("ticket_tiers")
      .select("*")
      .eq("party_id", partyId)
      .eq("is_active", true)
      .order("tier_order", { ascending: true });
    if (error) throw error;
    const tiers = tiersData || [];
    return {
      tiers,
      totalTickets: tiers.reduce((s, t) => s + t.quantity, 0),
      totalSold: tiers.reduce((s, t) => s + (t.quantity_sold || 0), 0),
      minPrice: tiers.length > 0 ? Math.min(...tiers.map((t) => t.price)) : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // useQuery hooks
  // ---------------------------------------------------------------------------
  const partyQuery = useQuery({
    queryKey: queryKeys.partyDetail(partyId),
    queryFn: fetchPartyDetails,
    enabled: !!partyId,
    staleTime: 60 * 1000, // 1 minute
  });

  const tiersQuery = useQuery({
    queryKey: queryKeys.partyTiers(partyId),
    queryFn: fetchTicketTiersData,
    enabled: !!partyId,
    staleTime: 60 * 1000,
  });

  const party = partyQuery.data ?? null;
  const loading = partyQuery.isLoading;
  const ticketTiers: TicketTier[] = tiersQuery.data?.tiers ?? [];
  const totalTickets = tiersQuery.data?.totalTickets ?? 0;
  const totalSold = tiersQuery.data?.totalSold ?? 0;
  const minPrice = tiersQuery.data?.minPrice ?? 0;
  const currencySymbol = getCurrencySymbol(party?.currency_code || "NGN");

  // Sync showTicketCount from DB whenever party data loads/changes
  useEffect(() => {
    if (party) {
      setShowTicketCount(party.show_ticket_count ?? true);
    }
  }, [party?.show_ticket_count]);

  const invalidateParty = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.partyDetail(partyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.partyTiers(partyId) });
  };

  const handleToggleShowTicketCount = async (value: boolean) => {
    setShowTicketCount(value); // optimistic
    try {
      const { error } = await supabase
        .from("parties")
        .update({ show_ticket_count: value })
        .eq("id", partyId);
      if (error) throw error;
      queryClient.setQueryData(
        queryKeys.partyDetail(partyId),
        (old: Party | undefined) => old ? { ...old, show_ticket_count: value } : old,
      );
    } catch (e) {
      setShowTicketCount(!value); // revert on failure
      Alert.alert("Error", "Failed to update setting.");
    }
  };

  const handleRestockTier = async (tierId: string, currentQuantity: number) => {
    if (!party) return;
    const additional = parseInt(restockAmounts[tierId] || "0");
    if (isNaN(additional) || additional <= 0) {
      Alert.alert("Error", "Please enter a valid quantity to add");
      return;
    }

    setSaving(true);
    try {
      const newTotal = currentQuantity + additional;
      const { error: tierError } = await supabase
        .from("ticket_tiers")
        .update({ quantity: newTotal })
        .eq("id", tierId);

      if (tierError) throw tierError;

      // Update party total quantity
      const { data: partyData } = await supabase
        .from("parties")
        .select("ticket_quantity")
        .eq("id", partyId)
        .single();

      const { error: partyError } = await supabase
        .from("parties")
        .update({
          ticket_quantity: (partyData?.ticket_quantity || 0) + additional,
        })
        .eq("id", partyId);

      if (partyError) throw partyError;

      setRestockAmounts((prev) => ({ ...prev, [tierId]: "" }));
      await invalidateParty();
      Alert.alert("Success", "Tickets restocked successfully");
    } catch (error) {
      console.error("Error restocking tickets:", error);
      Alert.alert("Error", "Failed to restock tickets");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTier = async (tierId: string) => {
    if (!party || !editTierName.trim() || !editTierPrice.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const price = parseFloat(editTierPrice.replace(/,/g, ""));
    if (isNaN(price)) {
      Alert.alert("Error", "Please enter a valid price");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ticket_tiers")
        .update({
          name: editTierName.trim(),
          price: price,
          max_per_order: editTierLimitOn && editTierMaxPerOrder.trim() !== "" ? parseInt(editTierMaxPerOrder) : null,
        })
        .eq("id", tierId);

      if (error) throw error;

      // Update party min price if needed
      if (price < (party.ticket_price || 999999)) {
        await supabase
          .from("parties")
          .update({ ticket_price: price })
          .eq("id", partyId);
      }

      setEditingTierId(null);
      await invalidateParty();
      Alert.alert("Success", "Tier updated successfully");
    } catch (error) {
      console.error("Error updating tier:", error);
      Alert.alert("Error", "Failed to update tier");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async (tierId: string, quantitySold: number) => {
    const message =
      quantitySold > 0
        ? "This tier has already sold tickets. Deleting it will only hide it from new buyers. Are you sure?"
        : "Are you sure you want to delete this ticket tier?";

    Alert.alert("Delete Tier", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            // Soft delete
            const { error } = await supabase
              .from("ticket_tiers")
              .update({ is_active: false })
              .eq("id", tierId);

            if (error) throw error;

            await invalidateParty();
            Alert.alert("Success", "Tier removed");
          } catch (error) {
            console.error("Error deleting tier:", error);
            Alert.alert("Error", "Failed to delete tier");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleAddNewTier = async () => {
    if (!party) return;
    if (
      !newTierName.trim() ||
      !newTierPrice.trim() ||
      !newTierQuantity.trim()
    ) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const price = parseFloat(newTierPrice.replace(/,/g, ""));
    const quantity = parseInt(newTierQuantity);

    if (isNaN(price) || isNaN(quantity) || quantity <= 0) {
      Alert.alert("Error", "Please enter valid price and quantity");
      return;
    }

    setSaving(true);
    try {
      const { error: tierError } = await supabase.from("ticket_tiers").insert({
        party_id: partyId,
        name: newTierName.trim(),
        price: price,
        quantity: quantity,
        quantity_sold: 0,
        tier_order: ticketTiers.length,
        is_active: true,
        currency_code: party?.currency_code || "NGN",
        max_per_order: newTierLimitOn && newTierMaxPerOrder.trim() !== "" ? parseInt(newTierMaxPerOrder) : null,
      });

      if (tierError) throw tierError;

      // Update party total quantity
      const { data: partyData } = await supabase
        .from("parties")
        .select("ticket_quantity")
        .eq("id", partyId)
        .single();

      const { error: partyError } = await supabase
        .from("parties")
        .update({
          ticket_quantity: (partyData?.ticket_quantity || 0) + quantity,
          ticket_price:
            party?.ticket_price === null
              ? price
              : Math.min(party.ticket_price, price),
        })
        .eq("id", partyId);

      if (partyError) throw partyError;

      setNewTierName("");
      setNewTierPrice("");
      setNewTierQuantity("");
      setNewTierMaxPerOrder("2");
      setNewTierLimitOn(true);
      await invalidateParty();
      Alert.alert("Success", "New ticket tier added successfully");
    } catch (error) {
      console.error("Error adding ticket tier:", error);
      Alert.alert("Error", "Failed to add ticket tier");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!party) return;

    Alert.alert(
      "Delete Party",
      "Are you sure you want to permanently delete this party? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from("parties")
                .delete()
                .eq("id", partyId);

              if (error) throw error;

              Alert.alert("Success", "Party deleted successfully");
              router.replace("/host-dashboard");
            } catch (error) {
              console.error("Error deleting party:", error);
              Alert.alert("Error", "Failed to delete party");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleUpdateParty = async () => {
    if (!party) return;
    setSaving(true);
    try {
      // Track what changed to notify users
      const changedFields = [];
      if (editedTitle.trim() !== party.title) changedFields.push("title");
      if (editedDescription.trim() !== (party.description || ""))
        changedFields.push("description");
      if (editedLocation.trim() !== (party.location || ""))
        changedFields.push("location");
      if (editedCity.trim() !== (party.city || "")) changedFields.push("city");
      if (editedDate !== (party.date || "")) changedFields.push("date");
      if (editedDateTba !== party.date_tba) changedFields.push("date status");
      if (editedLocationTba !== party.location_tba)
        changedFields.push("location status");
      if (editedDressCode.trim() !== (party.dress_code || ""))
        changedFields.push("dress code");

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

      // Notify users if critical fields changed
      if (changedFields.length > 0) {
        supabase.functions
          .invoke("send-party-notifications", {
            body: {
              party_id: partyId,
              party_title: editedTitle.trim(),
              changed_fields: changedFields,
              notification_body: changedFields.join(", "),
            },
          })
          .catch((err) =>
            console.log("Update notification failed (non-fatal):", err),
          );
      }

      await invalidateParty();
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
        allowsEditing: false,
        quality: 0.7,
        base64: false,
      });

      if (result.canceled || !result.assets[0]) return;

      setSaving(true);
      const asset = result.assets[0];
      const isVideo = asset.type === "video";

      let uploadData: ArrayBuffer;
      let contentType: string;
      let fileExt: string;

      if (isVideo) {
        const response = await fetch(asset.uri);
        uploadData = await response.arrayBuffer();
        fileExt = asset.uri.split(".").pop()?.toLowerCase() || "mov";
        contentType = fileExt === "mp4" ? "video/mp4" : "video/quicktime";
      } else {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "base64" as any,
        });
        uploadData = decode(base64);
        fileExt = "jpg";
        contentType = "image/jpeg";
      }

      const filePath = `party-media/${partyId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("flyers")
        .upload(filePath, uploadData, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("flyers").getPublicUrl(filePath);

      // Generate thumbnail for videos
      let thumbnailUrl: string | null = null;
      if (isVideo) {
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(
            asset.uri,
            { time: 1000, quality: 0.6 },
          );

          const thumbBase64 = await FileSystem.readAsStringAsync(thumbUri, {
            encoding: "base64" as any,
          });

          const thumbPath = `party-media/${partyId}/thumb_${Date.now()}.jpg`;

          const { error: thumbUploadError } = await supabase.storage
            .from("flyers")
            .upload(thumbPath, decode(thumbBase64), {
              contentType: "image/jpeg",
              upsert: true,
            });

          if (!thumbUploadError) {
            const {
              data: { publicUrl: thumbPublicUrl },
            } = supabase.storage.from("flyers").getPublicUrl(thumbPath);
            thumbnailUrl = thumbPublicUrl;
          }
        } catch (thumbError) {
          console.log("Thumbnail generation failed (non-fatal):", thumbError);
        }
      }

      const { error: dbError } = await supabase.from("party_media").insert({
        party_id: partyId,
        media_url: publicUrl,
        media_type: isVideo ? "video" : "image",
        thumbnail_url: thumbnailUrl,
        display_order: (party.media?.length || 0) + 1,
        is_primary: (party.media?.length || 0) === 0,
      });

      if (dbError) throw dbError;

      await invalidateParty();
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

              await invalidateParty();
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
    const key = queryKeys.partyDetail(partyId);
    // Optimistic update
    queryClient.setQueryData(key, (old: Party | undefined) =>
      old
        ? {
            ...old,
            is_liked: !wasLiked,
            likes_count: wasLiked ? old.likes_count! - 1 : old.likes_count! + 1,
          }
        : old,
    );
    try {
      if (wasLiked) {
        await supabase
          .from("party_likes")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("party_likes")
          .insert({ party_id: partyId, user_id: user.id });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      // Revert
      queryClient.setQueryData(key, (old: Party | undefined) =>
        old
          ? {
              ...old,
              is_liked: wasLiked,
              likes_count: wasLiked
                ? old.likes_count! + 1
                : old.likes_count! - 1,
            }
          : old,
      );
    }
  };

  const handleShareLink = async () => {
    if (!party) return;
    await shareParty(partyId, party.title);
  };

  const handleBookmark = async () => {
    if (!user || !party) return;
    const wasBookmarked = party.is_bookmarked;
    const key = queryKeys.partyDetail(partyId);
    queryClient.setQueryData(key, (old: Party | undefined) =>
      old ? { ...old, is_bookmarked: !wasBookmarked } : old,
    );
    try {
      if (wasBookmarked) {
        await supabase
          .from("party_bookmarks")
          .delete()
          .eq("party_id", partyId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("party_bookmarks")
          .insert({ party_id: partyId, user_id: user.id });
      }
    } catch (error) {
      queryClient.setQueryData(key, (old: Party | undefined) =>
        old ? { ...old, is_bookmarked: wasBookmarked } : old,
      );
    }
  };

  const handleReportParty = async () => {
    if (!user || !party) return;
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        target_type: "party",
        target_id: partyId,
        reason: "Flagged by user for review",
        status: "pending",
      });
      if (error) throw error;
      Alert.alert(
        "Report Submitted",
        "Thank you. Our team will review this party within 24 hours.",
      );
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  const handleBlockHost = async () => {
    if (!user || !party) return;
    const brandName = party.host_profile?.name || "this brand";
    Alert.alert(
      "Block Brand",
      `Are you sure you want to block "${brandName}"? You will no longer see events from this brand. Their other brands will not be affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              if (!party.host_profile?.id) {
                Alert.alert("Error", "Could not identify the brand to block.");
                return;
              }
              const { error } = await supabase
                .from("blocked_host_profiles")
                .insert({
                  blocker_id: user.id,
                  blocked_host_profile_id: party.host_profile.id,
                });
              if (error) throw error;
              Alert.alert(
                "Brand Blocked",
                `You have blocked "${brandName}". You won't see their events anymore.`,
              );
              router.back();
            } catch (e: any) {
              console.error(e);
              if (e.code === "23505") {
                Alert.alert("Info", "You have already blocked this brand.");
                return;
              }
              Alert.alert("Error", "Could not block brand.");
            }
          },
        },
      ],
    );
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
                      onPress={() => setIsManagingTickets(true)}
                      className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                    >
                      <Ionicons name="ticket-outline" size={20} color="#fff" />
                    </TouchableOpacity>
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
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={handleShareLink}
                  className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                </TouchableOpacity>
                {user?.id !== party.host_id && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert("Party Options", "Please choose an action", [
                        {
                          text: "Report Party",
                          onPress: handleReportParty,
                          style: "destructive",
                        },
                        {
                          text: "Block Brand",
                          onPress: handleBlockHost,
                          style: "destructive",
                        },
                        { text: "Cancel", style: "cancel" },
                      ]);
                    }}
                    className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
                  >
                    <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
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
              isActive={isFocused}
            />
          ) : party.flyer_url &&
            (party.flyer_url.startsWith("http") ||
              party.flyer_url.startsWith("https")) ? (
            <View style={{ aspectRatio: 4 / 5 }} className="w-full relative">
              <Image
                source={{ uri: party.flyer_url }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
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
          <AttendancePill ticketsSold={party.tickets_sold} />

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
                {`${ticketTiers.length > 1 ? "From " : ""}${currencySymbol}${displayPrice?.toLocaleString() ?? "0"}`}
              </Text>
            </View>
            {showTicketCount && ticketsRemaining > 0 ? (
              <Text className="text-gray-400 text-sm">
                {ticketsRemaining} of {totalTickets} available
              </Text>
            ) : ticketsRemaining <= 0 ? (
              <Text className="text-red-400 text-sm font-semibold">
                Sold Out
              </Text>
            ) : (
              <Text className="text-gray-400 text-sm font-semibold">
                Available
              </Text>
            )}

            {/* ✅ SHOW TIER BREAKDOWN IF MULTIPLE TIERS AND NOT TBA */}
            {ticketTiers.length > 1 && (
              <View className="mt-3 pt-3 border-t border-white/10">
                {ticketTiers.map((tier) => (
                  <View
                    key={tier.id}
                    className="flex-row justify-between items-center py-1"
                  >
                    <Text className="text-gray-400 text-xs">{tier.name}</Text>
                    {tier.quantity - tier.quantity_sold <= 0 ? (
                      <Text className="text-red-400 text-xs font-semibold">Sold Out</Text>
                    ) : showTicketCount ? (
                      <Text className="text-gray-400 text-xs">
                        {tier.quantity - tier.quantity_sold}/{tier.quantity} left
                      </Text>
                    ) : (
                      <Text className="text-gray-400 text-xs font-semibold">Available</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Engagement Stats */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
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
              <TouchableOpacity
                className="flex-row items-center ml-6"
                onPress={handleShareLink}
              >
                <Ionicons name="share-social-outline" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Review Button */}
            {!isEditing && party.has_ticket && eventEnded && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/party/[id]/review",
                    params: { id: partyId },
                  })
                }
                disabled={party.has_reviewed}
                className={`flex-row items-center px-4 py-2 rounded-xl border ${
                  party.has_reviewed
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-purple-600/20 border-purple-600/30"
                }`}
              >
                <Ionicons
                  name={
                    party.has_reviewed ? "checkmark-circle" : "star-outline"
                  }
                  size={18}
                  color={party.has_reviewed ? "#22c55e" : "#a855f7"}
                />
                <Text
                  className={`font-bold ml-2 ${party.has_reviewed ? "text-green-400" : "text-purple-400"}`}
                >
                  {party.has_reviewed ? "Review Left" : "Rate Party"}
                </Text>
              </TouchableOpacity>
            )}

            {isEditing && (
              <View className="flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setIsManagingTickets(true)}
                  className="flex-row items-center bg-purple-600/10 border border-purple-600/20 px-4 py-2 rounded-xl"
                >
                  <Ionicons name="ticket-outline" size={20} color="#a855f7" />
                  <Text className="text-purple-400 font-bold ml-2">Manage</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {user?.id === party.host_id && (
            <View className="mt-4 mb-8 items-center">
              <TouchableOpacity
                onPress={handleDeleteParty}
                disabled={saving}
                className="py-2 px-4 rounded-xl border border-white/5 bg-white/5 items-center justify-center flex-row"
              >
                <Ionicons name="trash-outline" size={16} color="#da2d2dff" />
                <Text className="text-[#da2d2dff] ml-2 text-sm font-medium">
                  Delete Party
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
              : `Get Tickets • ${ticketTiers.length > 1 ? "From " : ""}${currencySymbol}${displayPrice?.toLocaleString() ?? "0"}`}
          </Text>
        </TouchableOpacity>
      </View>

      <CommentsBottomSheet
        partyId={partyId}
        isVisible={isCommentsVisible}
        onClose={() => setIsCommentsVisible(false)}
      />

      {/* Ticket Management Modal */}
      <Modal
        visible={isManagingTickets}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsManagingTickets(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-[#191022] rounded-t-3xl h-[85%] border-t border-white/10">
            <View className="flex-row items-center justify-between p-6 border-b border-white/5">
              <Text className="text-white text-xl font-bold">
                Manage Tickets
              </Text>
              <TouchableOpacity onPress={() => setIsManagingTickets(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-6">
              {/* Ticket Settings */}
              <View className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/5">
                <View className="flex-row justify-between items-center">
                  <View className="flex-1 mr-4">
                    <Text className="text-white font-bold text-base mb-1">
                      Show Ticket Quantities
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      When turned off, attendees only see "Sold Out" instead of how many tickets remain.
                    </Text>
                  </View>
                  <Switch
                    value={showTicketCount}
                    onValueChange={handleToggleShowTicketCount}
                    trackColor={{ false: "#333", true: "#a855f7" }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              {/* Existing Tiers Section */}
              <Text className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-4">
                Restock Existing Tiers
              </Text>
              {ticketTiers.map((tier) => (
                <View
                  key={tier.id}
                  className="bg-white/5 rounded-2xl p-4 mb-4 border border-white/5"
                >
                  {editingTierId === tier.id ? (
                    <View>
                      <TextInput
                        className="bg-white/10 rounded-xl px-4 py-3 text-white mb-3"
                        placeholder="Tier Name"
                        placeholderTextColor="#666"
                        value={editTierName}
                        onChangeText={setEditTierName}
                      />
                      <TextInput
                        className="bg-white/10 rounded-xl px-4 py-3 text-white mb-4"
                        placeholder="Price"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                        value={editTierPrice}
                        onChangeText={setEditTierPrice}
                      />
                      <View className="bg-white/5 rounded-xl p-3 mb-4 border border-white/5">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-white font-semibold text-sm">Limit per person</Text>
                          <Switch
                            value={editTierLimitOn}
                            onValueChange={setEditTierLimitOn}
                            trackColor={{ false: "#333", true: "#a855f7" }}
                            thumbColor="#fff"
                          />
                        </View>
                        {editTierLimitOn && (
                          <View className="mt-3 pt-3 border-t border-white/5 flex-row items-center justify-between">
                            <Text className="text-gray-400 text-xs">Max tickets per order:</Text>
                            <TextInput
                              className="bg-white/10 rounded-lg px-3 py-1.5 text-white w-16 text-center"
                              value={editTierMaxPerOrder}
                              onChangeText={setEditTierMaxPerOrder}
                              keyboardType="numeric"
                              maxLength={3}
                            />
                          </View>
                        )}
                      </View>
                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={() => setEditingTierId(null)}
                          className="flex-1 bg-white/5 py-3 rounded-xl items-center"
                        >
                          <Text className="text-gray-400 font-bold">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateTier(tier.id)}
                          className="flex-1 bg-purple-600 py-3 rounded-xl items-center"
                        >
                          <Text className="text-white font-bold">Save</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1 mr-2">
                          <View className="flex-row items-center gap-2 mb-1">
                            <Text className="text-white font-bold text-lg">
                              {tier.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingTierId(tier.id);
                                setEditTierName(tier.name);
                                setEditTierPrice(tier.price.toString());
                                const hasLimit = tier.max_per_order != null;
                                setEditTierLimitOn(hasLimit);
                                setEditTierMaxPerOrder(hasLimit ? String(tier.max_per_order) : "2");
                              }}
                            >
                              <Ionicons
                                name="create-outline"
                                size={16}
                                color="#a855f7"
                              />
                            </TouchableOpacity>
                          </View>
                          <Text className="text-gray-400 text-xs">
                            {tier.quantity_sold} sold / {tier.quantity} total
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-purple-400 font-bold text-lg mb-2">
                            {currencySymbol}
                            {tier.price.toLocaleString()}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleDeleteTier(tier.id, tier.quantity_sold)
                            }
                            className="bg-red-500/10 p-1.5 rounded-full"
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color="#ef4444"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View className="h-px bg-white/5 my-3" />

                      <View className="flex-row gap-3">
                        <TextInput
                          className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white"
                          placeholder="Add quantity..."
                          placeholderTextColor="#666"
                          keyboardType="number-pad"
                          value={restockAmounts[tier.id] || ""}
                          onChangeText={(val) =>
                            setRestockAmounts((prev) => ({
                              ...prev,
                              [tier.id]: val,
                            }))
                          }
                        />
                        <TouchableOpacity
                          onPress={() =>
                            handleRestockTier(tier.id, tier.quantity)
                          }
                          disabled={saving}
                          className="bg-purple-600 px-6 py-3 rounded-xl justify-center"
                        >
                          {saving ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text className="text-white font-bold">
                              Restock
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}

              <View className="h-px bg-white/5 my-6" />

              {/* New Tier Section */}
              <Text className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-4">
                Create New Tier
              </Text>
              <View className="bg-white/5 rounded-2xl p-4 border border-white/5 mb-20">
                <TextInput
                  className="bg-white/10 rounded-xl px-4 py-3 text-white mb-3"
                  placeholder="Tier name (e.g. VIP Late Bird)"
                  placeholderTextColor="#666"
                  value={newTierName}
                  onChangeText={setNewTierName}
                />
                <View className="flex-row gap-3 mb-4">
                  <TextInput
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white"
                    placeholder="Price"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={newTierPrice}
                    onChangeText={setNewTierPrice}
                  />
                  <TextInput
                    className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white"
                    placeholder="Quantity"
                    placeholderTextColor="#666"
                    keyboardType="number-pad"
                    value={newTierQuantity}
                    onChangeText={setNewTierQuantity}
                  />
                </View>
                <View className="bg-white/5 rounded-xl p-3 mb-4 border border-white/5">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-white font-semibold text-sm">Limit per person</Text>
                    <Switch
                      value={newTierLimitOn}
                      onValueChange={setNewTierLimitOn}
                      trackColor={{ false: "#333", true: "#a855f7" }}
                      thumbColor="#fff"
                    />
                  </View>
                  {newTierLimitOn && (
                    <View className="mt-3 pt-3 border-t border-white/5 flex-row items-center justify-between">
                      <Text className="text-gray-400 text-xs">Max tickets per order:</Text>
                      <TextInput
                        className="bg-white/10 rounded-lg px-3 py-1.5 text-white w-16 text-center"
                        value={newTierMaxPerOrder}
                        onChangeText={setNewTierMaxPerOrder}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={handleAddNewTier}
                  disabled={saving}
                  className="bg-white py-4 rounded-xl items-center"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text className="text-black font-bold">Create Tier</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
