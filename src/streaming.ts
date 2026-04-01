/**
 * Streaming release discovery and post formatting.
 *
 * Queries the Streaming Availability API for movies newly added
 * to major US streaming services in the past week, enriches with
 * TMDB posters/trailers, and formats a Bluesky thread grouped
 * by service.
 */
import { getMovieDetails, formatRuntime, formatDate, formatShortDate } from './tmdb.js';
import { splitForThread } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';
import type { ThreadResult, PosterImage } from './post-helpers.js';
import {
  ALL_SERVICES,
  ServiceDisplayName,
  getNewStreamingMovies,
  type StreamingChange,
} from './streaming-availability.js';

/** Max movies to include across all services. */
const MAX_MOVIES_DISPLAY = 15;

/** Max poster images per post (Bluesky limit). */
const MAX_ALBUM_IMAGES = 4;

/** Minimum Streaming Availability API rating (0-100) to filter catalog noise. */
const MIN_RATING = 60;

/**
 * Minimum TMDB popularity for mid-rated movies.
 * Movies with rating >= MIN_RATING_NOTABLE bypass this check.
 * This filters out obscure catalog additions that have decent IMDB scores
 * but no real audience recognition (e.g. straight-to-Prime filler).
 */
const MIN_POPULARITY = 5;

/** Rating threshold above which popularity is ignored (genuinely well-rated). */
const MIN_RATING_NOTABLE = 75;

/** Max candidates to fetch TMDB details for (rate limit headroom). */
const MAX_DETAIL_FETCHES = 30;

/** TMDB image base URL. */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

/**
 * Check if a movie is notable enough to include.
 * Passes if: popularity is unknown (TMDB failed), popularity >= threshold,
 * or rating is high enough to bypass the popularity check.
 */
export function isNotable(popularity: number | null, rating: number): boolean {
  if (popularity === null) return true;
  return popularity >= MIN_POPULARITY || rating >= MIN_RATING_NOTABLE;
}

/** A streaming movie enriched with poster and trailer from TMDB. */
interface EnrichedStreamingMovie {
  change: StreamingChange;
  poster: PosterImage | null;
  trailerUrl: string | null;
  trailerName: string;
}

/**
 * Get the date range for "past 7 days" streaming additions.
 * Returns Unix timestamps for the Streaming Availability API.
 */
export function getStreamingDateRange(referenceDate: Date = new Date()): { from: number; to: number } {
  const to = Math.floor(referenceDate.getTime() / 1000);
  const from = Math.floor(new Date(referenceDate).setDate(referenceDate.getDate() - 7) / 1000);
  return { from, to };
}

/** Format a per-movie detail post for a streaming release. */
export function formatStreamingDetail(
  change: StreamingChange,
  streamingLink: string | null,
): string {
  const genres = change.genres.slice(0, 2).join('/');
  const runtime = formatRuntime(change.runtime);

  const parts = [genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' · ') : '';

  const lines = [change.title];
  if (metaLine) lines.push(metaLine);
  if (change.directors.length > 0) {
    lines.push(`Dir. ${change.directors.join(', ')}`);
  }
  lines.push(`▶ Watch on ${change.serviceName}`);
  lines.push(streamingLink ?? `https://www.themoviedb.org/movie/${change.tmdbId}`);
  return lines.join('\n');
}

/**
 * Group streaming changes by service, preserving display order.
 * Services with more movies sort first; ties break by canonical order.
 */
function groupByService(
  movies: EnrichedStreamingMovie[],
): Map<string, EnrichedStreamingMovie[]> {
  const groups = new Map<string, EnrichedStreamingMovie[]>();
  const serviceOrder = new Map<string, number>();
  ALL_SERVICES.forEach((svc, index) => {
    const name = ServiceDisplayName[svc];
    serviceOrder.set(name, index);
    const matches = movies.filter((m) => m.change.serviceName === name);
    if (matches.length > 0) groups.set(name, matches);
  });
  // Most movies first; ties break by canonical service order
  const sorted = [...groups.entries()].sort((a, b) => {
    const countDiff = b[1].length - a[1].length;
    if (countDiff !== 0) return countDiff;
    return (serviceOrder.get(a[0]) ?? 0) - (serviceOrder.get(b[0]) ?? 0);
  });
  return new Map(sorted);
}

/** Format the summary date range for the header. */
function formatWeekDate(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - 7);
  return `${formatShortDate(formatDate(d))} – ${formatShortDate(formatDate(referenceDate))}`;
}

