import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { supabase } from "../lib/supabase";
import { FeedParty } from "../stores/feedStore";

const PAGE_SIZE = 12;

// ---------------------------------------------------------------------------
// Pure data-fetching function — no side effects, just returns data
// ---------------------------------------------------------------------------
async function fetchFeedPage(
  userId: string | undefined,
  pageParam: number
): Promise<{ parties: FeedParty[]; hasMore: boolean }> {
  // 1. Fetch user preferences for geo-filtering
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

  // 2. Build parties query
  let query = supabase
    .from("parties")
    .select(
      `*,
      host:profiles!host_id (id, username, avatar_url, is_host),
      host_profile:host_profiles!host_profile_id (id, name, avatar_url, is_verified),
      media:party_media(*)`
    )
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

  if (userState) {
    const normalizedState = userState.replace(/ state$/i, "").trim();
    query = query.or(
      `state.ilike.%${normalizedState}%,city.ilike.%${normalizedState}%`
    );
  } else if (userCity) {
    query = query.ilike("city", `%${userCity}%`);
  } else if (userCountry) {
    query = query.ilike("country", `%${userCountry}%`);
  }

  const { data: partiesData, error } = await query;
  if (error) throw error;

  const fetchedParties = partiesData || [];
  const hasMore = fetchedParties.length === PAGE_SIZE;

  // 3. Filter ended parties locally
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

  if (activeParties.length === 0) return { parties: [], hasMore };

  const partyIds = activeParties.map((p) => p.id);

  // 4. Batch engagement queries
  const [likesRes, commentsRes, repostsRes, userLikesRes, userRepostsRes] =
    await Promise.all([
      supabase.from("party_likes_count").select("party_id, count").in("party_id", partyIds),
      supabase.from("party_comments_count").select("party_id, count").in("party_id", partyIds),
      supabase.from("party_reposts_count").select("party_id, count").in("party_id", partyIds),
      userId
        ? supabase
            .from("party_likes")
            .select("party_id")
            .in("party_id", partyIds)
            .eq("user_id", userId)
        : Promise.resolve({ data: [] }),
      userId
        ? supabase
            .from("party_reposts")
            .select("party_id")
            .in("party_id", partyIds)
            .eq("user_id", userId)
        : Promise.resolve({ data: [] }),
    ]);

  // 5. Build lookup maps
  const likesMap: Record<string, number> = {};
  const commentsMap: Record<string, number> = {};
  const repostsMap: Record<string, number> = {};
  const likedSet = new Set<string>();
  const repostedSet = new Set<string>();

  for (const r of likesRes.data || [])
    likesMap[r.party_id] = Number(r.count || 0);
  for (const r of commentsRes.data || [])
    commentsMap[r.party_id] = Number(r.count || 0);
  for (const r of repostsRes.data || [])
    repostsMap[r.party_id] = Number(r.count || 0);
  for (const r of userLikesRes.data || []) likedSet.add(r.party_id);
  for (const r of userRepostsRes.data || []) repostedSet.add(r.party_id);

  // 6. Merge & sort media
  const enrichedParties: FeedParty[] = activeParties.map((party) => {
    if (party.media && Array.isArray(party.media)) {
      party.media = party.media.filter(
        (m: any) =>
          m.media_url &&
          (m.media_url.startsWith("http") || m.media_url.startsWith("https"))
      );
      party.media.sort((a: any, b: any) => {
        if (a.is_primary) return -1;
        if (b.is_primary) return 1;
        return (a.display_order || 0) - (b.display_order || 0);
      });
    }
    return {
      ...party,
      likes_count: likesMap[party.id] || 0,
      comments_count: commentsMap[party.id] || 0,
      reposts_count: repostsMap[party.id] || 0,
      is_liked: likedSet.has(party.id),
      is_reposted: repostedSet.has(party.id),
    };
  });

  return { parties: enrichedParties, hasMore };
}

// ---------------------------------------------------------------------------
// Hook — wraps useInfiniteQuery, exposes a feedStore-compatible API
// ---------------------------------------------------------------------------
export function useFeedQuery(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: queryKeys.feed(userId),
    queryFn: ({ pageParam }) => fetchFeedPage(userId, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    staleTime: 5 * 60 * 1000,
  });

  /** Flat list of all loaded parties (deduped by id) */
  const allParties = query.data?.pages.flatMap((p) => p.parties) ?? [];
  const seen = new Set<string>();
  const parties = allParties.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  /** Optimistic update — instantly mutates the cached pages */
  const updateParty = (id: string, updates: Partial<FeedParty>) => {
    queryClient.setQueryData(
      queryKeys.feed(userId),
      (old: typeof query.data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            parties: page.parties.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          })),
        };
      }
    );
  };

  return {
    parties,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    hasMore: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => query.fetchNextPage(),
    refetch: () => query.refetch(),
    updateParty,
  };
}
