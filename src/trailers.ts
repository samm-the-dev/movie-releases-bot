/**
 * New trailer discovery and post formatting.
 *
 * Scans popular movies for trailers published in the past 7 days.
 * Posts a summary thread with YouTube link cards.
 * Runs on Wednesdays via GitHub Actions.
 */
import type { TMDBMovie, TMDBMovieDetails } from './tmdb.js';
import {
  discoverForTrailers,
  formatRuntime,
  getMovieDetails,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max trailers to post per run. */
const MAX_TRAILERS = 8;

/** Minimum TMDB popularity to filter noise. */
const MIN_POPULARITY = 15;

/** A movie with a recently-dropped trailer. */
export interface TrailerEntry {
  details: TMDBMovieDetails;
  trailerUrl: string;
  trailerName: string;
  releaseDate: string;
}

export interface TrailerResult {
  /** Summary post text. */
  summaryPost: string;
  /** Per-movie detail post texts. */
  moviePosts: string[];
  /** TMDB IDs of movies included. */
  movieIds: number[];
  /** YouTube trailer URLs per movie. */
  trailerUrls: string[];
  /** Trailer names (e.g. "Official Trailer", "Final Trailer"). */
  trailerNames: string[];
  /** Movie titles for link card titles. */
  movieTitles: string[];
}

// AP-style month abbreviations
const AP_MONTHS = [
  'Jan.', 'Feb.', 'March', 'April', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
];

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${AP_MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

/** Format a per-movie detail post for a new trailer. */
export function formatTrailerDetail(entry: TrailerEntry): string {
  const { details, releaseDate } = entry;
  const genres = details.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join('/');
  const runtime = formatRuntime(details.runtime);

  const parts = [genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' \u00b7 ') : '';

  const lines = [details.title];
  if (metaLine) lines.push(metaLine);
  if (details.directors.length > 0) {
    lines.push(`Dir. ${details.directors.join(', ')}`);
  }
  lines.push(`In theaters ${formatShortDate(releaseDate)}`);

  return lines.join('\n');
}

/**
 * Discover upcoming movies with trailers published in the past 7 days.
 */
export async function getNewTrailers(
  state: TrackingState,
  referenceDate?: Date,
): Promise<TrailerResult | null> {
  const now = referenceDate ?? new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  const movies = await discoverForTrailers();

  // Filter: not already posted as a trailer, above popularity threshold
  const candidates = movies
    .filter((m) => !isTracked(state, `trailer-${m.id}`))
    .filter((m) => m.popularity >= MIN_POPULARITY);

  // Check each candidate for a recently-published trailer
  const entries: TrailerEntry[] = [];
  for (const movie of candidates) {
    if (entries.length >= MAX_TRAILERS) break;

    const details = await getMovieDetails(movie.id);
    if (!details.trailerUrl || !details.trailerPublishedAt) continue;

    // Only include trailers published within the lookback window
    if (new Date(details.trailerPublishedAt) < cutoffDate) continue;

    entries.push({
      details,
      trailerUrl: details.trailerUrl,
      trailerName: details.trailerName ?? 'Official Trailer',
      releaseDate: movie.release_date,
    });
  }

  if (entries.length === 0) return null;

  // Summary post
  const lines = entries.map((e) => e.details.title);
  const header = `🎬 New Trailers This Week`;
  const footer = `#MovieTrailers #Movies #Filmsky`;
  const summaryParts = formatBulletList(header, lines, footer);

  // Per-movie posts
  const moviePosts = entries.map((e) => formatTrailerDetail(e));

  return {
    summaryPost: summaryParts[0],
    moviePosts,
    movieIds: entries.map((e) => e.details.id),
    trailerUrls: entries.map((e) => e.trailerUrl),
    trailerNames: entries.map((e) => e.trailerName),
    movieTitles: entries.map((e) => e.details.title),
  };
}
