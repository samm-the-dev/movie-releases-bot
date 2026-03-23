/**
 * Theatrical release discovery and post formatting.
 *
 * Queries TMDB for movies opening this weekend, filters against
 * already-posted state, and formats a Bluesky post.
 */
import type { TMDBMovie } from './tmdb.js';
import {
  discoverByReleaseType,
  getGenreMap,
  getTheatricalDateRange,
  ReleaseType,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max movies to include before threading. */
const MAX_MOVIES_DISPLAY = 15;

/** Minimum TMDB popularity score to include (filters micro-releases). */
const MIN_POPULARITY = 10;

/**
 * Format a short genre string from genre IDs.
 * Returns first 2 genres joined by "/".
 */
function formatGenres(genreIds: number[], genreMap: Map<number, string>): string {
  const names = genreIds
    .slice(0, 2)
    .map((id) => genreMap.get(id))
    .filter(Boolean);
  return names.length > 0 ? names.join('/') : '';
}

/**
 * Truncate a movie overview to a target length.
 * Cuts at sentence or word boundary.
 */
function truncateOverview(overview: string, maxLength: number): string {
  if (overview.length <= maxLength) return overview;

  // Try to cut at a sentence boundary
  const truncated = overview.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxLength * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + '\u2026';
  }

  return truncated + '\u2026';
}

/** Format a single movie line for the bullet list. */
export function formatMovieLine(movie: TMDBMovie, genreMap: Map<number, string>): string {
  const genres = formatGenres(movie.genre_ids, genreMap);
  const genreSuffix = genres ? ` (${genres})` : '';

  // Aim for ~60 chars per line to fit ~4-5 movies in 300 chars
  const maxOverview = 50 - movie.title.length;
  if (maxOverview > 15 && movie.overview) {
    const snippet = truncateOverview(movie.overview, maxOverview);
    return `${movie.title} \u2014 ${snippet}${genreSuffix}`;
  }

  return `${movie.title}${genreSuffix}`;
}

/** Format the weekend date for the header. */
function formatWeekendDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export interface TheatricalResult {
  /** Post texts (length > 1 means thread). */
  posts: string[];
  /** TMDB IDs of movies included in the posts. */
  movieIds: number[];
  /** Movies that were discovered. */
  movies: TMDBMovie[];
}

/**
 * Discover and format theatrical releases for this weekend.
 *
 * Returns formatted post text(s) and the movie IDs for tracking.
 * Filters out already-posted movies and low-popularity titles.
 */
export async function getTheatricalReleases(
  state: TrackingState,
  referenceDate?: Date,
): Promise<TheatricalResult | null> {
  const { gte, lte } = getTheatricalDateRange(referenceDate);

  const movies = await discoverByReleaseType(ReleaseType.THEATRICAL, gte, lte);

  // Filter: not already posted, above popularity threshold
  const newMovies = movies
    .filter((m) => !isTracked(state, String(m.id)))
    .filter((m) => m.popularity >= MIN_POPULARITY)
    .slice(0, MAX_MOVIES_DISPLAY);

  if (newMovies.length === 0) return null;

  const genreMap = await getGenreMap();
  const lines = newMovies.map((m) => formatMovieLine(m, genreMap));

  const header = `\uD83C\uDFAC Opening This Weekend (${formatWeekendDate(gte)})`;
  const footer = 'What are you seeing? \uD83C\uDF7F';

  const posts = formatBulletList(header, lines, footer);

  return {
    posts,
    movieIds: newMovies.map((m) => m.id),
    movies: newMovies,
  };
}
