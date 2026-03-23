/**
 * Theatrical release discovery and post formatting.
 *
 * Queries TMDB for movies opening this weekend, filters against
 * already-posted state, and formats a Bluesky post with poster images.
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

/** Max poster images per post (Bluesky limit). */
const MAX_IMAGES = 4;

/** Minimum TMDB popularity score to include (filters micro-releases). */
const MIN_POPULARITY = 10;

/** TMDB image base URL. w500 is a good balance of quality and size. */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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

/** Format a single movie line for the bullet list. Title + genre only. */
export function formatMovieLine(movie: TMDBMovie, genreMap: Map<number, string>): string {
  const genres = formatGenres(movie.genre_ids, genreMap);
  return genres ? `${movie.title} (${genres})` : movie.title;
}

/** Format the weekend date for the header. */
function formatWeekendDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** A poster image to upload to Bluesky. */
export interface PosterImage {
  /** Raw image bytes. */
  data: Uint8Array;
  /** MIME type (always image/jpeg from TMDB). */
  mimeType: string;
  /** Alt text for accessibility. */
  alt: string;
}

export interface TheatricalResult {
  /** Post texts (length > 1 means thread). */
  posts: string[];
  /** TMDB IDs of movies included in the posts. */
  movieIds: number[];
  /** Movies that were discovered. */
  movies: TMDBMovie[];
  /** Poster images for the top movies (up to 4). */
  posters: PosterImage[];
}

/**
 * Fetch a movie poster from TMDB's image CDN.
 * Returns null if the movie has no poster or the fetch fails.
 */
async function fetchPoster(movie: TMDBMovie, genreMap: Map<number, string>): Promise<PosterImage | null> {
  if (!movie.poster_path) return null;

  try {
    const url = `${TMDB_IMAGE_BASE}${movie.poster_path}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const genres = formatGenres(movie.genre_ids, genreMap);
    const genreLabel = genres ? ` (${genres})` : '';

    return {
      data: new Uint8Array(buffer),
      mimeType: 'image/jpeg',
      alt: `Movie poster for ${movie.title}${genreLabel}`,
    };
  } catch {
    return null;
  }
}

/**
 * Discover and format theatrical releases for this weekend.
 *
 * Returns formatted post text(s), movie IDs for tracking,
 * and up to 4 poster images for the top movies.
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

  // Fetch posters for the top movies (up to 4, sorted by popularity)
  const posterCandidates = newMovies
    .filter((m) => m.poster_path)
    .slice(0, MAX_IMAGES);

  const posterResults = await Promise.all(
    posterCandidates.map((m) => fetchPoster(m, genreMap)),
  );
  const posters = posterResults.filter((p): p is PosterImage => p !== null);

  return {
    posts,
    movieIds: newMovies.map((m) => m.id),
    movies: newMovies,
    posters,
  };
}
