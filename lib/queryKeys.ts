/**
 * Centralised query key factory.
 * Using typed tuples lets us invalidate by prefix
 * (e.g. invalidate ALL feed pages for a user in one call).
 */
export const queryKeys = {
  feed: (userId?: string) => ["feed", userId] as const,
  profile: (userId: string) => ["profile", userId] as const,
  profileStats: (userId: string) => ["profileStats", userId] as const,
  profileTabs: (userId: string) => ["profileTabs", userId] as const,
  userPrefs: (userId: string) => ["userPrefs", userId] as const,
  unreadNotifications: (userId: string) => ["unreadNotifications", userId] as const,
  search: (query: string, genre: string | null) => ["search", query, genre] as const,
  // Phase 2
  partyDetail:    (partyId: string) => ["partyDetail", partyId] as const,
  partyTiers:     (partyId: string) => ["partyTiers", partyId] as const,
  partyAnalytics: (partyId: string) => ["partyAnalytics", partyId] as const,
  hostDashboard:  (userId: string)  => ["hostDashboard", userId] as const,
  hostEarnings:   (userId: string)  => ["hostEarnings", userId] as const,
};
