/**
 * Theatrical release discovery and post formatting.
 *
 * Queries TMDB for movies opening this weekend, fetches details
 * (runtime, director), and formats a Bluesky thread: summary post
 * with poster album + per-movie reply posts with individual posters.
 */
import type { TMDBMovie, TMDBMovieDetails } from './tmdb.js';
import {
  discoverByReleaseType,
  getGenreMap,
  getMovieDetails,
  getTheatricalDateRange,
  formatRuntime,
  ReleaseType,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max movies to include before threading. */
const MAX_MOVIES_DISPLAY = 15;

/** Max poster images per post (Bluesky limit). */
const MAX_ALBUM_IMAGES = 4;

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

/** Format genre string from TMDBMovieDetails (which has full genre objects). */
function formatDetailGenres(details: TMDBMovieDetails): string {
  return details.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join('/');
}

/** Format a single movie line for the summary bullet list. Date: title. */
export function formatMovieLine(movie: TMDBMovie): string {
  return `${formatShortDate(movie.release_date)}: ${movie.title}`;
}

/**
 * Format a focused per-movie post with rich details.
 * Includes title, genre, runtime, director(s), and opening date.
 */
export function formatMovieDetail(details: TMDBMovieDetails, releaseDate?: string | null): string {
  const genres = formatDetailGenres(details);
  const runtime = formatRuntime(details.runtime);
  const dateStr = releaseDate ? formatShortDate(releaseDate) : null;

  const parts = [dateStr, genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' \u2022 ') : '';

  const lines = [details.title];
  if (metaLine) lines.push(metaLine);
  if (details.directors.length > 0) {
    lines.push(`Dir. ${details.directors.join(', ')}`);
  }
  lines.push(`https://www.themoviedb.org/movie/${details.id}`);

  return lines.join('\n');
}

/** Format a date string (YYYY-MM-DD) as "Mon. D" (e.g. "Apr. 1"). */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return s.replace(/^(\w+) /, '$1. ');
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

/** A movie with its fetched details and poster. */
export interface EnrichedMovie {
  movie: TMDBMovie;
  details: TMDBMovieDetails;
  poster: PosterImage | null;
}

export interface TheatricalResult {
  /** Summary post text (with bullet list). */
  summaryPost: string;
  /** Per-movie detail post texts. */
  moviePosts: string[];
  /** TMDB IDs of movies included in the posts. */
  movieIds: number[];
  /** Poster album for the summary post (up to 4). */
  albumPosters: PosterImage[];
  /** Individual posters for per-movie reply posts. */
  moviePosters: (PosterImage | null)[];
}

/**
 * Fetch a movie poster from TMDB's image CDN.
 * Returns null if the movie has no poster or the fetch fails.
 */
async function fetchPoster(title: string, posterPath: string | null, altSuffix: string): Promise<PosterImage | null> {
  if (!posterPath) return null;

  try {
    const url = `${TMDB_IMAGE_BASE}${posterPath}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: 'image/jpeg',
      alt: `Movie poster for ${title}${altSuffix ? ` (${altSuffix})` : ''}`,
    };
  } catch {
    return null;
  }
}

/**
 * Discover and format theatrical releases for this weekend.
 *
 * Returns a summary post with poster album, plus per-movie detail
 * posts with individual posters for threading.
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
    .slice(0, MAX_MOVIES_DISPLAY)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));

  if (newMovies.length === 0) return null;

  // Fetch details and posters in parallel
  const genreMap = await getGenreMap();

  const enriched: EnrichedMovie[] = await Promise.all(
    newMovies.map(async (movie) => {
      const [details, poster] = await Promise.all([
        getMovieDetails(movie.id),
        fetchPoster(movie.title, movie.poster_path, formatGenres(movie.genre_ids, genreMap)),
      ]);
      return { movie, details, poster };
    }),
  );

  // Summary post with bullet list + hashtags
  const lines = newMovies.map((m) => formatMovieLine(m));
  const header = `📽️ Opening This Week (${formatShortDate(gte)}–${formatShortDate(lte)})`;
  const footer = `#NowPlaying #Movies #Filmsky`;

  const summaryParts = formatBulletList(header, lines, footer);
  const summaryPost = summaryParts[0]; // Use first chunk; overflow rare with title-only lines

  // Per-movie detail posts
  const moviePosts = enriched.map((e) => formatMovieDetail(e.details, e.movie.release_date));

  // Album posters (up to 4 for summary)
  const albumPosters = enriched
    .map((e) => e.poster)
    .filter((p): p is PosterImage => p !== null)
    .slice(0, MAX_ALBUM_IMAGES);

  // Individual posters for replies
  const moviePosters = enriched.map((e) => e.poster);

  return {
    summaryPost,
    moviePosts,
    movieIds: newMovies.map((m) => m.id),
    albumPosters,
    moviePosters,
  };
}
