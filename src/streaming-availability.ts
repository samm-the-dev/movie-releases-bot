/**
 * Streaming Availability API client (Movie of the Night).
 *
 * Queries the /changes endpoint to discover movies newly added
 * to major US streaming services. Free tier: 100 requests/day.
 *
 * Requires STREAMING_API_KEY env var (RapidAPI key).
 * Docs: https://docs.movieofthenight.com/
 */

const SA_BASE = 'https://streaming-availability.p.rapidapi.com';

/** Streaming service catalog IDs used by the API. */
export const ServiceId = {
  NETFLIX: 'netflix',
  DISNEY_PLUS: 'disney',
  MAX: 'hbo',
  HULU: 'hulu',
  PRIME_VIDEO: 'prime',
  PEACOCK: 'peacock',
  PARAMOUNT_PLUS: 'paramount',
  APPLE_TV_PLUS: 'apple',
} as const;

export type ServiceIdValue = (typeof ServiceId)[keyof typeof ServiceId];

/** Human-readable display names for each service. */
export const ServiceDisplayName: Record<ServiceIdValue, string> = {
  [ServiceId.NETFLIX]: 'Netflix',
  [ServiceId.DISNEY_PLUS]: 'Disney+',
  [ServiceId.MAX]: 'Max',
  [ServiceId.HULU]: 'Hulu',
  [ServiceId.PRIME_VIDEO]: 'Prime Video',
  [ServiceId.PEACOCK]: 'Peacock',
  [ServiceId.PARAMOUNT_PLUS]: 'Paramount+',
  [ServiceId.APPLE_TV_PLUS]: 'Apple TV+',
};

/** All Big 8 US services in display order. */
export const ALL_SERVICES: ServiceIdValue[] = [
  ServiceId.NETFLIX,
  ServiceId.DISNEY_PLUS,
  ServiceId.MAX,
  ServiceId.HULU,
  ServiceId.PRIME_VIDEO,
  ServiceId.PEACOCK,
  ServiceId.PARAMOUNT_PLUS,
  ServiceId.APPLE_TV_PLUS,
];

/** A movie newly added to a streaming service. */
export interface StreamingChange {
  showId: string;
  title: string;
  serviceId: string;
  serviceName: string;
  link: string | null;
  tmdbId: number | null;
  imdbId: string | null;
  overview: string;
  releaseYear: number | null;
  genres: string[];
  directors: string[];
  runtime: number | null;
  rating: number | null;
}

/**
 * Parse TMDB ID from the API's "movie/663" format to numeric 663.
 * Returns null if the format is unexpected.
 */
function parseTmdbId(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/^movie\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/** Raw API response types. */
interface SAChangeEntry {
  changeType: string;
  itemType: string;
  showId: string;
  showType: string;
  service: { id: string };
  streamingOptionType: string;
  link: string | null;
  timestamp: number | null;
}

interface SAGenre {
  id: string;
  name: string;
}

interface SAShow {
  title: string;
  overview: string;
  showType: string;
  releaseYear: number | null;
  tmdbId?: string; // Format: "movie/663"
  imdbId?: string;
  genres?: SAGenre[];
  directors?: string[];
  cast?: string[];
  rating?: number; // 0-100
  runtime?: number; // minutes
  imageSet?: {
    verticalPoster?: Record<string, string>;
  };
}

interface SAChangesResponse {
  changes: SAChangeEntry[];
  shows: Record<string, SAShow>;
  hasMore: boolean;
  nextCursor?: string;
}

function getApiKey(): string {
  const key = process.env.STREAMING_API_KEY;
  if (!key) throw new Error('Missing STREAMING_API_KEY env var.');
  return key;
}

async function saFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${SA_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: { 'X-RapidAPI-Key': getApiKey() },
  });
  if (!response.ok) {
    throw new Error(`Streaming Availability API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Fetch all movies newly added to the specified services in a date range.
 * Paginates automatically through all results.
 *
 * @param services - Service IDs to query (e.g. ['netflix', 'disney'])
 * @param from - Unix timestamp for start of range
 * @param to - Unix timestamp for end of range
 * @param country - ISO 3166-1 alpha-2 country code
 */
export async function getNewStreamingMovies(
  services: ServiceIdValue[],
  from: number,
  to: number,
  country = 'us',
): Promise<StreamingChange[]> {
  const results: StreamingChange[] = [];
  const seen = new Set<string>(); // Dedupe by showId+serviceId
  let cursor: string | undefined;
  let page = 0;
  const MAX_PAGES = 20; // Safety cap to avoid runaway pagination

  do {
    page++;
    const params: Record<string, string> = {
      country,
      change_type: 'new',
      item_type: 'show',
      show_type: 'movie',
      catalogs: services.join(','),
      from: String(from),
      to: String(to),
      order_direction: 'desc',
    };
    if (cursor) params.cursor = cursor;

    const data = await saFetch<SAChangesResponse>('/changes', params);
    console.log(`  Streaming API page ${page}: ${data.changes.length} changes, hasMore=${data.hasMore}`);

    for (const change of data.changes) {
      const serviceId = change.service.id;
      const key = `${change.showId}-${serviceId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Only include titles available with a base subscription or for free —
      // skip add-ons (Shudder via Prime, etc.), rentals, and purchases.
      if (change.streamingOptionType !== 'subscription' && change.streamingOptionType !== 'free') continue;

      const show = data.shows[change.showId];
      if (!show || show.showType !== 'movie') continue;

      results.push({
        showId: change.showId,
        title: show.title,
        serviceId,
        serviceName: ServiceDisplayName[serviceId as ServiceIdValue] ?? serviceId,
        link: change.link,
        tmdbId: parseTmdbId(show.tmdbId),
        imdbId: show.imdbId ?? null,
        overview: show.overview ?? '',
        releaseYear: show.releaseYear ?? null,
        genres: (show.genres ?? []).map((g) => g.name),
        directors: show.directors ?? [],
        runtime: show.runtime ?? null,
        rating: show.rating ?? null,
      });
    }

    const hitPageCap = data.hasMore && page >= MAX_PAGES;
    cursor = hitPageCap ? undefined : data.nextCursor;
    if (hitPageCap) {
      console.log(`  Reached max pages (${MAX_PAGES}), stopping pagination.`);
    }
  } while (cursor);
  console.log(`  Total streaming changes: ${results.length} movies.`);

  return results;
}
