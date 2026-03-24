/**
 * Digital release discovery and post formatting.
 *
 * Queries TMDB for films that recently hit digital/VOD in the US,
 * filters to those that had a prior theatrical run, and formats
 * a Bluesky thread: summary post with poster album + per-movie
 * replies with details.
 */
import type { TMDBMovie, TMDBMovieDetails } from './tmdb.js';
import {
  discoverByReleaseType,
  formatDate,
  formatRuntime,
  getMovieDetails,
  getReleaseDates,
  ReleaseType,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max movies to include. */
const MAX_MOVIES_DISPLAY = 10;

/** Max poster images per post (Bluesky limit). */
const MAX_ALBUM_IMAGES = 4;

/** Minimum TMDB popularity to filter out obscure straight-to-VOD titles. */
const MIN_POPULARITY = 20;

/** TMDB image base URL. */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

/** A poster image to upload to Bluesky. */
export interface PosterImage {
  data: Uint8Array;
  mimeType: string;
  alt: string;
}

/** A digital release with its theatrical context. */
export interface DigitalRelease {
  details: TMDBMovieDetails;
  theatricalDate: string | null;
  digitalDate: string | null;
  poster: PosterImage | null;
}

export interface DigitalResult {
  summaryPost: string;
  moviePosts: string[];
  movieIds: number[];
  albumPosters: PosterImage[];
  moviePosters: (PosterImage | null)[];
}

/**
 * Get the date range for "past 7 days" digital releases.
 */
function getDigitalDateRange(referenceDate: Date = new Date()): { gte: string; lte: string } {
  const lte = new Date(referenceDate);
  const gte = new Date(referenceDate);
  gte.setDate(gte.getDate() - 7);
  return { gte: formatDate(gte), lte: formatDate(lte) };
}

/**
 * Check if a movie had a US theatrical release (type 2 or 3).
 * Returns the theatrical release date if found, null otherwise.
 */
async function getTheatricalDate(movieId: number): Promise<string | null> {
  const releases = await getReleaseDates(movieId, 'US');
  const theatrical = releases.find(
    (r) => r.type === ReleaseType.THEATRICAL,
  );
  return theatrical?.release_date?.slice(0, 10) ?? null;
}

/**
 * Get the US digital release date for a movie.
 */
async function getDigitalDate(movieId: number): Promise<string | null> {
  const releases = await getReleaseDates(movieId, 'US');
  const digital = releases.find((r) => r.type === ReleaseType.DIGITAL);
  return digital?.release_date?.slice(0, 10) ?? null;
}

/** Fetch a poster image from TMDB. */
async function fetchPoster(title: string, posterPath: string | null): Promise<PosterImage | null> {
  if (!posterPath) return null;
  try {
    const url = `${TMDB_IMAGE_BASE}${posterPath}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: 'image/jpeg',
      alt: `Movie poster for ${title}`,
    };
  } catch {
    return null;
  }
}

/** Format a readable date like "Jan 10". */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Format a per-movie detail post for a digital release. */
export function formatDigitalDetail(release: DigitalRelease): string {
  const { details, theatricalDate, digitalDate } = release;
  const genres = details.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join('/');
  const runtime = formatRuntime(details.runtime);

  const parts = [genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' \u00B7 ') : '';

  const lines = [details.title];
  if (metaLine) lines.push(metaLine);
  if (details.directors.length > 0) {
    lines.push(`Dir. ${details.directors.join(', ')}`);
  }

  // Theatrical -> Digital date window
  if (theatricalDate && digitalDate) {
    lines.push(`Theatrical ${formatShortDate(theatricalDate)} \u2192 Digital ${formatShortDate(digitalDate)}`);
  } else if (digitalDate) {
    lines.push(`Digital ${formatShortDate(digitalDate)}`);
  }

  lines.push(`https://www.themoviedb.org/movie/${details.id}`);
  return lines.join('\n');
}

/** Format the summary date range. */
function formatWeekDate(referenceDate: Date = new Date()): string {
  return formatShortDate(formatDate(referenceDate));
}

/**
 * Discover digital releases from the past week that had a theatrical run.
 */
export async function getDigitalReleases(
  state: TrackingState,
  referenceDate?: Date,
): Promise<DigitalResult | null> {
  const { gte, lte } = getDigitalDateRange(referenceDate);

  const movies = await discoverByReleaseType(ReleaseType.DIGITAL, gte, lte);

  // Filter: not already posted, above popularity threshold
  const candidates = movies
    .filter((m) => !isTracked(state, String(m.id)))
    .filter((m) => m.popularity >= MIN_POPULARITY);

  // Check each candidate for a prior theatrical release
  const releases: DigitalRelease[] = [];
  for (const movie of candidates) {
    if (releases.length >= MAX_MOVIES_DISPLAY) break;

    const theatricalDate = await getTheatricalDate(movie.id);
    if (!theatricalDate) continue; // Skip films without theatrical history

    const [details, digitalDate, poster] = await Promise.all([
      getMovieDetails(movie.id),
      getDigitalDate(movie.id),
      fetchPoster(movie.title, movie.poster_path),
    ]);

    releases.push({ details, theatricalDate, digitalDate, poster });
  }

  if (releases.length === 0) return null;

  // Summary post
  const lines = releases.map((r) => r.details.title);
  const header = `📺 Now on Digital (${formatWeekDate(referenceDate)})`;
  const footer = `#NowOnDigital #Movies #Filmsky`;
  const summaryParts = formatBulletList(header, lines, footer);

  // Per-movie posts
  const moviePosts = releases.map((r) => formatDigitalDetail(r));

  // Posters
  const albumPosters = releases
    .map((r) => r.poster)
    .filter((p): p is PosterImage => p !== null)
    .slice(0, MAX_ALBUM_IMAGES);

  const moviePosters = releases.map((r) => r.poster);

  return {
    summaryPost: summaryParts[0],
    moviePosts,
    movieIds: releases.map((r) => r.details.id),
    albumPosters,
    moviePosters,
  };
}
