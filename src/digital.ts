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
  formatShortDate,
  getMovieDetails,
  getReleaseDates,
  getWatchProviderLink,
  ReleaseType,
} from './tmdb.js';
import { formatBulletList } from '../.toolbox/lib/bluesky/format.js';
import { isTracked } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

/** Max movies to include. */
const MAX_MOVIES_DISPLAY = 10;

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
  justWatchLink: string | null;
  trailerUrl: string | null;
}

export interface DigitalResult {
  summaryPosts: string[];
  moviePosts: string[];
  movieIds: number[];
  movieTitles: string[];
  trailerNames: string[];
  albumPosters: PosterImage[];
  moviePosters: (PosterImage | null)[];
  trailerUrls: (string | null)[];
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
 * Fetch US release dates once and return both theatrical and digital dates.
 * Avoids calling /release_dates twice per candidate.
 */
async function getReleaseDatePair(movieId: number): Promise<{ theatricalDate: string | null; digitalDate: string | null }> {
  const releases = await getReleaseDates(movieId, 'US');
  const theatrical = releases.find((r) => r.type === ReleaseType.THEATRICAL);
  const digital = releases.find((r) => r.type === ReleaseType.DIGITAL);
  return {
    theatricalDate: theatrical?.release_date?.slice(0, 10) ?? null,
    digitalDate: digital?.release_date?.slice(0, 10) ?? null,
  };
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


/** Format a per-movie detail post for a digital release. */
export function formatDigitalDetail(release: DigitalRelease): string {
  const { details, theatricalDate, digitalDate, justWatchLink } = release;
  const genres = details.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join('/');
  const runtime = formatRuntime(details.runtime);

  const parts = [genres, runtime].filter(Boolean);
  const metaLine = parts.length > 0 ? parts.join(' · ') : '';

  const lines = [details.title];
  if (metaLine) lines.push(metaLine);
  if (details.directors.length > 0) {
    lines.push(`Dir. ${details.directors.join(', ')}`);
  }

  // Theatrical -> Digital date window
  if (theatricalDate && digitalDate) {
    lines.push(`Theatrical ${formatShortDate(theatricalDate)} → Digital ${formatShortDate(digitalDate)}`);
  } else if (digitalDate) {
    lines.push(`Digital ${formatShortDate(digitalDate)}`);
  }

  lines.push(justWatchLink ?? `https://www.themoviedb.org/movie/${details.id}`);
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

    const { theatricalDate, digitalDate } = await getReleaseDatePair(movie.id);
    if (!theatricalDate) continue; // Skip films without theatrical history
    if (!digitalDate) continue; // Skip stale TMDB entries missing a digital date (don't count toward limit)

    const [details, poster, justWatchLink] = await Promise.all([
      getMovieDetails(movie.id),
      fetchPoster(movie.title, movie.poster_path),
      getWatchProviderLink(movie.id),
    ]);

    releases.push({ details, theatricalDate, digitalDate, poster, justWatchLink, trailerUrl: details.trailerUrl });
  }

  if (releases.length === 0) return null;

  // Every result came from a digital-release discover query so digitalDate should
  // always be present; drop any stale TMDB entries where it's missing.
  const dated = releases.filter((r): r is DigitalRelease & { digitalDate: string } => r.digitalDate !== null);
  if (dated.length === 0) return null;

  // Most recent digital release first
  dated.sort((a, b) => b.digitalDate.localeCompare(a.digitalDate));

  // Summary post
  const lines = dated.map((r) => r.details.title);
  const header = `▶️ Now on Digital (${formatWeekDate(referenceDate)})`;
  const footer = `#NowOnDigital #Movies #Filmsky`;
  const summaryParts = formatBulletList(header, lines, footer);

  // Per-movie posts
  const moviePosts = dated.map((r) => formatDigitalDetail(r));

  // Posters
  const albumPosters = dated
    .map((r) => r.poster)
    .filter((p): p is PosterImage => p !== null);

  const moviePosters = dated.map((r) => r.poster);

  const movieTitles = dated.map((r) => r.details.title);
  const trailerUrls = dated.map((r) => r.trailerUrl);
  const trailerNames = dated.map((r) => r.details.trailerName ?? 'Official Trailer');

  return {
    summaryPosts: summaryParts,
    moviePosts,
    movieIds: dated.map((r) => r.details.id),
    movieTitles,
    trailerNames,
    albumPosters,
    moviePosters,
    trailerUrls,
  };
}
