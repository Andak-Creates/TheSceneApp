import CurrencySelector from "@/components/CurrencySelector";
import MediaGalleryUploader from "@/components/MediaGalleryUploader";
import TBAToggle from "@/components/TBAToggle";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { getUserCurrency } from "../../lib/currency";
import { uploadPartyMedia } from "../../lib/media";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

const MUSIC_GENRES = [
  "Afrobeats",
  "Hip Hop",
  "R&B",
  "Amapiano",
  "House",
  "Dancehall",
  "Reggae",
  "Afro House",
  "Pop",
  "EDM",
  "Trap",
  "Alte",
];

const VIBES = [
  "🔥 Wild",
  "😌 Chill",
  "🌳 Outdoor",
  "🏠 Indoor",
  "🎭 Exclusive",
  "🎉 Open",
  "💃 Dance",
  "🎵 Live Music",
  "🌃 Rooftop",
  "🏖️ Beach",
];

const STEPS = [
  { id: 1, name: "Visuals", icon: "images" },
  { id: 2, name: "Basics", icon: "information-circle" },
  { id: 3, name: "Vibe", icon: "musical-notes" },
  { id: 4, name: "Tickets", icon: "ticket" },
  { id: 5, name: "Preview", icon: "eye" },
];

interface TicketTier {
  id: string;
  name: string;
  price: string;
  quantity: string;
}

interface MediaItem {
  uri: string;
  type: "image" | "video";
  order: number;
  isPrimary: boolean;
  uploading?: boolean;
  uploadedUrl?: string;
}

// Helper for safe number parsing
const safeParseFloat = (value: string): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

const safeParseInt = (value: string): number => {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
};

