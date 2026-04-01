import { useAudioStore } from "@/stores/audioStore";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import PartyCard from "../../components/PartyCard";
import ProfileCard, { SearchResultProfile } from "../../components/ProfileCard";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";

interface Party {
  id: string;
  title: string;
  flyer_url: string;
  thumbnail_url?: string | null;
  date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  ticket_price: number | null;
  music_genres: string[];
  date_tba?: boolean;
  currency_code?: string;
  views_count?: number;
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
  const [profiles, setProfiles] = useState<SearchResultProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Inside the component:
  const { user } = useAuthStore();
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
          .select(`*, party_media(thumbnail_url, media_type, is_primary), host_profile:host_profiles(name, is_verified)`)
          .eq("is_published", true);

        if (query) {
          // Fetch profiles first
          const [usersData, hostsData] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, username, full_name, avatar_url")
              .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
              .limit(10),
            supabase
              .from("host_profiles")
              .select("id, owner_id, name, avatar_url, is_verified, owner:profiles!owner_id(username)")
              .ilike("name", `%${query}%`)
              .limit(10),
          ]);
          
          const uData = usersData.data || [];
          const hData = hostsData.data || [];
          
          let combined: SearchResultProfile[] = [];
          
          if (uData.length > 0) {
             combined = [...combined, ...uData.map((u: any): SearchResultProfile => ({
                type: "user",
                id: u.id,
                owner_id: u.id,
                username: u.username,
                full_name: u.full_name || "",
                avatar_url: u.avatar_url,
                initialIsFollowing: false,
             }))];
          }
          
          if (hData.length > 0) {
             combined = [...combined, ...hData.map((h: any): SearchResultProfile => ({
                type: "host",
                id: h.id,
                owner_id: h.owner_id,
                username: h.owner?.username || "",
                full_name: h.name,
                avatar_url: h.avatar_url,
                is_verified: h.is_verified,
                initialIsFollowing: false,
             }))];
          }
          
          if (user && combined.length > 0) {
            const ownerIds = combined.map(p => p.owner_id);
            const { data: followsData } = await supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", user.id)
              .in("following_id", ownerIds);
              
            const followSet = new Set(followsData?.map(f => f.following_id) || []);
            combined = combined.map(p => ({
               ...p,
               initialIsFollowing: followSet.has(p.owner_id)
            }));
          }
          
          setProfiles(combined);

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
            let componentQuery = `title.ilike.%${token}%,description.ilike.%${token}%,city.ilike.%${token}%,state.ilike.%${token}%,country.ilike.%${token}%`;

            // 3. If the token matches any genres, include a containment check for those genres
            if (matchingGenres.length > 0) {
              // Postgres array containment syntax for multiple options: music_genres.ov.{Genre1,Genre2}
              // "ov" stands for overlap, which works here as well.
              const genreList = `{${matchingGenres.map((g) => `"${g}"`).join(",")}}`;
              componentQuery += `,music_genres.ov.${genreList}`;
            }

            supabaseQuery = supabaseQuery.or(componentQuery);
          }
        } else {
          setProfiles([]);
        }

        if (genre) {
          supabaseQuery = supabaseQuery.contains("music_genres", [genre]);
        }

        const { data, error } = await supabaseQuery
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        // Filter out ended parties (same logic as feed)
        const now = new Date();
        const activeParties = (data || []).filter((party: any) => {
          if (party.date_tba) return true;
          if (party.end_date) return new Date(party.end_date) > now;
          if (party.date) {
            const startDate = new Date(party.date);
            const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
            return startDate > twelveHoursAgo;
          }
          return true;
        }).map((party: any) => {
          // Extract thumbnail_url from the first primary media row
          const mediaRows: any[] = party.party_media || [];
          const primaryMedia = mediaRows.find((m: any) => m.is_primary) || mediaRows[0];
          const thumbnail_url = primaryMedia?.media_type === "video"
            ? primaryMedia?.thumbnail_url ?? null
            : null;
          return { ...party, thumbnail_url };
        });

        if (activeParties.length > 0) {
          const partyIds = activeParties.map((p: any) => p.id);
          const { data: viewRows } = await supabase
            .from("party_views")
            .select("party_id")
            .in("party_id", partyIds);

          const viewsMap: Record<string, number> = {};
          for (const row of viewRows || []) {
            viewsMap[row.party_id] = (viewsMap[row.party_id] || 0) + 1;
          }

          const partiesWithViews = activeParties.map((p: any) => ({
            ...p,
            views_count: viewsMap[p.id] || 0,
          }));

          setParties(partiesWithViews);
        } else {
          setParties([]);
        }
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

  const renderPartyRow = ({ item }: { item: [Party, Party | null] }) => (
    <View className="flex-row gap-3 px-6 mb-3">
      <PartyCard party={item[0]} />
      {item[1] ? <PartyCard party={item[1]} /> : <View style={{ flex: 1 }} />}
    </View>
  );

  // Group parties into pairs for 2-column grid
  const partyRows: [Party, Party | null][] = [];
  for (let i = 0; i < parties.length; i += 2) {
    partyRows.push([parties[i], parties[i + 1] ?? null]);
  }

  return (
    <View className="flex-1 bg-[#09030e] pt-16">
      {/* Search Header */}
      <View className="px-6 pb-4">
        <View className="flex-row items-center bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            className="flex-1 ml-3 text-white font-medium"
            placeholder="Search parties, city, state or country…"
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
          data={partyRows}
          renderItem={renderPartyRow}
          keyExtractor={(_, i) => `row-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
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
          ListHeaderComponent={profiles.length > 0 ? (
            <View className="mb-4">
              <Text className="text-white font-bold text-lg px-6 mb-3">People & Brands</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
                {profiles.map(p => <ProfileCard key={`${p.type}-${p.id}`} profile={p} />)}
              </ScrollView>
              {partyRows.length > 0 && <Text className="text-white font-bold text-lg px-6 mt-6 mb-1">Parties</Text>}
            </View>
          ) : null}
          ListEmptyComponent={
            <View className="items-center justify-center py-20 px-10">
              <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-6">
                <Ionicons name="search-outline" size={32} color="#333" />
              </View>
              <Text className="text-white text-xl font-bold mb-2">
                {profiles.length > 0 ? "No parties found" : "No results found"}
              </Text>
              <Text className="text-gray-500 text-center">
                {profiles.length > 0 ? "Try searching for a different party" : "Try searching for something else or browse different genres."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
