import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

export default function CreatePartyScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [publishing, setPublishing] = useState(false);

  // Step 1: Visuals
  const [flyerImage, setFlyerImage] = useState<string | null>(null);
  const [flyerBase64, setFlyerBase64] = useState<string | null>(null);

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

  // Helping time date functions
  const onStartDateChange = (event: any, selectedDate?: Date) => {
    // Only close on Android when user presses OK or Cancel
    if (Platform.OS === "android") {
      setShowStartDatePicker(false);
    }

    if (event.type === "set" && selectedDate) {
      setStartDateTime(selectedDate);
      setStartDate(formatDate(selectedDate));
      // Close on iOS after selection
      if (Platform.OS === "ios") {
        setShowStartDatePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowStartDatePicker(false);
    }
  };

  const onStartTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === "android") {
      setShowStartTimePicker(false);
    }

    if (event.type === "set" && selectedTime) {
      setStartDateTime(selectedTime);
      setStartTime(selectedTime.toTimeString().slice(0, 5));
      if (Platform.OS === "ios") {
        setShowStartTimePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowStartTimePicker(false);
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowEndDatePicker(false);
    }

    if (event.type === "set" && selectedDate) {
      setEndDateTime(selectedDate);
      setEndDate(formatDate(selectedDate));
      if (Platform.OS === "ios") {
        setShowEndDatePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowEndDatePicker(false);
    }
  };

  const onEndTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === "android") {
      setShowEndTimePicker(false);
    }

    if (event.type === "set" && selectedTime) {
      setEndDateTime(selectedTime);
      setEndTime(selectedTime.toTimeString().slice(0, 5));
      if (Platform.OS === "ios") {
        setShowEndTimePicker(false);
      }
    } else if (event.type === "dismissed") {
      setShowEndTimePicker(false);
    }
  };

  // Step 3: Vibe
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);

  // Step 4: Tickets
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([
    { id: "1", name: "General Admission", price: "", quantity: "" },
  ]);

  const [error, setError] = useState("");

  const pickFlyer = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please grant photo library access");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setFlyerImage(result.assets[0].uri);
        setFlyerBase64(result.assets[0].base64 || null);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

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
        if (!flyerImage) return "Please upload a party flyer";
        break;
      case 2:
        if (!title.trim()) return "Please enter a party title";
        if (!location.trim()) return "Please enter the location";
        if (!city.trim()) return "Please enter the city";
        if (!startDate.trim()) return "Please enter start date";
        if (!startTime.trim()) return "Please enter start time";
        break;
      case 3:
        if (selectedGenres.length === 0)
          return "Please select at least one music genre";
        if (selectedVibes.length === 0)
          return "Please select at least one vibe";
        break;
      case 4:
        for (const tier of ticketTiers) {
          if (!tier.name.trim()) return "Please fill in all ticket tier names";
          if (!tier.price.trim()) return "Please fill in all ticket prices";
          if (!tier.quantity.trim() || parseInt(tier.quantity) <= 0)
            return "Please fill in valid quantities";
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
    if (!user || !flyerBase64) return;

    setPublishing(true);
    setError("");

    try {
      // 1. Upload flyer
      const fileExt = flyerImage?.split(".").pop() || "jpg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("flyers")
        .upload(filePath, decode(flyerBase64), {
          contentType: `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("flyers").getPublicUrl(filePath);

      // 2. Create party with lowest tier price as main price
      const lowestPrice = Math.min(
        ...ticketTiers.map((t) => parseFloat(t.price)),
      );
      const totalQuantity = ticketTiers.reduce(
        (sum, t) => sum + parseInt(t.quantity),
        0,
      );

      // 3. Parse date and time correctly
      // Expecting format: YYYY-MM-DD for date and HH:MM for time
      const dateTimeString = `${startDate}T${startTime}:00`;
      const partyDateTime = new Date(dateTimeString);

      // Check if date is valid
      if (isNaN(partyDateTime.getTime())) {
        throw new Error(
          "Invalid start date or time. Please use YYYY-MM-DD for date and HH:MM for time",
        );
      }

      const partyDateTimeISO = partyDateTime.toISOString();

      console.log("📅 Date string:", dateTimeString);
      console.log("📅 Parsed date:", partyDateTime);
      console.log("📅 ISO string:", partyDateTimeISO);

      const { data: party, error: partyError } = await supabase
        .from("parties")
        .insert({
          host_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          flyer_url: publicUrl,
          date: partyDateTimeISO,
          location: location.trim(),
          city: city.trim(),
          ticket_price: lowestPrice,
          ticket_quantity: totalQuantity,
          music_genres: selectedGenres,
          vibes: selectedVibes,
          is_published: true,
        })
        .select()
        .single();

      if (partyError) throw partyError;

      Alert.alert("Success!", "Your party has been published!", [
        {
          text: "OK",
          onPress: () => router.replace("/(app)/feed"),
        },
      ]);
    } catch (error: any) {
      console.error("❌ Publish error:", error);
      setError(error.message || "Failed to publish party");
    } finally {
      setPublishing(false);
    }
  };

  const renderStepIndicator = () => (
    <View className="mb-3">
      {/* Step Numbers */}
      <View className="flex-row justify-between items-center mt-5 mb-2">
        {STEPS.map((step) => (
          <View key={step.id} className="flex-1 items-center">
            <View
              className={`w-10 h-1 rounded-full items-center justify-center ${
                currentStep > step.id
                  ? "bg-purple-600"
                  : currentStep === step.id
                    ? "bg-purple-600"
                    : "bg-white/10"
              }`}
            ></View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <View>
            <Text className="text-purple-600 mb-6 uppercase">Step 1</Text>
            <Text className="text-white text-[35px] font-bold mb-2">
              Visuals
            </Text>
            <Text className="text-gray-400 mb-6">
              Add a flyer or video to hype up your event.
            </Text>

            <TouchableOpacity
              onPress={pickFlyer}
              className="bg-white/5 border-2 border-dashed border-white/20 rounded-2xl overflow-hidden mb-4"
              style={{ aspectRatio: 4 / 5, maxHeight: 500 }}
              activeOpacity={0.8}
            >
              {flyerImage ? (
                <Image source={{ uri: flyerImage }} className="w-full h-full" />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Ionicons name="images-outline" size={64} color="#666" />
                  <Text className="text-gray-400 mt-4 text-lg font-semibold">
                    Tap to upload flyer
                  </Text>
                  <Text className="text-gray-600 text-sm mt-2">
                    4:5 ratio recommended
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        );

      case 2:
        return (
          <View>
            <Text className="text-purple-600 mb-6 uppercase">Step 2</Text>
            <Text className="text-white text-[35px] font-bold mb-2">
              The Basics
            </Text>
            <Text className="text-gray-400 mb-6">Tell us about your party</Text>

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
              <Text className="text-white text-sm font-semibold mb-2">
                Start Date & Time *
              </Text>
              <View className="flex-row gap-3 mb-3">
                {/* Date Input - Clicking opens calendar */}
                <TouchableOpacity
                  onPress={() => setShowStartDatePicker(true)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className={startDate ? "text-white" : "text-gray-600"}>
                    {startDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                </TouchableOpacity>

                {/* Time Input - Clicking opens time picker */}
                <TouchableOpacity
                  onPress={() => setShowStartTimePicker(true)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className={startTime ? "text-white" : "text-gray-600"}>
                    {startTime ? formatTime(startDateTime) : "HH:MM AM"}
                  </Text>
                  <Ionicons name="time-outline" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Start Date Picker Modal */}
              {showStartDatePicker && (
                <Modal
                  transparent
                  animationType="slide"
                  visible={showStartDatePicker}
                >
                  <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#191022] rounded-t-3xl">
                      {/* Header with Done button */}
                      <View className="flex-row justify-between items-center px-6 py-4 border-b border-white/10">
                        <TouchableOpacity
                          onPress={() => setShowStartDatePicker(false)}
                        >
                          <Text className="text-gray-400 text-base">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <Text className="text-white font-bold text-base">
                          Select Date
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowStartDatePicker(false)}
                        >
                          <Text className="text-purple-500 text-base font-semibold">
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Date Picker */}
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
                </Modal>
              )}

              {/* Start Time Picker Modal */}
              {showStartTimePicker && (
                <Modal
                  transparent
                  animationType="slide"
                  visible={showStartTimePicker}
                >
                  <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#191022] rounded-t-3xl">
                      <View className="flex-row justify-between items-center px-6 py-4 border-b border-white/10">
                        <TouchableOpacity
                          onPress={() => setShowStartTimePicker(false)}
                        >
                          <Text className="text-gray-400 text-base">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <Text className="text-white font-bold text-base">
                          Select Time
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowStartTimePicker(false)}
                        >
                          <Text className="text-purple-500 text-base font-semibold">
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>

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
                </Modal>
              )}
            </View>

            {/* End Date & Time (Optional) */}
            <View className="mb-4">
              <Text className="text-white text-sm font-semibold mb-2">
                End Date & Time (Optional)
              </Text>
              <View className="flex-row gap-3">
                {/* End Date Input */}
                <TouchableOpacity
                  onPress={() => setShowEndDatePicker(true)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className={endDate ? "text-white" : "text-gray-600"}>
                    {endDate || "YYYY-MM-DD"}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                </TouchableOpacity>

                {/* End Time Input */}
                <TouchableOpacity
                  onPress={() => setShowEndTimePicker(true)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className={endTime ? "text-white" : "text-gray-600"}>
                    {endTime ? formatTime(endDateTime) : "HH:MM AM"}
                  </Text>
                  <Ionicons name="time-outline" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* End Date Picker Modal */}
              {showEndDatePicker && (
                <Modal
                  transparent
                  animationType="slide"
                  visible={showEndDatePicker}
                >
                  <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#191022] rounded-t-3xl">
                      <View className="flex-row justify-between items-center px-6 py-4 border-b border-white/10">
                        <TouchableOpacity
                          onPress={() => setShowEndDatePicker(false)}
                        >
                          <Text className="text-gray-400 text-base">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <Text className="text-white font-bold text-base">
                          Select End Date
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowEndDatePicker(false)}
                        >
                          <Text className="text-purple-500 text-base font-semibold">
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>

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
                </Modal>
              )}

              {/* End Time Picker Modal */}
              {showEndTimePicker && (
                <Modal
                  transparent
                  animationType="slide"
                  visible={showEndTimePicker}
                >
                  <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-[#191022] rounded-t-3xl">
                      <View className="flex-row justify-between items-center px-6 py-4 border-b border-white/10">
                        <TouchableOpacity
                          onPress={() => setShowEndTimePicker(false)}
                        >
                          <Text className="text-gray-400 text-base">
                            Cancel
                          </Text>
                        </TouchableOpacity>
                        <Text className="text-white font-bold text-base">
                          Select End Time
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowEndTimePicker(false)}
                        >
                          <Text className="text-purple-500 text-base font-semibold">
                            Done
                          </Text>
                        </TouchableOpacity>
                      </View>

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
                </Modal>
              )}
            </View>

            <View className="mb-4">
              <Text className="text-white text-sm font-semibold mb-2">
                Location *
              </Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mb-3"
                placeholder="e.g., The Shrine, Ikeja"
                placeholderTextColor="#666"
                value={location}
                onChangeText={setLocation}
              />
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="City (e.g., Lagos)"
                placeholderTextColor="#666"
                value={city}
                onChangeText={setCity}
              />
            </View>
          </View>
        );
      case 3:
        return (
          <View className="mb-6">
            <Text className="text-purple-600 mb-6 uppercase">Step 3</Text>
            <Text className="text-white text-[35px] font-bold mb-2">
              Set the Vibe
            </Text>
            <Text className="text-gray-400 mb-6">
              Help people find your party
            </Text>

            <View className="mb-6">
              <Text className="text-white text-lg font-bold mb-3">
                Music Genres *
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {MUSIC_GENRES.map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    onPress={() => toggleGenre(genre)}
                    className={`px-4 py-2 rounded-full border ${
                      selectedGenres.includes(genre)
                        ? "bg-purple-600 border-purple-600"
                        : "bg-white/10 border-white/20"
                    }`}
                  >
                    <Text
                      className={
                        selectedGenres.includes(genre)
                          ? "text-white font-semibold"
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
              <Text className="text-white text-lg font-bold mb-3">Vibes *</Text>
              <View className="flex-row flex-wrap gap-3">
                {VIBES.map((vibe) => (
                  <TouchableOpacity
                    key={vibe}
                    onPress={() => toggleVibe(vibe)}
                    className={`px-4 py-2 rounded-full border ${
                      selectedVibes.includes(vibe)
                        ? "bg-purple-600 border-purple-600"
                        : "bg-white/10 border-white/20"
                    }`}
                  >
                    <Text
                      className={
                        selectedVibes.includes(vibe)
                          ? "text-white font-semibold"
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
        );

      case 4:
        return (
          <View>
            <Text className="text-purple-600 mb-6 uppercase">Step 4</Text>
            <Text className="text-white text-[35px] font-bold mb-2">
              Ticket Tiers
            </Text>
            <Text className="text-gray-400 mb-6">
              Set up your ticket pricing
            </Text>

            {ticketTiers.map((tier, index) => (
              <View
                key={tier.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-3"
              >
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-white font-bold">Tier {index + 1}</Text>
                  {ticketTiers.length > 1 && (
                    <TouchableOpacity onPress={() => removeTicketTier(tier.id)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mb-3"
                  placeholder="Tier name (e.g., VIP, General)"
                  placeholderTextColor="#666"
                  value={tier.name}
                  onChangeText={(val) => updateTicketTier(tier.id, "name", val)}
                />

                <View className="flex-row gap-3">
                  <TextInput
                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                    placeholder="Price (₦)"
                    placeholderTextColor="#666"
                    value={tier.price}
                    onChangeText={(val) =>
                      updateTicketTier(tier.id, "price", val)
                    }
                    keyboardType="numeric"
                  />
                  <TextInput
                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
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

            <TouchableOpacity
              onPress={addTicketTier}
              className="flex-row items-center justify-center bg-white/10 border border-white/20 rounded-xl py-3 mb-4"
            >
              <Ionicons name="add-circle-outline" size={20} color="#8B5CF6" />
              <Text className="text-purple-400 font-semibold ml-2">
                Add Another Tier
              </Text>
            </TouchableOpacity>
          </View>
        );

      case 5:
        return (
          <View className="mb-6">
            <Text className="text-purple-600 mb-6 uppercase">Step 5</Text>
            <Text className="text-white text-2xl font-bold mb-2">Preview</Text>
            <Text className="text-gray-400 mb-6">Review before publishing</Text>

            {/* Flyer Preview */}
            {flyerImage && (
              <Image
                source={{ uri: flyerImage }}
                className="w-full rounded-2xl mb-4"
                style={{ aspectRatio: 4 / 5 }}
              />
            )}

            {/* Party Details */}
            <View className="bg-white/5 rounded-2xl p-4 mb-4">
              <Text className="text-white text-xl font-bold mb-2">{title}</Text>
              {description && (
                <Text className="text-gray-300 text-sm mb-3">
                  {description}
                </Text>
              )}

              <View className="flex-row items-center mb-2">
                <Ionicons name="calendar-outline" size={16} color="#9ca3af" />
                <Text className="text-gray-400 text-sm ml-2">
                  {startDate} at {startTime}
                </Text>
              </View>

              <View className="flex-row items-center mb-2">
                <Ionicons name="location-outline" size={16} color="#9ca3af" />
                <Text className="text-gray-400 text-sm ml-2">
                  {location}, {city}
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-2 mt-3">
                {selectedGenres.slice(0, 3).map((genre) => (
                  <View
                    key={genre}
                    className="bg-purple-600/20 px-3 py-1 rounded-full"
                  >
                    <Text className="text-purple-300 text-xs">{genre}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Ticket Tiers Preview */}
            <View className="bg-white/5 rounded-2xl p-4">
              <Text className="text-white font-bold mb-3">Ticket Tiers</Text>
              {ticketTiers.map((tier) => (
                <View
                  key={tier.id}
                  className="flex-row justify-between items-center py-2 border-b border-white/10"
                >
                  <Text className="text-gray-300">{tier.name}</Text>
                  <Text className="text-white font-semibold">
                    ₦{tier.price} • {tier.quantity} available
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#191022]"
    >
      {/* 🔒 FIXED HEADER */}
      <View className="pt-16 px-6 pb-0 bg-[#191022] z-10">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => {
              if (currentStep === 1) {
                router.back();
              } else {
                handleBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <Text className="text-white text-xl font-bold">Create Party</Text>

          <View style={{ width: 24 }} />
        </View>
        {renderStepIndicator()}
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="pt-6 px-6 pb-8">
          {/* Progress Indicator */}

          {/* Error */}
          {error ? (
            <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
              <Text className="text-red-300 text-sm font-medium">{error}</Text>
            </View>
          ) : null}

          {/* Step Content */}
          {renderStep()}

          {/* Navigation Buttons */}
          <View className="mt-8 gap-3">
            {currentStep < 5 ? (
              <TouchableOpacity
                onPress={handleNext}
                className="bg-purple-600 py-4 rounded-xl items-center"
              >
                <Text className="text-white text-lg font-bold">Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handlePublish}
                disabled={publishing}
                className="bg-purple-600 py-4 rounded-xl items-center"
              >
                {publishing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-lg font-bold">
                    Publish Party
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {currentStep > 1 && currentStep < 5 && (
              <TouchableOpacity
                onPress={handleBack}
                className="bg-white/10 py-4 rounded-xl items-center"
              >
                <Text className="text-white font-semibold">Back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
