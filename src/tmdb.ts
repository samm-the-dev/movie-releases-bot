/**
 * TMDB API client focused on release-date endpoints.
 *
 * Uses plain fetch -- no SDK needed. TMDB rate limit is 40 req/10s,
 * and a typical weekly run makes <10 requests.
 *
 * Requires TMDB_API_KEY env var (free registration at api.themoviedb.org).
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';

/** TMDB release type codes from /release_dates endpoint. */
export const ReleaseType = {
  PREMIERE: 1,
  THEATRICAL_LIMITED: 2,
  THEATRICAL: 3,
  DIGITAL: 4,
  PHYSICAL: 5,
  TV: 6,
} as const;

export interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  popularity: number;
  release_date: string;
  genre_ids: number[];
  poster_path: string | null;
}

interface TMDBDiscoverResponse {
  page: number;
  results: TMDBMovie[];
  total_pages: number;
  total_results: number;
}

export interface TMDBReleaseDateEntry {
  type: number;
  release_date: string;
  certification: string;
  note: string;
}

interface TMDBReleaseDateResult {
  iso_3166_1: string;
  release_dates: TMDBReleaseDateEntry[];
}

interface TMDBReleaseDatesResponse {
  id: number;
  results: TMDBReleaseDateResult[];
}

export interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBGenreResponse {
  genres: TMDBGenre[];
}

export function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('Missing TMDB_API_KEY env var.');
  return key;
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Discover movies by release type and date range.
 * Used for both theatrical (type 3) and digital (type 4) release detection.
 */
export async function discoverByReleaseType(
  releaseType: number,
  dateGte: string,
  dateLte: string,
  region = 'US',
): Promise<TMDBMovie[]> {
  const data = await tmdbFetch<TMDBDiscoverResponse>('/discover/movie', {
    region,
    with_release_type: String(releaseType),
    'release_date.gte': dateGte,
    'release_date.lte': dateLte,
    sort_by: 'popularity.desc',
  });
  return data.results;
}

/**
 * Get per-country release dates for a movie.
 * Returns entries for the specified region (default US).
 */
export async function getReleaseDates(
  movieId: number,
  region = 'US',
): Promise<TMDBReleaseDateEntry[]> {
  const data = await tmdbFetch<TMDBReleaseDatesResponse>(`/movie/${movieId}/release_dates`);
  const match = data.results.find((r) => r.iso_3166_1 === region);
  return match?.release_dates ?? [];
}

/**
 * Get the genre map (id -> name).
 * This rarely changes -- callers should cache the result.
 */
export async function getGenreMap(): Promise<Map<number, string>> {
  const data = await tmdbFetch<TMDBGenreResponse>('/genre/movie/list');
  return new Map(data.genres.map((g) => [g.id, g.name]));
}

/** TMDB video object from /movie/{id}/videos. */
export interface TMDBVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  iso_639_1: string;
  published_at: string;
}

/** Detailed movie info from /movie/{id} with credits and videos appended. */
export interface TMDBMovieDetails {
  id: number;
  title: string;
  overview: string;
  runtime: number | null;
  popularity: number;
  poster_path: string | null;
  genres: TMDBGenre[];
  directors: string[];
  trailerUrl: string | null;
  trailerName: string | null;
  trailerPublishedAt: string | null;
}

interface TMDBCrewMember {
  job: string;
  name: string;
}

interface TMDBMovieDetailsResponse {
  id: number;
  title: string;
  overview: string;
  runtime: number | null;
  popularity: number;
  poster_path: string | null;
  genres: TMDBGenre[];
  credits?: {
    crew?: TMDBCrewMember[];
  };
  videos?: {
    results?: TMDBVideo[];
  };
}

/** Extracted trailer info from TMDB videos. */
export interface TrailerInfo {
  url: string;
  name: string;
  publishedAt: string;
}

/**
 * Pick the best official YouTube trailer from a list of TMDB videos.
 * Prefers "Trailer" over "Teaser", then most recently published.
 */
export function pickTrailer(videos: TMDBVideo[]): TrailerInfo | null {
  const trailers = videos
    .filter((v) => v.site === 'YouTube' && v.official && v.iso_639_1 === 'en')
    .filter((v) => v.type === 'Trailer' || v.type === 'Teaser')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'Trailer' ? -1 : 1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

  const best = trailers[0];
  if (!best) return null;
  return {
    url: `https://www.youtube.com/watch?v=${best.key}`,
    name: best.name,
    publishedAt: best.published_at,
  };
}

