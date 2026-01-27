import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
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

// Predefined options
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

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { markPreferencesComplete } = usePreferencesStore();

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
    // Validation
    if (selectedGenres.length === 0) {
      setError("Please select at least one music genre");
      return;
    }

    if (selectedVibes.length === 0) {
      setError("Please select at least one vibe");
      return;
    }

    if (!city.trim()) {
      setError("Please enter your city");
      return;
    }

    if (!user) {
      setError("User not found. Please try logging in again.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Save preferences to database
      const { error: prefsError } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          music_genres: selectedGenres,
          vibes: selectedVibes,
          city: city.trim(),
        });

      if (prefsError) {
        throw prefsError;
      }

      console.log("Preferences saved successfully!");

      // Mark preferences as complete in the store BEFORE navigating
      markPreferencesComplete();

      // Small delay to ensure state updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Navigate to main app (feed)
      router.replace("/(app)/feed");
    } catch (err: any) {
      console.error("Save preferences error:", err);
      setError(err.message || "Failed to save preferences");
      setLoading(false);
    }
  };
  return (
    <ImageBackground
      source={require("../../assets/images/onboardImg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Gradient Overlays */}
      <LinearGradient
        colors={[
          "rgba(25, 16, 34, 0.3)",
          "rgba(25, 16, 34, 0.6)",
          "rgba(25, 16, 34, 1)",
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          "transparent",
          "rgba(25, 16, 34, 0.95)",
          "rgba(25, 16, 34, 1)",
        ]}
        style={[StyleSheet.absoluteFillObject, { top: "20%" }]}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 pb-8 pt-16">
          {/* Progress Indicator */}
          <View className="flex-row gap-2 mb-8">
            <View className="flex-1 h-1 bg-purple-500 rounded-full" />
            <View className="flex-1 h-1 bg-white/20 rounded-full" />
            <View className="flex-1 h-1 bg-white/20 rounded-full" />
          </View>

          {/* Title Section */}
          <View className="mb-8">
            <Text className="text-white text-left tracking-tight text-[36px] font-extrabold leading-tight mb-3">
              Set Your{"\n"}
              <Text className="text-purple-500">Vibe</Text>
            </Text>
            <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
              Tell us what you like so we can show you the best parties
            </Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
              <Text className="text-red-300 text-sm font-medium">{error}</Text>
            </View>
          ) : null}

          {/* Music Genres Section */}
          <View className="mb-8">
            <Text className="text-white text-lg font-bold mb-3">
              Music You Love
            </Text>
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
                  <Text
                    className={`font-semibold ${
                      selectedGenres.includes(genre)
                        ? "text-white"
                        : "text-gray-300"
                    }`}
                  >
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Vibes Section */}
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
                  <Text
                    className={`font-semibold ${
                      selectedVibes.includes(vibe)
                        ? "text-white"
                        : "text-gray-300"
                    }`}
                  >
                    {vibe}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* City Input */}
          <View className="mb-8">
            <Text className="text-white text-lg font-bold mb-3">Your City</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 text-white text-base"
              placeholder="e.g., Lagos, Accra, London"
              placeholderTextColor="#888"
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
              autoCorrect={false}
            />
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
              <Text className="text-white text-lg font-bold">
                Continue to Feed
              </Text>
            )}
          </TouchableOpacity>

          {/* Skip for now */}
          <TouchableOpacity
            className="items-center py-3"
            onPress={() => router.replace("/(app)/feed")}
          >
            <Text className="text-gray-400 text-sm underline">
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  primaryButton: {
    shadowColor: "#8c25f4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
});
