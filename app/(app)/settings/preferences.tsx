import CurrencySelector from "@/components/CurrencySelector";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { detectUserLocation } from "../../../lib/location";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

const MUSIC_GENRES = [
  "Afrobeats", "Hip Hop", "R&B", "Amapiano", "House", "Dancehall",
  "Reggae", "Afro House", "Pop", "EDM", "Trap", "Alte",
];

const VIBES = [
  "🔥 Wild", "😌 Chill", "🌳 Outdoor", "🏠 Indoor", "🎭 Exclusive",
  "🎉 Open", "💃 Dance", "🎵 Live Music", "🌃 Rooftop", "🏖️ Beach",
];

export default function PreferencesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState("NGN");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);

  useEffect(() => {
    fetchPreferences();
  }, [user?.id]);

  const fetchPreferences = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("city, state, country, preferred_currency, music_genres, vibes")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setCity(data.city || "");
        setState(data.state || "");
        setCountry(data.country || "");
        setPreferredCurrency(data.preferred_currency || "NGN");
        setSelectedGenres((data.music_genres as string[]) || []);
        setSelectedVibes((data.vibes as string[]) || []);
      }
    } catch (e) {
      console.error("Error fetching preferences:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setDetectingLocation(true);
    try {
      const loc = await detectUserLocation();
      if (loc) {
        setCity(loc.city || "");
        setState(loc.state || "");
        setCountry(loc.country || "");
      } else {
        Alert.alert(
          "Location unavailable",
          "Could not get your location. Please enable location permissions or enter manually."
        );
      }
    } catch (e) {
      Alert.alert("Error", "Failed to detect location.");
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          city: city.trim() || null,
          state: state.trim() || null,
          country: country.trim() || null,
          preferred_currency: preferredCurrency,
          music_genres: selectedGenres,
          vibes: selectedVibes,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
      Alert.alert("Saved", "Your preferences have been updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const toggleVibe = (v: string) => {
    setSelectedVibes((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#09030e]"
    >
      <View className="pt-16 pb-4 px-6 border-b border-white/5 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-white/5 rounded-full">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Location & Preferences</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-6 pb-30" showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Location</Text>
          <Text className="text-gray-400 text-sm mb-3">
            We use this to recommend parties near you.
          </Text>
          <TouchableOpacity
            onPress={handleUseCurrentLocation}
            disabled={detectingLocation}
            className="flex-row items-center py-3 px-4 bg-purple-600/20 rounded-xl border border-purple-500/30 mb-4"
          >
            {detectingLocation ? (
              <ActivityIndicator size="small" color="#a855f7" />
            ) : (
              <Ionicons name="locate" size={20} color="#a855f7" />
            )}
            <Text className="text-purple-400 font-semibold ml-3">
              {detectingLocation ? "Detecting..." : "Use current location"}
            </Text>
          </TouchableOpacity>
          <View className="mb-3">
            <Text className="text-gray-400 text-xs mb-1">City</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
              placeholder="e.g. Lagos"
              placeholderTextColor="#666"
              value={city}
              onChangeText={setCity}
            />
          </View>
          <View className="mb-3">
            <Text className="text-gray-400 text-xs mb-1">State / Region</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
              placeholder="e.g. Lagos"
              placeholderTextColor="#666"
              value={state}
              onChangeText={setState}
            />
          </View>
          <View className="mb-4">
            <Text className="text-gray-400 text-xs mb-1">Country</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
              placeholder="e.g. Nigeria"
              placeholderTextColor="#666"
              value={country}
              onChangeText={setCountry}
            />
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Preferred currency</Text>
          <CurrencySelector selectedCurrency={preferredCurrency} onSelect={setPreferredCurrency} />
        </View>

        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Music genres</Text>
          <View className="flex-row flex-wrap gap-2">
            {MUSIC_GENRES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => toggleGenre(g)}
                className={`px-4 py-2 rounded-full border ${
                  selectedGenres.includes(g) ? "bg-purple-600 border-purple-500" : "bg-white/5 border-white/10"
                }`}
              >
                <Text className={selectedGenres.includes(g) ? "text-white font-bold" : "text-gray-300"}>
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mb-8">
          <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Vibes</Text>
          <View className="flex-row flex-wrap gap-2">
            {VIBES.map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => toggleVibe(v)}
                className={`px-4 py-2 rounded-full border ${
                  selectedVibes.includes(v) ? "bg-purple-600 border-purple-500" : "bg-white/5 border-white/10"
                }`}
              >
                <Text className={selectedVibes.includes(v) ? "text-white font-bold" : "text-gray-300"}>
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className="bg-purple-600 py-4 rounded-2xl items-center mb-12"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Save preferences</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