/**
 * Get detailed movie info including runtime, director(s), and trailer.
 * Uses append_to_response=credits,videos to get everything in a single call.
 */
export async function getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
  const data = await tmdbFetch<TMDBMovieDetailsResponse>(`/movie/${movieId}`, {
    append_to_response: 'credits,videos',
  });

  const directors = (data.credits?.crew ?? [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);

  const trailer = pickTrailer(data.videos?.results ?? []);

  return {
    id: data.id,
    title: data.title,
    overview: data.overview,
    runtime: data.runtime,
    popularity: data.popularity,
    poster_path: data.poster_path,
    genres: data.genres,
    directors,
    trailerUrl: trailer?.url ?? null,
    trailerName: trailer?.name ?? null,
    trailerPublishedAt: trailer?.publishedAt ?? null,
  };
}

/** Format runtime as "Xh Ym". */
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface TMDBWatchProvidersResponse {
  id: number;
  results: Record<string, { link?: string } | undefined>;
}

/**
 * Get the JustWatch URL for a movie in a given region.
 * TMDB's watch/providers data is sourced from JustWatch; the link field
 * points directly to the movie's JustWatch page.
 * Returns null if no watch provider data exists for the region.
 */
export async function getWatchProviderLink(movieId: number, region = 'US'): Promise<string | null> {
  const data = await tmdbFetch<TMDBWatchProvidersResponse>(`/movie/${movieId}/watch/providers`);
  return data.results[region]?.link ?? null;
}

// AP-style month abbreviations: short months get a period, long ones don't.
const AP_MONTHS = [
  'Jan.', 'Feb.', 'March', 'April', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
];

/** Format a date string (YYYY-MM-DD) as AP-style "Mon. D" (e.g. "Jan. 10", "April 1"). */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${AP_MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

/** Format a Date as YYYY-MM-DD for TMDB API params. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get the date range for "opening this weekend" based on a reference date.
 * Returns Thursday through next Wednesday (7-day window).
 */
export function getTheatricalDateRange(referenceDate: Date = new Date()): { gte: string; lte: string } {
  const d = new Date(referenceDate);
  // Find this Thursday (day 4)
  const day = d.getDay();
  const diffToThursday = (4 - day + 7) % 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + diffToThursday);

  const nextWednesday = new Date(thursday);
  nextWednesday.setDate(thursday.getDate() + 6);

  return {
    gte: formatDate(thursday),
    lte: formatDate(nextWednesday),
  };
}

/** Extract the YouTube video key from a YouTube watch URL. */
export function youtubeKeyFromUrl(url: string): string | null {
  const match = url.match(/[?&]v=([^&]+)/);
  return match?.[1] ?? null;
}

/**
 * Get the thumbnail URL for a YouTube video.
 * Uses hqdefault which is always available (480x360).
 */
export function youtubeThumbnailUrl(youtubeKey: string): string {
  return `https://i.ytimg.com/vi/${youtubeKey}/hqdefault.jpg`;
}

/**
 * Discover upcoming movies to scan for new trailers.
 * Targets movies releasing in the next 3 months (active marketing window)
 * across multiple pages to cast a wider net. The trailer publish-date
 * recency check in trailers.ts controls what actually gets posted.
 */
export async function discoverForTrailers(
  region = 'US',
  referenceDate: Date = new Date(),
  pages = 3,
): Promise<TMDBMovie[]> {
  const gte = formatDate(referenceDate);
  const end = new Date(referenceDate);
  end.setMonth(end.getMonth() + 3);
  const lte = formatDate(end);

  const results: TMDBMovie[] = [];
  for (let page = 1; page <= pages; page++) {
    const data = await tmdbFetch<TMDBDiscoverResponse>('/discover/movie', {
      region,
      with_release_type: String(ReleaseType.THEATRICAL),
      'primary_release_date.gte': gte,
      'primary_release_date.lte': lte,
      sort_by: 'popularity.desc',
      page: String(page),
    });
    results.push(...data.results);
    if (page >= data.total_pages) break;
  }
  return results;
}
