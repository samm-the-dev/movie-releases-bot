/**
 * Physical release discovery and post formatting.
 *
 * Queries TMDB for catalog titles that recently got physical media
 * releases (type 5) in the US. Filters to films whose primary release
 * is 2+ years old to surface restorations, remasters, and boutique
 * label releases rather than routine new-release Blu-ray drops.
 */
import type { TMDBMovieDetails } from './tmdb.js';
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

/** Max movies to include (higher for dry-run sampling). */
const MAX_MOVIES_DISPLAY = 20;

/** Max poster images per post (Bluesky limit). */
const MAX_ALBUM_IMAGES = 4;

/** Minimum years between primary release and physical release to qualify as "catalog". */
const CATALOG_CUTOFF_YEARS = 2;

/** TMDB image base URL. */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

/** A poster image to upload to Bluesky. */
export interface PosterImage {
  data: Uint8Array;
  mimeType: string;
  alt: string;
}

/** A physical release with its catalog context. */
export interface PhysicalRelease {
  details: TMDBMovieDetails;
  originalYear: number;
  physicalDate: string | null;
  poster: PosterImage | null;
}

export interface PhysicalResult {
  summaryPost: string;
  moviePosts: string[];
  movieIds: number[];
  albumPosters: PosterImage[];
  moviePosters: (PosterImage | null)[];
}

/**
 * Get the date range for physical release discovery.
 * Default: past 30 days (for dry-run sampling).
 */
export function getPhysicalDateRange(
  referenceDate: Date = new Date(),
  lookbackDays = 30,
): { gte: string; lte: string } {
  const lte = new Date(referenceDate);
  const gte = new Date(referenceDate);
  gte.setDate(gte.getDate() - lookbackDays);
  return { gte: formatDate(gte), lte: formatDate(lte) };
}

/**
 * Get the US physical release date for a movie.
 */
async function getPhysicalDate(movieId: number): Promise<string | null> {
  const releases = await getReleaseDates(movieId, 'US');
  const physical = releases.find((r) => r.type === ReleaseType.PHYSICAL);
  return physical?.release_date?.slice(0, 10) ?? null;
}

/**
 * Check if a movie is a catalog title (primary release_date is 2+ years
 * before the physical release window end date).
 */
function isCatalogTitle(releaseDate: string, windowEnd: string): boolean {
  const primary = new Date(releaseDate + 'T00:00:00Z');
  const cutoff = new Date(windowEnd + 'T00:00:00Z');
  cutoff.setFullYear(cutoff.getFullYear() - CATALOG_CUTOFF_YEARS);
  return primary <= cutoff;
}

/** Extract the year from a YYYY-MM-DD date string. */
function extractYear(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getFullYear();
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

/** Format a per-movie detail post for a physical release. */
export function formatPhysicalDetail(release: PhysicalRelease): string {
  const { details, originalYear, physicalDate } = release;
  const genres = details.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join('/');
  const runtime = formatRuntime(details.runtime);

  const parts = [genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' · ') : '';

  const lines = [`${details.title} (${originalYear})`];
  if (metaLine) lines.push(metaLine);
  if (details.directors.length > 0) {
    lines.push(`Dir. ${details.directors.join(', ')}`);
  }

  if (physicalDate) {
    lines.push(`Physical release ${formatShortDate(physicalDate)}`);
  }

  lines.push(`https://www.themoviedb.org/movie/${details.id}`);
  return lines.join('\n');
}

/**
 * Discover physical releases of catalog titles.
 */
export async function getPhysicalReleases(
  state: TrackingState,
  referenceDate?: Date,
  lookbackDays = 30,
): Promise<PhysicalResult | null> {
  const { gte, lte } = getPhysicalDateRange(referenceDate, lookbackDays);

  const movies = await discoverByReleaseType(ReleaseType.PHYSICAL, gte, lte);

  // Filter: not already tracked
  const candidates = movies.filter((m) => !isTracked(state, String(m.id)));

  // Check each candidate for the 2-year catalog cutoff
  const releases: PhysicalRelease[] = [];

  for (const movie of candidates) {
    if (releases.length >= MAX_MOVIES_DISPLAY) break;

    // Catalog filter: primary release_date must be 2+ years before window end
    if (!movie.release_date || !isCatalogTitle(movie.release_date, lte)) {
      continue;
    }

    const [details, physicalDate, poster] = await Promise.all([
      getMovieDetails(movie.id),
      getPhysicalDate(movie.id),
      fetchPoster(movie.title, movie.poster_path),
    ]);

    releases.push({
      details,
      originalYear: extractYear(movie.release_date),
      physicalDate,
      poster,
    });
  }

  if (releases.length === 0) return null;

  // Summary post
  const lines = releases.map(
    (r) => `${r.details.title} (${r.originalYear})`,
  );
  const header = `📀 New Physical Releases (catalog titles)`;
  const footer = `#PhysicalMedia #Movies #Filmsky`;
  const summaryParts = formatBulletList(header, lines, footer);

  // Per-movie posts
  const moviePosts = releases.map((r) => formatPhysicalDetail(r));

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