/**
 * Discover streaming releases from the past week across Big 8 US services.
 */
export async function getStreamingReleases(
  state: TrackingState,
  referenceDate?: Date,
): Promise<ThreadResult | null> {
  const ref = referenceDate ?? new Date();
  const { from, to } = getStreamingDateRange(ref);

  // Fetch new additions from all services
  const changes = await getNewStreamingMovies(ALL_SERVICES, from, to);

  // Filter: has TMDB ID, not already posted, has meaningful metadata, meets rating threshold
  const candidates = changes
    .filter((c) => c.tmdbId !== null)
    .filter((c) => !isTracked(state, String(c.tmdbId)))
    .filter((c) => c.genres.length > 0 || c.runtime !== null)
    .filter((c) => (c.rating ?? 0) >= MIN_RATING);

  // Dedupe by TMDB ID (keep first occurrence = most recent service addition)
  const deduped: StreamingChange[] = [];
  const seenTmdb = new Set<number>();
  for (const c of candidates) {
    if (seenTmdb.has(c.tmdbId!)) continue;
    seenTmdb.add(c.tmdbId!);
    deduped.push(c);
  }

  // Sort by API rating (descending) so we fetch TMDB details for the most notable movies first
  deduped.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  // Cap candidate list before TMDB fetches
  const fetchCandidates = deduped.slice(0, MAX_DETAIL_FETCHES);
  if (fetchCandidates.length === 0) return null;

  // Enrich with TMDB details, posters, and trailers in parallel
  const enrichedAll = await Promise.all(
    fetchCandidates.map(async (change) => {
      let poster: PosterImage | null = null;
      let trailerUrl: string | null = null;
      let trailerName = 'Official Trailer';
      let popularity: number | null = null;
      try {
        const details = await getMovieDetails(change.tmdbId!);
        popularity = details.popularity;
        trailerUrl = details.trailerUrl;
        trailerName = details.trailerName ?? 'Official Trailer';
        if (details.poster_path) {
          const url = `${TMDB_IMAGE_BASE}${details.poster_path}`;
          const response = await fetch(url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            poster = {
              data: new Uint8Array(buffer),
              mimeType: 'image/jpeg',
              alt: `Movie poster for ${change.title}`,
            };
          }
        }
      } catch (error) {
        console.error('TMDB enrichment failed for streaming movie', { title: change.title, tmdbId: change.tmdbId }, error);
      }
      return { change, poster, trailerUrl, trailerName, popularity };
    }),
  );

  // Filter: notable = high rating OR recognizable (has audience).
  // Cuts obscure catalog filler that has decent IMDB scores but no recognition.
  // Unknown popularity (TMDB enrichment failed) passes — don't drop movies due to transient errors.
  const enriched: EnrichedStreamingMovie[] = enrichedAll
    .filter((m) => isNotable(m.popularity, m.change.rating ?? 0))
    .slice(0, MAX_MOVIES_DISPLAY);

  // Group by service for the summary
  const grouped = groupByService(enriched);

  // Build summary text grouped by service (service headers aren't bulleted)
  const sections: string[] = [];
  for (const [serviceName, movies] of grouped) {
    const titles = movies.map((m) => `• ${m.change.title}`);
    sections.push([`${serviceName}:`, ...titles].join('\n'));
  }

  const header = `▶️ New on Streaming (${formatWeekDate(ref)})`;
  const footer = '#NewOnStreaming #Movies #Filmsky';
  const fullText = [header, '', ...sections, '', footer].join('\n');
  const summaryPosts = splitForThread(fullText);

  // Flatten movies in service-grouped order for detail posts
  const ordered = [...grouped.values()].flat();

  const moviePosts = ordered.map((m) =>
    formatStreamingDetail(m.change, m.change.link),
  );
  const movieIds = ordered.map((m) => m.change.tmdbId!);
  const movieTitles = ordered.map((m) => m.change.title);
  const trailerUrls = ordered.map((m) => m.trailerUrl);
  const trailerNames = ordered.map((m) => m.trailerName);
  const albumPosters = ordered
    .map((m) => m.poster)
    .filter((p): p is PosterImage => p !== null)
    .slice(0, MAX_ALBUM_IMAGES);
  const moviePosters = ordered.map((m) => m.poster);

  return {
    summaryPosts,
    moviePosts,
    movieIds,
    movieTitles,
    trailerUrls,
    trailerNames,
    albumPosters,
    moviePosters,
  };
}
