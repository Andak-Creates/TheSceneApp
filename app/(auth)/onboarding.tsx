import { detectUserLocation } from "@/lib/location";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";
import { usePreferencesStore } from "../../stores/preferencesStore";

const MUSIC_GENRES = [
  "Afrobeats", "Hip Hop", "R&B", "Amapiano", "House",
  "Dancehall", "Reggae", "Afro House", "Pop", "EDM", "Trap", "Alte",
];

const VIBES = [
  "🔥 Wild", "😌 Chill", "🌳 Outdoor", "🏠 Indoor", "🎭 Exclusive",
  "🎉 Open", "💃 Dance", "🎵 Live Music", "🌃 Rooftop", "🏖️ Beach",
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { markPreferencesComplete } = usePreferencesStore();

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [locationData, setLocationData] = useState<{
    city: string | null;
    state: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [showManualLocation, setShowManualLocation] = useState(false);
  const [manualCity, setManualCity] = useState("");
  const [manualCountry, setManualCountry] = useState("");

  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    setError("");
    const location = await detectUserLocation();
    if (location) {
      setLocationData(location);
      setShowManualLocation(false);
    } else {
      setShowManualLocation(true);
      setError("Location access denied. Please enter your city and country below.");
    }
    setDetectingLocation(false);
  };

  const handleManualLocation = () => {
    if (!manualCity.trim() || !manualCountry.trim()) {
      setError("Please enter both city and country.");
      return;
    }
    setLocationData({
      city: manualCity.trim(),
      state: null,
      country: manualCountry.trim(),
      latitude: null,
      longitude: null,
    });
    setError("");
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleVibe = (vibe: string) => {
    setSelectedVibes((prev) =>
      prev.includes(vibe) ? prev.filter((v) => v !== vibe) : [...prev, vibe]
    );
  };

  const handleContinue = async () => {
    if (selectedGenres.length === 0) {
      setError("Please select at least one music genre");
      return;
    }
    if (selectedVibes.length === 0) {
      setError("Please select at least one vibe");
      return;
    }
    if (!locationData) {
      setError("Please detect or enter your location");
      return;
    }
    if (!user) {
      setError("User not found. Please try logging in again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: prefsError } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            music_genres: selectedGenres,
            vibes: selectedVibes,
            city: locationData.city,
            state: locationData.state,
            country: locationData.country,
            last_noted_lat: locationData.latitude,
            last_noted_lng: locationData.longitude,
          },
          { onConflict: "user_id" }
        );

      if (prefsError) throw prefsError;

      markPreferencesComplete();
      router.replace("/(app)/feed");
    } catch (err: any) {
      console.error("Save preferences error:", err);
      setError(err.message || "Failed to save preferences");
    } finally {
      // Always clear loading — whether success or error
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../../assets/images/onboardImg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={["rgba(25, 16, 34, 0.3)", "rgba(25, 16, 34, 0.6)", "rgba(25, 16, 34, 1)"]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["transparent", "rgba(25, 16, 34, 0.95)", "rgba(25, 16, 34, 1)"]}
        style={[StyleSheet.absoluteFillObject, { top: "20%" }]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pb-8 pt-16">
            {/* Title */}
            <View className="mb-8">
              <Text className="text-white text-left tracking-tight text-[36px] font-extrabold leading-tight mb-3">
                Set Your{"\n"}
                <Text className="text-purple-500">Vibe</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Tell us what you like so we can show you the best parties
              </Text>
            </View>

            {/* Error */}
            {error ? (
              <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                <Text className="text-red-300 text-sm font-medium">{error}</Text>
              </View>
            ) : null}

            {/* Music Genres */}
            <View className="mb-8">
              <Text className="text-white text-lg font-bold mb-3">Music You Love</Text>
              <View className="flex-row flex-wrap gap-3">
                {MUSIC_GENRES.map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    onPress={() => toggleGenre(genre)}
                    className={`px-4 py-3 rounded-full border ${
                      selectedGenres.includes(genre)
                        ? "bg-purple-600 border-purple-600"
                        : "bg-white/10 border-white/20"
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className={`font-semibold ${selectedGenres.includes(genre) ? "text-white" : "text-gray-300"}`}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Vibes */}
            <View className="mb-8">
              <Text className="text-white text-lg font-bold mb-3">Your Vibe</Text>
              <View className="flex-row flex-wrap gap-3">
                {VIBES.map((vibe) => (
                  <TouchableOpacity
                    key={vibe}
                    onPress={() => toggleVibe(vibe)}
                    className={`px-4 py-3 rounded-full border ${
                      selectedVibes.includes(vibe)
                        ? "bg-purple-600 border-purple-600"
                        : "bg-white/10 border-white/20"
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className={`font-semibold ${selectedVibes.includes(vibe) ? "text-white" : "text-gray-300"}`}>
                      {vibe}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Location */}
            <View className="mb-8">
              <Text className="text-white text-lg font-bold mb-3">Your Location</Text>
              {locationData ? (
                <View className="flex-row items-center justify-between bg-white/10 border border-purple-500/50 rounded-xl px-5 py-4">
                  <View>
                    <Text className="text-white font-semibold">
                      {[locationData.city, locationData.state].filter(Boolean).join(", ")}
                    </Text>
                    <Text className="text-gray-400 text-sm">{locationData.country}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setLocationData(null); setShowManualLocation(false); }}>
                    <Ionicons name="refresh" size={20} color="#a855f7" />
                  </TouchableOpacity>
                </View>
              ) : showManualLocation ? (
                <View className="gap-3">
                  <TextInput
                    className="bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white"
                    placeholder="City (e.g. Lagos)"
                    placeholderTextColor="#666"
                    value={manualCity}
                    onChangeText={setManualCity}
                  />
                  <TextInput
                    className="bg-white/10 border border-white/20 rounded-xl h-12 px-4 text-white"
                    placeholder="Country (e.g. Nigeria)"
                    placeholderTextColor="#666"
                    value={manualCountry}
                    onChangeText={setManualCountry}
                  />
                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={handleManualLocation}
                      className="flex-1 flex-row items-center justify-center bg-purple-600/30 border border-purple-500/50 rounded-xl h-12 px-4"
                    >
                      <Text className="text-purple-300 font-semibold">Confirm Location</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDetectLocation}
                      disabled={detectingLocation}
                      className="flex-row items-center justify-center bg-white/10 border border-white/20 rounded-xl h-12 px-4"
                    >
                      {detectingLocation ? (
                        <ActivityIndicator size="small" color="#a855f7" />
                      ) : (
                        <Ionicons name="locate" size={18} color="#a855f7" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={handleDetectLocation}
                    disabled={detectingLocation}
                    className="flex-row items-center justify-center bg-white/10 border border-white/20 rounded-xl h-14 px-5 gap-3"
                  >
                    {detectingLocation ? (
                      <ActivityIndicator color="#a855f7" />
                    ) : (
                      <>
                        <Ionicons name="location-outline" size={20} color="#a855f7" />
                        <Text className="text-gray-300 font-semibold">Detect My Location</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowManualLocation(true)}
                    className="mt-3 items-center"
                  >
                    <Text className="text-gray-500 text-sm underline">Enter location manually instead</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              className="items-center justify-center rounded-xl h-14 px-5 bg-purple-600 mb-4"
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-lg font-bold">Continue to Feed</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  primaryButton: {
    shadowColor: "#8c25f4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
});