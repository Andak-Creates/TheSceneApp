/**
 * feedStore.ts
 *
 * The data-fetching logic has moved to hooks/useFeedQuery.ts (TanStack Query).
 * This file now only exports the FeedParty type so existing imports
 * across the codebase continue to resolve without changes.
 */

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
