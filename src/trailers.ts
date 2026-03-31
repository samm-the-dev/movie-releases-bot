/**
 * New trailer discovery and post formatting.
 *
 * Scans popular movies for trailers published in the past 7 days.
 * Posts a summary thread with YouTube link cards.
 * Runs on Wednesdays via GitHub Actions.
 */
import type { TMDBMovieDetails } from './tmdb.js';
import {
  discoverForTrailers,
  formatRuntime,
  formatShortDate,
  getMovieDetails,
  getTheatricalDateRange,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max trailers to post per run. */
const MAX_TRAILERS = 8;

/** Max detail fetches per run to stay within TMDB rate limits (40 req/10s). */
const MAX_DETAIL_FETCHES = 20;

/** Minimum TMDB popularity to filter noise. */
const MIN_POPULARITY = 15;

/** A movie with a recently-dropped trailer. */
export interface TrailerEntry {
  details: TMDBMovieDetails;
  trailerUrl: string;
  trailerName: string;
  releaseDate: string;
}

import type { ThreadResult } from './post-helpers.js';

export type TrailerResult = ThreadResult;


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
 * Discover popular movies with trailers published in the past 7 days.
 * Movies may already be released; selection is based on popularity and recent trailers.
 */
export async function getNewTrailers(
  state: TrackingState,
  referenceDate?: Date,
): Promise<TrailerResult | null> {
  const now = referenceDate ?? new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - 7);

  const movies = await discoverForTrailers('US', now);

  // Skip movies opening in tomorrow's theatrical window to avoid overlap
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const theatrical = getTheatricalDateRange(tomorrow);

  // Filter: not already posted, above popularity threshold, not in next theatrical window
  const candidates = movies
    .filter((m) => !isTracked(state, `trailer-${m.id}`))
    .filter((m) => m.popularity >= MIN_POPULARITY)
    .filter((m) => m.release_date < theatrical.gte || m.release_date > theatrical.lte);

  // Check each candidate for a recently-published trailer
  const entries: TrailerEntry[] = [];
  let detailFetches = 0;
  for (const movie of candidates) {
    if (entries.length >= MAX_TRAILERS) break;
    if (detailFetches >= MAX_DETAIL_FETCHES) break;

    detailFetches++;
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
  const rangeStart = formatShortDate(cutoffDate.toISOString().slice(0, 10));
  const rangeEnd = formatShortDate(now.toISOString().slice(0, 10));
  const header = `▶️ New Trailers This Week (${rangeStart} – ${rangeEnd})`;
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
    albumPosters: [],
    moviePosters: entries.map(() => null),
  };
}
