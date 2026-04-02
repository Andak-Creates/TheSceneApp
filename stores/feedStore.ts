import { create } from "zustand";
import { supabase } from "../lib/supabase";

export interface FeedParty {
  id: string;
  title: string;
  description: string | null;
  flyer_url: string;
  date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  ticket_price: number | null;
  ticket_quantity: number;
  tickets_sold: number;
  music_genres: string[];
  vibes: string[];
  currency_code?: string;
  host_id: string;
  created_at: string;
  date_tba?: boolean;
  location_tba?: boolean;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_host: boolean;
  };
  host_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  media?: {
    id: string;
    media_url: string;
    media_type: "image" | "video";
    is_primary: boolean;
    display_order: number;
    thumbnail_url?: string;
  }[];
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  is_liked: boolean;
  is_reposted: boolean;
}

interface FeedState {
  parties: FeedParty[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  page: number;
  setParties: (parties: FeedParty[]) => void;
  updateParty: (id: string, updates: Partial<FeedParty>) => void;
  fetchParties: (userId: string | undefined, isRefresh?: boolean) => Promise<void>;
  clearStore: () => void;
}

const PAGE_SIZE = 12;

export const useFeedStore = create<FeedState>((set, get) => ({
  parties: [],
  isLoading: true,
  isRefreshing: false,
  hasMore: true,
  page: 0,

  setParties: (parties) => set({ parties }),

  updateParty: (id, updates) => {
    set((state) => ({
      parties: state.parties.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  },

  clearStore: () => set({ parties: [], isLoading: true, isRefreshing: false, hasMore: true, page: 0 }),

  fetchParties: async (userId: string | undefined, isRefresh = false) => {
    const { page, parties, isRefreshing } = get();

    if (isRefresh) {
      set({ isRefreshing: true, hasMore: true });
    } else {
      if (!get().hasMore || get().isLoading && parties.length > 0) return;
      set({ isLoading: true });
    }

    const currentPage = isRefresh ? 0 : page;

    try {
      // 1. Fetch user preferences
      let userState = "";
      let userCountry = "";
      let userCity = "";
      
      if (userId) {
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("city, state, country")
          .eq("user_id", userId)
          .maybeSingle();

        if (prefs) {
          userState = (prefs.state || "").toLowerCase();
          userCountry = (prefs.country || "").toLowerCase();
          userCity = (prefs.city || "").toLowerCase();
        }
      }

      // 2. Fetch main parties
      let query = supabase
        .from("parties")
        .select(
          `
          *,
          host:profiles!host_id (id, username, avatar_url, is_host),
          host_profile:host_profiles!host_profile_id (id, name, avatar_url, is_verified),
          media:party_media(*)
        `
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (userState) {
        // Normalize "Lagos State" to "Lagos" to catch all variations
        const normalizedState = userState.replace(/ state$/i, "").trim();
        // Check if the party's state matches, OR if the party's city accidentally contains the state name
        query = query.or(`state.ilike.%${normalizedState}%,city.ilike.%${normalizedState}%`);
      } else if (userCity) {
        query = query.ilike("city", `%${userCity}%`);
      } else if (userCountry) {
        query = query.ilike("country", `%${userCountry}%`);
      }

      const { data: partiesData, error: partiesError } = await query;
      if (partiesError) throw partiesError;

      const fetchedParties = partiesData || [];
      const hasMoreFetched = fetchedParties.length === PAGE_SIZE;

      if (fetchedParties.length === 0) {
        set({
          parties: isRefresh ? [] : parties,
          isLoading: false,
          isRefreshing: false,
          hasMore: false,
        });
        return;
      }

      // 3. Filter out ended parties locally
      const now = new Date();
      const activeParties = fetchedParties.filter((party) => {
        if (party.date_tba) return true;
        if (party.end_date) return new Date(party.end_date) > now;
        if (party.date) {
          const startDate = new Date(party.date);
          const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
          return startDate > twelveHoursAgo;
        }
        return true;
      });

      if (activeParties.length === 0) {
        set({
          parties: isRefresh ? [] : parties,
          isLoading: false,
          isRefreshing: false,
          hasMore: hasMoreFetched,
          page: isRefresh ? 1 : page + 1,
        });
        return;
      }

      const partyIds = activeParties.map((p) => p.id);

      // 4. Batch engagement queries
      const [likesCountRes, commentsCountRes, repostsCountRes, userLikesRes, userRepostsRes] =
        await Promise.all([
          supabase.from("party_likes").select("party_id").in("party_id", partyIds),
          supabase.from("party_comments").select("party_id").in("party_id", partyIds),
          supabase.from("party_reposts").select("party_id").in("party_id", partyIds),
          userId
            ? supabase.from("party_likes").select("party_id").in("party_id", partyIds).eq("user_id", userId)
            : Promise.resolve({ data: [] }),
          userId
            ? supabase.from("party_reposts").select("party_id").in("party_id", partyIds).eq("user_id", userId)
            : Promise.resolve({ data: [] }),
        ]);

      // 5. Build lookup maps
      const likesCountMap: Record<string, number> = {};
      const commentsCountMap: Record<string, number> = {};
      const repostsCountMap: Record<string, number> = {};
      const likedSet = new Set<string>();
      const repostedSet = new Set<string>();

      for (const r of likesCountRes.data || []) likesCountMap[r.party_id] = (likesCountMap[r.party_id] || 0) + 1;
      for (const r of commentsCountRes.data || []) commentsCountMap[r.party_id] = (commentsCountMap[r.party_id] || 0) + 1;
      for (const r of repostsCountRes.data || []) repostsCountMap[r.party_id] = (repostsCountMap[r.party_id] || 0) + 1;
      for (const r of userLikesRes.data || []) likedSet.add(r.party_id);
      for (const r of userRepostsRes.data || []) repostedSet.add(r.party_id);

      // 6. Merge engagement
      const enrichedParties: FeedParty[] = activeParties.map((party) => {
        if (party.media && Array.isArray(party.media)) {
          party.media = party.media.filter(
            (m: any) => m.media_url && (m.media_url.startsWith("http") || m.media_url.startsWith("https"))
          );
          party.media.sort((a: any, b: any) => {
            if (a.is_primary) return -1;
            if (b.is_primary) return 1;
            return (a.display_order || 0) - (b.display_order || 0);
          });
        }
        return {
          ...party,
          likes_count: likesCountMap[party.id] || 0,
          comments_count: commentsCountMap[party.id] || 0,
          reposts_count: repostsCountMap[party.id] || 0,
          is_liked: likedSet.has(party.id),
          is_reposted: repostedSet.has(party.id),
        };
      });

      // 7. Update store
      set((state) => {
        // If refreshing, replace the whole list
        if (isRefresh) {
          return {
            parties: enrichedParties,
            page: 1,
            hasMore: hasMoreFetched,
            isLoading: false,
            isRefreshing: false,
          };
        }

        // Deduplicate
        const existingIds = new Set(state.parties.map((p) => p.id));
        const newParties = enrichedParties.filter((p) => !existingIds.has(p.id));

        return {
          parties: [...state.parties, ...newParties],
          page: state.page + 1,
          hasMore: hasMoreFetched,
          isLoading: false,
        };
      });
    } catch (error) {
      console.error("Error fetching parties:", error);
      set({ isLoading: false, isRefreshing: false });
    }
  },
}));
