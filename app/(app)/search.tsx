import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Image as RNImage,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { getCurrencySymbol } from "../../lib/currency";
import { supabase } from "../../lib/supabase";

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  date: string | null;
  city: string | null;
  ticket_price: number | null;
  music_genres: string[];
  date_tba?: boolean;
  currency_code?: string;
}

const GENRES = [
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

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
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

  const fetchSearchParties = useCallback(
    async (query: string = "", genre: string | null = null) => {
      setLoading(true);
      try {
        let supabaseQuery = supabase
          .from("parties")
          .select("*")
          .eq("is_published", true);

        if (query) {
          // Handle common squashed words like "afrobeats" -> "afro beats"
          const normalizedQuery = query.toLowerCase().trim();
          let tokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

          // Special case: if query contains "afrobeats" but not "afro" and "beats" separately,
          // we added them to tokens in the previous version, but let's be more systematic now.
          if (normalizedQuery.includes("afrobeats") && tokens.length === 1) {
            tokens = ["afro", "beats"];
          }

          // Apply a filter for each unique token
          const uniqueTokens = Array.from(new Set(tokens));
          for (const token of uniqueTokens) {
            // 1. Find which canonical genres match this token (e.g. "afro" matches "Afrobeats" & "Afro House")
            const matchingGenres = GENRES.filter((genre) =>
              genre.toLowerCase().includes(token.toLowerCase()),
            );

            // 2. Build the OR filter for this token
            let componentQuery = `title.ilike.%${token}%,description.ilike.%${token}%,city.ilike.%${token}%`;

            // 3. If the token matches any genres, include a containment check for those genres
            if (matchingGenres.length > 0) {
              // Postgres array containment syntax for multiple options: music_genres.ov.{Genre1,Genre2}
              // "ov" stands for overlap, which works here as well.
              const genreList = `{${matchingGenres.map((g) => `"${g}"`).join(",")}}`;
              componentQuery += `,music_genres.ov.${genreList}`;
            }

            supabaseQuery = supabaseQuery.or(componentQuery);
          }
        }

        if (genre) {
          supabaseQuery = supabaseQuery.contains("music_genres", [genre]);
        }

        const { data, error } = await supabaseQuery
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        setParties(data || []);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchSearchParties(searchQuery, selectedGenre);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedGenre, fetchSearchParties]);

  const renderPartyItem = ({ item }: { item: Party }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() =>
        router.push({ pathname: "/party/[id]", params: { id: item.id } })
      }
      className="mx-6 mb-4 bg-white/5 rounded-3xl overflow-hidden border border-white/5 flex-row"
    >
      <RNImage
        source={{ uri: item.flyer_url }}
        className="w-24 h-24 m-3 rounded-2xl"
        resizeMode="cover"
      />
      <View className="flex-1 justify-center pr-4">
        <Text className="text-white font-bold text-base" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-gray-400 text-xs mt-1" numberOfLines={1}>
          {item.city || "Various Locations"}
        </Text>
        <View className="flex-row items-center mt-2">
          <Text className="text-purple-400 font-bold text-sm">
            {item.date_tba
              ? "TBA"
              : item.date
                ? new Date(item.date).toLocaleDateString()
                : ""}
          </Text>
          <View className="w-1 h-1 rounded-full bg-gray-600 mx-2" />
          <Text className="text-white font-medium text-sm">
            {getCurrencySymbol(item.currency_code || "NGN")}
            {item.ticket_price?.toLocaleString() || "0"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#09030e] pt-16">
      {/* Search Header */}
      <View className="px-6 pb-4">
        <View className="flex-row items-center bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            className="flex-1 ml-3 text-white font-medium"
            placeholder="Search parties, artists, or venues"
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery !== "" && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Genres Horizontal Scroll */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedGenre(null)}
            className={`mr-3 px-5 py-2.5 rounded-full border ${!selectedGenre ? "bg-purple-600 border-purple-600" : "bg-white/5 border-white/10"}`}
          >
            <Text
              className={`font-bold text-xs ${!selectedGenre ? "text-white" : "text-gray-400"}`}
            >
              All
            </Text>
          </TouchableOpacity>
          {GENRES.map((genre) => (
            <TouchableOpacity
              key={genre}
              onPress={() =>
                setSelectedGenre(genre === selectedGenre ? null : genre)
              }
              className={`mr-3 px-5 py-2.5 rounded-full border ${selectedGenre === genre ? "bg-purple-600 border-purple-600" : "bg-white/5 border-white/10"}`}
            >
              <Text
                className={`font-bold text-xs ${selectedGenre === genre ? "text-white" : "text-gray-400"}`}
              >
                {genre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a855f7" />
        </View>
      ) : (
        <FlatList
          data={parties}
          renderItem={renderPartyItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchSearchParties(searchQuery, selectedGenre);
              }}
              tintColor="#a855f7"
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-20 px-10">
              <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-6">
                <Ionicons name="search-outline" size={32} color="#333" />
              </View>
              <Text className="text-white text-xl font-bold mb-2">
                No results found
              </Text>
              <Text className="text-gray-500 text-center">
                Try searching for something else or browse different genres.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