export default function CreatePartyScreen() {
  const { user } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [publishing, setPublishing] = useState(false);
  const [verificationChecked, setVerificationChecked] = useState(false);

  // Host Profile State
  const [hostProfiles, setHostProfiles] = useState<any[]>([]);
  const [selectedHostProfile, setSelectedHostProfile] = useState<string | null>(
    null,
  );
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Combined check for verification and host profiles
  useEffect(() => {
    const checkHostingReady = async () => {
      if (!user) return;
      setLoadingProfiles(true);
      try {
        // 1. Check Verification Status
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("host_verified_at, host_verification_status, is_host")
          .eq("id", user.id)
          .single();

        const isVerified =
          (profileRow?.host_verified_at !== null &&
            profileRow?.host_verified_at !== undefined) ||
          profileRow?.host_verification_status === "approved" ||
          profileRow?.is_host;

        if (!isVerified) {
          const { data: verification } = await supabase
            .from("host_verifications")
            .select("status")
            .eq("user_id", user.id)
            .maybeSingle();

          if (verification?.status !== "approved") {
            router.replace("/(app)/host-verification");
            return;
          }
        }

        // 2. Check for Host Profiles (Brands)
        const { data: profiles, error: profileError } = await supabase
          .from("host_profiles")
          .select("*")
          .eq("owner_id", user.id);

        if (profileError) throw profileError;

        if (!profiles || profiles.length === 0) {
          // No brand profiles found - redirect to setup
          Alert.alert(
            "Final Step",
            "You're verified! Now, create a host brand (profile) to publish your parties.",
            [
              {
                text: "Setup Brand",
                onPress: () => router.replace("/(app)/host-profile-setup"),
              },
            ],
          );
          return;
        }

        setHostProfiles(profiles);
        setSelectedHostProfile(profiles[0].id);
        setVerificationChecked(true);
      } catch (err) {
        console.error("Hosting check failed:", err);
        setError("Failed to verify hosting status");
      } finally {
        setLoadingProfiles(false);
      }
    };

    checkHostingReady();
  }, [user?.id]);

  // Reset form on mount
  useEffect(() => {
    if (verificationChecked) resetForm();
  }, [verificationChecked]);

  const resetForm = async () => {
    setCurrentStep(1);
    setPublishing(false);
    setFlyerImage(null);
    setFlyerBase64(null);
    setMediaGallery([]);
    setTitle("");
    setDescription("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setLocation("");
    setCity("");
    setShowStartDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndDatePicker(false);
    setShowEndTimePicker(false);
    setPriceTBA(false);
    setDressCode("");
    setSelectedGenres([]);
    setSelectedVibes([]);
    setTicketTiers([
      { id: "1", name: "General Admission", price: "", quantity: "" },
    ]);

    // Fetch and set user's preferred currency
    let prefCurr = "NGN";
    if (user?.id) {
      prefCurr = await getUserCurrency(user.id);
      setCurrency(prefCurr);
    } else {
      setCurrency("NGN");
    }

    setCurrency(prefCurr);
    setSelectedHostProfile(hostProfiles.length > 0 ? hostProfiles[0].id : null);
    setError("");
  };

  // Step 1: Visuals
  const [flyerImage, setFlyerImage] = useState<string | null>(null); // Kept for backward compatibility display
  const [flyerBase64, setFlyerBase64] = useState<string | null>(null);
  const [mediaGallery, setMediaGallery] = useState<MediaItem[]>([]);

  // Step 2: Basics
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(new Date());

  // TBA toggles
  const [dateTBA, setDateTBA] = useState(false);
  const [locationTBA, setLocationTBA] = useState(false);
  const [priceTBA, setPriceTBA] = useState(false);

  // New optional fields
  const [dressCode, setDressCode] = useState("");

  // Date helpers
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTime = (date: Date) => {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${ampm}`;
  };

  // Step 3: Vibe
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);

  // Step 4: Tickets
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([
    { id: "1", name: "General Admission", price: "", quantity: "" },
  ]);
  const [currency, setCurrency] = useState("NGN");

  const [error, setError] = useState("");

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const toggleVibe = (vibe: string) => {
    setSelectedVibes((prev) =>
      prev.includes(vibe) ? prev.filter((v) => v !== vibe) : [...prev, vibe],
    );
  };

  const addTicketTier = () => {
    setTicketTiers([
      ...ticketTiers,
      { id: Date.now().toString(), name: "", price: "", quantity: "" },
    ]);
  };

  const removeTicketTier = (id: string) => {
    if (ticketTiers.length > 1) {
      setTicketTiers(ticketTiers.filter((tier) => tier.id !== id));
    }
  };

  const updateTicketTier = (
    id: string,
    field: keyof TicketTier,
    value: string,
  ) => {
    setTicketTiers(
      ticketTiers.map((tier) =>
        tier.id === id ? { ...tier, [field]: value } : tier,
      ),
    );
  };

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (mediaGallery.length === 0)
          return "Please upload at least one image or video";
        break;
      case 2:
        if (!title.trim()) return "Please enter a party title";
        if (!locationTBA && !location.trim())
          return "Please enter the location or mark as TBA";
        if (!locationTBA && !city.trim())
          return "Please enter the city or mark as TBA";
        if (!selectedHostProfile)
          return "Please select a host profile or create one first";
        if (!dateTBA) {
          if (!startDate.trim())
            return "Please enter start date or mark as TBA";
          if (!startTime.trim())
            return "Please enter start time or mark as TBA";
          if (!endDate.trim()) return "Please enter end date or mark as TBA";
          if (!endTime.trim()) return "Please enter end time or mark as TBA";
        }
        break;
      case 3:
        if (selectedGenres.length === 0)
          return "Please select at least one music genre";
        if (selectedVibes.length === 0)
          return "Please select at least one vibe";
        break;
      case 4:
        if (!priceTBA) {
          for (const tier of ticketTiers) {
            if (!tier.name.trim())
              return "Please fill in all ticket tier names";
            // Check if price is a valid number string
            if (!tier.price.trim() || isNaN(parseFloat(tier.price)))
              return "Please fill in all ticket prices or mark as TBA";
            if (!tier.quantity.trim() || parseInt(tier.quantity) <= 0)
              return "Please fill in valid quantities";
          }
        }
        break;
    }
    return null;
  };

  const handleNext = () => {
    const validationError = validateStep(currentStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setError("");
    setCurrentStep(currentStep - 1);
  };

  const handlePublish = async () => {
    if (!user) return;

    // Final check logic
    if (mediaGallery.length === 0) {
      setError("Please upload at least one image");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      // 1. Upload All Media to Supabase Storage
      const uploadedMedia = [];
      const tempId = Date.now().toString(); // Temporary ID for folder structure

      for (const item of mediaGallery) {
        try {
          const result = await uploadPartyMedia(user.id, item.uri, item.type);
          uploadedMedia.push({
            ...item,
            uploadedUrl: result.url,
          });
        } catch (uploadError) {
          console.error("Error uploading media item:", uploadError);
          throw new Error(
            "Failed to upload some media files. Please try again.",
          );
        }
      }

      const primaryMedia =
        uploadedMedia.find((m) => m.isPrimary) || uploadedMedia[0];
      const primaryUrl = primaryMedia?.uploadedUrl || "";

      // 2. Parse date and time
      let partyDateTimeISO = null;
      let partyEndDateTimeISO = null;

      if (!dateTBA) {
        const dateTimeString = `${startDate}T${startTime}:00`;
        const partyDateTime = new Date(dateTimeString);

        if (isNaN(partyDateTime.getTime())) {
          throw new Error("Invalid start date or time");
        }
        partyDateTimeISO = partyDateTime.toISOString();

        const endDateTimeString = `${endDate}T${endTime}:00`;
        const partyEndDateTime = new Date(endDateTimeString);

        if (isNaN(partyEndDateTime.getTime())) {
          throw new Error("Invalid end date or time");
        }
        if (partyEndDateTime <= partyDateTime) {
          throw new Error("End time must be after start time");
        }
        partyEndDateTimeISO = partyEndDateTime.toISOString();
      }

      // 3. Calculate totals from tiers
      // Handle TBA gracefully
      let lowestPrice: number | null = null;
      let totalQuantity = 0;

      if (!priceTBA && ticketTiers.length > 0) {
        lowestPrice = Math.min(
          ...ticketTiers.map((t) => safeParseFloat(t.price)),
        );
        totalQuantity = ticketTiers.reduce(
          (sum, t) => sum + safeParseInt(t.quantity),
          0,
        );
      } else {
        // If Price is TBA, we can set ticket_price to NULL (if schema allows) or 0.
        // The schema migration said: `ALTER COLUMN ticket_price DROP NOT NULL;`
        // So we can send NULL.
        lowestPrice = null;
      }

      // 4. Create party
      const { data: party, error: partyError } = await supabase
        .from("parties")
        .insert({
          host_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          flyer_url: primaryUrl,
          date: partyDateTimeISO,
          end_date: partyEndDateTimeISO,
          date_tba: dateTBA,
          location: locationTBA ? null : location.trim(),
          city: locationTBA ? null : city.trim(),
          location_tba: locationTBA,
          ticket_price: lowestPrice, // Can be null
          ticket_price_tba: priceTBA,
          currency_code: currency,

          // Additional fields
          dress_code: dressCode.trim() || null,

          // Legacy/Computed
          ticket_quantity: totalQuantity,
          tickets_sold: 0,
          music_genres: selectedGenres,
          vibes: selectedVibes,
          is_published: true,
          host_profile_id: selectedHostProfile,
        })
        .select()
        .single();

      if (partyError) throw partyError;

      // 5. Insert Media mapping records
      if (uploadedMedia.length > 0) {
        const mediaToInsert = uploadedMedia.map((item, index) => ({
          party_id: party.id,
          media_type: item.type,
          media_url: item.uploadedUrl,
          is_primary: item.isPrimary,
          display_order: index,
        }));

        const { error: mediaError } = await supabase
          .from("party_media")
          .insert(mediaToInsert);

        if (mediaError)
          console.error("Media insert error (non-fatal):", mediaError);
      }

      // 6. Create Ticket Tiers
      if (!priceTBA && ticketTiers.length > 0) {
        const tiersToInsert = ticketTiers.map((tier, index) => ({
          party_id: party.id,
          name: tier.name.trim(),
          description: null,
          price: safeParseFloat(tier.price),
          quantity: safeParseInt(tier.quantity),
          quantity_sold: 0,
          tier_order: index,
          is_active: true,
          currency_code: currency,
        }));

        const { error: tiersError } = await supabase
          .from("ticket_tiers")
          .insert(tiersToInsert);

        if (tiersError) throw tiersError;
      }

      Alert.alert("Success!", "Your party has been published!", [
        {
          text: "OK",
          onPress: () => {
            resetForm();
            router.replace("/(app)/feed");
          },
        },
      ]);
    } catch (error: any) {
      console.error("❌ Publish error:", error);
      setError(error.message || "Failed to publish party");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#09030e]"
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      {/* 🔒 FIXED HEADER */}
      <View className="pt-16 px-6 pb-2 bg-[#09030e] z-10 border-b border-white/5">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => {
              if (currentStep === 1) {
                router.back();
              } else {
                handleBack();
              }
            }}
            className="w-10 h-10 bg-white/5 rounded-full items-center justify-center border border-white/10"
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          <Text className="text-white text-lg font-extrabold tracking-wide">
            Create Party
          </Text>

          <View style={{ width: 40 }} />
        </View>

        {/* Step Indicator */}
        <View className="mt-6 mb-2">
          <View className="flex-row justify-between items-center">
            {STEPS.map((step) => (
              <View key={step.id} className="flex-1 items-center mx-1">
                <View
                  className={`w-full h-1.5 rounded-full ${
                    currentStep > step.id
                      ? "bg-[#a855f7]"
                      : currentStep === step.id
                        ? "bg-[#a855f7]"
                        : "bg-white/10"
                  }`}
                />
              </View>
            ))}
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 pb-8"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="pt-8 px-6 pb-8">
          {error ? (
            <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6 flex-row items-center">
              <Ionicons name="warning" size={20} color="#f87171" />
              <Text className="text-red-400 text-sm font-semibold ml-3 flex-1">
                {error}
              </Text>
            </View>
          ) : null}

          {/* Step 1: Visuals */}
          {currentStep === 1 && (
            <View className="animate-fade-in">
              <View className="mb-8">
                <Text className="text-purple-400 text-sm font-bold uppercase tracking-widest mb-2">
                  Step 1
                </Text>
                <Text className="text-white text-4xl font-extrabold mb-2 tracking-tight">
                  Visuals
                </Text>
                <Text className="text-gray-400 text-base">
                  Add images and videos to showcase your event. First item will
                  be the cover.
                </Text>
              </View>

              <MediaGalleryUploader
                onMediaChange={setMediaGallery}
                maxImages={10}
                maxVideos={3}
              />
            </View>
          )}

          {/* Step 2: Basics */}
          {currentStep === 2 && (
            <View className="animate-fade-in">
              <View className="mb-8">
                <Text className="text-purple-400 text-sm font-bold uppercase tracking-widest mb-2">
                  Step 2
                </Text>
                <Text className="text-white text-4xl font-extrabold mb-2 tracking-tight">
                  The Basics
                </Text>
                <Text className="text-gray-400 text-base">
                  Tell people what your party is about.
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-white text-sm font-semibold mb-2">
                  Party Name *
                </Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                  placeholder="e.g., Afrobeat Night Out"
                  placeholderTextColor="#666"
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              <View className="mb-4">
                <Text className="text-white text-sm font-semibold mb-2">
                  Host Profile *
                </Text>
                {loadingProfiles ? (
                  <ActivityIndicator size="small" color="#a855f7" />
                ) : hostProfiles.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {hostProfiles.map((hp) => (
                      <TouchableOpacity
                        key={hp.id}
                        onPress={() => setSelectedHostProfile(hp.id)}
                        className={`px-4 py-2 rounded-xl border ${
                          selectedHostProfile === hp.id
                            ? "bg-purple-600 border-purple-500"
                            : "bg-white/5 border-white/10"
                        }`}
                      >
                        <Text className="text-white font-medium">
                          {hp.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => router.push("/(app)/host-profile-setup")}
                      className="px-4 py-2 rounded-xl border border-dashed border-white/20 bg-white/5"
                    >
                      <Text className="text-gray-400 font-medium">
                        + New Profile
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => router.push("/(app)/host-profile-setup")}
                    className="bg-purple-600/20 border border-dashed border-purple-500/50 rounded-xl p-4 items-center"
                  >
                    <Ionicons name="add-circle" size={24} color="#a855f7" />
                    <Text className="text-purple-400 font-bold mt-2">
                      Create Host Profile
                    </Text>
                    <Text className="text-gray-400 text-xs text-center mt-1">
                      You need a host profile to publish parties
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-white text-sm font-semibold mb-2">
                  Description (Optional)
                </Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                  placeholder="What makes this party special?"
                  placeholderTextColor="#666"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Start Date & Time */}
              <View className="mb-4">
                <Text className="text-white text-sm font-semibold mb-3">
                  Start Date & Time
                </Text>

                <TBAToggle
                  label="Date & Time TBA"
                  value={dateTBA}
                  onChange={setDateTBA}
                  description="Mark if you haven't finalized the date yet"
                />

                {!dateTBA && (
                  <View className="flex-row gap-3 mb-3 mt-3">
                    <TouchableOpacity
                      onPress={() => setShowStartDatePicker(true)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                    >
                      <Text
                        className={startDate ? "text-white" : "text-gray-600"}
                      >
                        {startDate || "YYYY-MM-DD"}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowStartTimePicker(true)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                    >
                      <Text
                        className={startTime ? "text-white" : "text-gray-600"}
                      >
                        {startTime ? formatTime(startDateTime) : "HH:MM AM"}
                      </Text>
                      <Ionicons name="time-outline" size={20} color="#666" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Date Pickers */}
                {showStartDatePicker && (
                  <Modal
                    transparent
                    animationType="fade"
                    visible={showStartDatePicker}
                  >
                    <View className="flex-1 justify-center bg-black/80 px-4">
                      <View className="bg-[#191022] rounded-3xl overflow-hidden">
                        <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                          <TouchableOpacity
                            onPress={() => setShowStartDatePicker(false)}
                          >
                            <Text className="text-gray-400 font-semibold">
                              Cancel
                            </Text>
                          </TouchableOpacity>
                          <Text className="text-white font-bold">
                            Select Date
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowStartDatePicker(false)}
                          >
                            <Text className="text-purple-500 font-bold">
                              Done
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View className="p-4 items-center">
                          <DateTimePicker
                            value={startDateTime}
                            mode="date"
                            display="spinner"
                            onChange={(event, date) => {
                              if (date) {
                                setStartDateTime(date);
                                setStartDate(formatDate(date));
                              }
                            }}
                            minimumDate={new Date()}
                            textColor="#fff"
                          />
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}

                {showStartTimePicker && (
                  <Modal
                    transparent
                    animationType="fade"
                    visible={showStartTimePicker}
                  >
                    <View className="flex-1 justify-center bg-black/80 px-4">
                      <View className="bg-[#191022] rounded-3xl overflow-hidden">
                        <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                          <TouchableOpacity
                            onPress={() => setShowStartTimePicker(false)}
                          >
                            <Text className="text-gray-400 font-semibold">
                              Cancel
                            </Text>
                          </TouchableOpacity>
                          <Text className="text-white font-bold">
                            Select Time
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowStartTimePicker(false)}
                          >
                            <Text className="text-purple-500 font-bold">
                              Done
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View className="p-4 items-center">
                          <DateTimePicker
                            value={startDateTime}
                            mode="time"
                            display="spinner"
                            onChange={(event, time) => {
                              if (time) {
                                setStartDateTime(time);
                                setStartTime(time.toTimeString().slice(0, 5));
                              }
                            }}
                            textColor="#fff"
                          />
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>

              {/* End Date & Time (Optional) */}
              {!dateTBA && (
                <View className="mb-4">
                  <Text className="text-white text-sm font-semibold mb-2">
                    End Date & Time *
                  </Text>
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => setShowEndDatePicker(true)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                    >
                      <Text
                        className={endDate ? "text-white" : "text-gray-600"}
                      >
                        {endDate || "YYYY-MM-DD"}
                      </Text>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#666"
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowEndTimePicker(true)}
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                    >
                      <Text
                        className={endTime ? "text-white" : "text-gray-600"}
                      >
                        {endTime ? formatTime(endDateTime) : "HH:MM AM"}
                      </Text>
                      <Ionicons name="time-outline" size={20} color="#666" />
                    </TouchableOpacity>
                  </View>

                  {showEndDatePicker && (
                    <Modal
                      transparent
                      animationType="fade"
                      visible={showEndDatePicker}
                    >
                      <View className="flex-1 justify-center bg-black/80 px-4">
                        <View className="bg-[#191022] rounded-3xl overflow-hidden">
                          <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                            <TouchableOpacity
                              onPress={() => setShowEndDatePicker(false)}
                            >
                              <Text className="text-gray-400 font-semibold">
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text className="text-white font-bold">
                              End Date
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowEndDatePicker(false)}
                            >
                              <Text className="text-purple-500 font-bold">
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <View className="p-4 items-center">
                            <DateTimePicker
                              value={endDateTime}
                              mode="date"
                              display="spinner"
                              onChange={(event, date) => {
                                if (date) {
                                  setEndDateTime(date);
                                  setEndDate(formatDate(date));
                                }
                              }}
                              minimumDate={startDateTime}
                              textColor="#fff"
                            />
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}

                  {showEndTimePicker && (
                    <Modal
                      transparent
                      animationType="fade"
                      visible={showEndTimePicker}
                    >
                      <View className="flex-1 justify-center bg-black/80 px-4">
                        <View className="bg-[#191022] rounded-3xl overflow-hidden">
                          <View className="flex-row justify-between items-center p-4 border-b border-white/10 bg-[#251833]">
                            <TouchableOpacity
                              onPress={() => setShowEndTimePicker(false)}
                            >
                              <Text className="text-gray-400 font-semibold">
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <Text className="text-white font-bold">
                              End Time
                            </Text>
                            <TouchableOpacity
                              onPress={() => setShowEndTimePicker(false)}
                            >
                              <Text className="text-purple-500 font-bold">
                                Done
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <View className="p-4 items-center">
                            <DateTimePicker
                              value={endDateTime}
                              mode="time"
                              display="spinner"
                              onChange={(event, time) => {
                                if (time) {
                                  setEndDateTime(time);
                                  setEndTime(time.toTimeString().slice(0, 5));
                                }
                              }}
                              textColor="#fff"
                            />
                          </View>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>
              )}

              <View className="mb-4">
                <Text className="text-white text-sm font-semibold mb-3">
                  Location
                </Text>

                <TBAToggle
                  label="Location TBA"
                  value={locationTBA}
                  onChange={setLocationTBA}
                  description="Mark if venue is still being confirmed"
                />

                {!locationTBA && (
                  <View className="mt-3 z-50">
                    <GooglePlacesAutocomplete
                      placeholder="e.g., The Shrine, Ikeja"
                      onPress={(data, details = null) => {
                        setLocation(data.description);
                        // Extract city from details if available
                        if (details) {
                          const cityComp = details.address_components.find(
                            (c) =>
                              c.types.includes("locality") ||
                              c.types.includes("administrative_area_level_2"),
                          );
                          if (cityComp) setCity(cityComp.long_name);
                        }
                      }}
                      query={{
                        key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
                        language: "en",
                        types: "geocode",
                      }}
                      fetchDetails={true}
                      textInputProps={{
                        placeholderTextColor: "#666",
                        className:
                          "bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-black mb-3",
                        value: location,
                        onChangeText: setLocation,
                      }}
                      styles={{
                        container: { flex: 0 },
                        listView: {
                          backgroundColor: "#191022",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.1)",
                          borderRadius: 8,
                          position: "absolute",
                          top: 55,
                        },
                        description: { color: "#fff" },
                        row: { backgroundColor: "transparent", padding: 13 },
                      }}
                    />
                    <TextInput
                      className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                      placeholder="City (e.g., Lagos)"
                      placeholderTextColor="#666"
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Step 3: Vibes */}
          {currentStep === 3 && (
            <View className="animate-fade-in mb-6">
              <View className="mb-8">
                <Text className="text-purple-400 text-sm font-bold uppercase tracking-widest mb-2">
                  Step 3
                </Text>
                <Text className="text-white text-4xl font-extrabold mb-2 tracking-tight">
                  Set the Vibe
                </Text>
                <Text className="text-gray-400 text-base">
                  Help people find your party
                </Text>
              </View>

              <View className="mb-8">
                <Text className="text-white text-lg font-bold mb-4">
                  Music Genres *
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {MUSIC_GENRES.map((genre) => (
                    <TouchableOpacity
                      key={genre}
                      onPress={() => toggleGenre(genre)}
                      className={`px-5 py-2.5 rounded-full border ${
                        selectedGenres.includes(genre)
                          ? "bg-purple-600 border-purple-500"
                          : "bg-[#150d1e] border-white/10"
                      }`}
                      style={
                        selectedGenres.includes(genre)
                          ? {
                              shadowColor: "#9333ea",
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.3,
                              shadowRadius: 8,
                              elevation: 8,
                            }
                          : undefined
                      }
                      activeOpacity={0.8}
                    >
                      <Text
                        className={
                          selectedGenres.includes(genre)
                            ? "text-white font-bold"
                            : "text-gray-300 font-semibold"
                        }
                      >
                        {genre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-white text-lg font-bold mb-4">
                  Vibes *
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {VIBES.map((vibe) => (
                    <TouchableOpacity
                      key={vibe}
                      onPress={() => toggleVibe(vibe)}
                      className={`px-5 py-2.5 rounded-full border ${
                        selectedVibes.includes(vibe)
                          ? "bg-purple-600 border-purple-500"
                          : "bg-[#150d1e] border-white/10"
                      }`}
                      style={
                        selectedVibes.includes(vibe)
                          ? {
                              shadowColor: "#9333ea",
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.3,
                              shadowRadius: 8,
                              elevation: 8,
                            }
                          : undefined
                      }
                      activeOpacity={0.8}
                    >
                      <Text
                        className={
                          selectedVibes.includes(vibe)
                            ? "text-white font-bold"
                            : "text-gray-300 font-semibold"
                        }
                      >
                        {vibe}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Step 4: Tickets */}
          {currentStep === 4 && (
            <View className="animate-fade-in">
              <View className="mb-8">
                <Text className="text-purple-400 text-sm font-bold uppercase tracking-widest mb-2">
                  Step 4
                </Text>
                <Text className="text-white text-4xl font-extrabold mb-2 tracking-tight">
                  Ticket Tiers
                </Text>
                <Text className="text-gray-400 text-base">
                  Set up your ticket pricing
                </Text>
              </View>

              <View className="mb-8 p-4 bg-[#150d1e] rounded-3xl border border-white/5">
                <Text className="text-white text-sm font-semibold mb-4">
                  Party Currency
                </Text>
                <CurrencySelector
                  selectedCurrency={currency}
                  onSelect={setCurrency}
                />
                <View className="mt-4 pt-4 border-t border-white/5">
                  <TBAToggle
                    label="Price TBA"
                    value={priceTBA}
                    onChange={setPriceTBA}
                    description="Mark if pricing is not yet decided"
                  />
                </View>
              </View>

              {!priceTBA &&
                ticketTiers.map((tier, index) => (
                  <View
                    key={tier.id}
                    className="bg-[#150d1e] border border-white/5 rounded-3xl p-5 mb-4 shadow-xl shadow-black/20"
                  >
                    <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-white/5">
                      <Text className="text-white font-bold text-lg">
                        Tier {index + 1}
                      </Text>
                      {ticketTiers.length > 1 && (
                        <TouchableOpacity
                          onPress={() => removeTicketTier(tier.id)}
                          className="bg-red-500/10 p-2 rounded-full"
                        >
                          <Ionicons name="trash" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TextInput
                      className="bg-[#09030e] border border-white/5 rounded-2xl px-5 py-4 text-white mb-4"
                      placeholder="Tier name (e.g., VIP, General)"
                      placeholderTextColor="#666"
                      value={tier.name}
                      onChangeText={(val) =>
                        updateTicketTier(tier.id, "name", val)
                      }
                    />

                    <View className="flex-row gap-4">
                      <TextInput
                        className="flex-1 bg-[#09030e] border border-white/5 rounded-2xl px-5 py-4 text-white"
                        placeholder={`Price (${currency})`}
                        placeholderTextColor="#666"
                        value={tier.price}
                        onChangeText={(val) =>
                          updateTicketTier(tier.id, "price", val)
                        }
                        keyboardType="numeric"
                      />
                      <TextInput
                        className="flex-1 bg-[#09030e] border border-white/5 rounded-2xl px-5 py-4 text-white"
                        placeholder="Quantity"
                        placeholderTextColor="#666"
                        value={tier.quantity}
                        onChangeText={(val) =>
                          updateTicketTier(tier.id, "quantity", val)
                        }
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                ))}

              {!priceTBA && (
                <TouchableOpacity
                  onPress={addTicketTier}
                  activeOpacity={0.8}
                  className="flex-row items-center justify-center bg-[#150d1e] border border-purple-500/20 rounded-2xl py-4 mt-2"
                >
                  <Ionicons name="add-circle" size={22} color="#a855f7" />
                  <Text className="text-purple-400 font-bold ml-2.5 text-base">
                    Add Another Tier
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Step 5: Preview */}
          {currentStep === 5 && (
            <View className="animate-fade-in mb-6">
              <View className="mb-8">
                <Text className="text-purple-400 text-sm font-bold uppercase tracking-widest mb-2">
                  Step 5
                </Text>
                <Text className="text-white text-4xl font-extrabold mb-2 tracking-tight">
                  Preview
                </Text>
                <Text className="text-gray-400 text-base">
                  Review before publishing
                </Text>
              </View>

              {/* Flyer Preview */}
              {mediaGallery.length > 0 && (
                <ExpoImage
                  source={{ uri: mediaGallery[0].uri }}
                  className="w-full rounded-3xl mb-6 border border-white/5"
                  style={{ aspectRatio: 4 / 5 }}
                />
              )}

              {/* Party Details */}
              <View className="bg-[#150d1e] border border-white/5 rounded-3xl p-6 mb-6">
                <Text className="text-white text-2xl font-extrabold mb-3">
                  {title}
                </Text>
                {description && (
                  <Text className="text-gray-400 text-sm mb-5 leading-relaxed">
                    {description}
                  </Text>
                )}

                <View className="flex-row items-center mb-3 bg-[#09030e] self-start px-3 py-1.5 rounded-full border border-white/5">
                  <Ionicons name="calendar-outline" size={14} color="#a855f7" />
                  <Text className="text-gray-200 text-xs font-semibold ml-2">
                    {dateTBA ? "Date TBA" : `${startDate} at ${startTime}`}
                  </Text>
                </View>

                <View className="flex-row items-center mb-5 bg-[#09030e] self-start px-3 py-1.5 rounded-full border border-white/5">
                  <Ionicons name="location-outline" size={14} color="#a855f7" />
                  <Text className="text-gray-200 text-xs font-semibold ml-2">
                    {locationTBA ? "Location TBA" : `${location}, ${city}`}
                  </Text>
                </View>

                <View className="flex-row flex-wrap gap-2 pt-4 border-t border-white/5">
                  {selectedGenres.slice(0, 3).map((genre) => (
                    <View
                      key={genre}
                      className="bg-purple-600/10 border border-purple-500/20 px-3 py-1.5 rounded-full"
                    >
                      <Text className="text-purple-300 font-semibold text-xs">
                        {genre}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Ticket Tiers Preview */}
              <View className="bg-[#150d1e] border border-white/5 rounded-3xl p-6">
                <Text className="text-white font-extrabold text-lg mb-4">
                  Ticket Tiers
                </Text>
                {priceTBA ? (
                  <Text className="text-gray-500 font-medium italic bg-[#09030e] p-4 rounded-xl">
                    Price To Be Announced
                  </Text>
                ) : (
                  <View className="bg-[#09030e] rounded-2xl overflow-hidden border border-white/5">
                    {ticketTiers.map((tier, index) => (
                      <View
                        key={tier.id}
                        className={`flex-row justify-between items-center p-4 ${index !== ticketTiers.length - 1 ? "border-b border-white/5" : ""}`}
                      >
                        <Text className="text-gray-300 font-semibold">
                          {tier.name}
                        </Text>
                        <Text className="text-white font-bold">
                          {currency} {tier.price}{" "}
                          <Text className="text-gray-500 font-normal">
                            ({tier.quantity})
                          </Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Navigation Buttons */}
          <View className="mt-8 gap-4 px-2">
            {currentStep < 5 ? (
              <TouchableOpacity
                onPress={handleNext}
                activeOpacity={0.8}
                className="bg-white py-4 flex-row justify-center rounded-2xl items-center shadow-lg shadow-white/10"
              >
                <Text className="text-black text-lg font-extrabold pb-1">
                  Continue
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handlePublish}
                disabled={publishing}
                activeOpacity={0.8}
                className="bg-purple-600 py-4 flex-row justify-center rounded-2xl items-center shadow-lg shadow-purple-600/30"
              >
                {publishing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-lg font-extrabold flex-row items-center pb-1">
                    🚀 Publish Party
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {currentStep > 1 && currentStep < 5 && (
              <TouchableOpacity
                onPress={handleBack}
                activeOpacity={0.7}
                className="py-3 items-center"
              >
                <Text className="text-gray-400 font-bold">Cancel / Back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
