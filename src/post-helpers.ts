/**
 * Shared Bluesky posting helpers for image and trailer embeds.
 *
 * Used by post-theatrical.ts, post-digital.ts, and post-trailers.ts
 * to avoid duplicating upload and embed logic.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import type { External } from '@atproto/api/dist/client/types/app/bsky/embed/external.js';
import { youtubeKeyFromUrl, youtubeThumbnailUrl } from './tmdb.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';
import { createCollage, COLLAGE_THRESHOLD } from './collage.js';

/** A poster image to upload to Bluesky. */
export interface PosterImage {
  data: Uint8Array;
  mimeType: string;
  alt: string;
}

/**
 * Upload poster images and return the blob refs for embedding.
 */
export async function uploadImages(
  agent: AtpAgent,
  posters: PosterImage[],
): Promise<Array<{ alt: string; image: unknown }>> {
  const images = [];
  for (const poster of posters) {
    const response = await agent.uploadBlob(poster.data, {
      encoding: poster.mimeType,
    });
    images.push({
      alt: poster.alt,
      image: response.data.blob,
    });
  }
  return images;
}

/**
 * Fetch a YouTube thumbnail and upload it as a Bluesky blob.
 * Returns null if the fetch or upload fails.
 */
export async function uploadYouTubeThumbnail(
  agent: AtpAgent,
  youtubeKey: string,
): Promise<unknown | null> {
  try {
    const url = youtubeThumbnailUrl(youtubeKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const blobResponse = await agent.uploadBlob(new Uint8Array(buffer), {
      encoding: 'image/jpeg',
    });
    return blobResponse.data.blob;
  } catch {
    return null;
  }
}

/**
 * Post text with optional image embed. Returns uri/cid.
 */
export async function postWithImages(
  agent: AtpAgent,
  text: string,
  posters: PosterImage[],
  replyTo?: { uri: string; cid: string },
  root?: { uri: string; cid: string },
): Promise<{ uri: string; cid: string }> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  const postParams: Parameters<typeof agent.post>[0] = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  if (posters.length > 0) {
    const images = await uploadImages(agent, posters);
    postParams.embed = {
      $type: 'app.bsky.embed.images',
      images: images as typeof postParams.embed extends { images: infer I } ? I : never,
    } as typeof postParams.embed;
  }

  if (replyTo) {
    postParams.reply = {
      root: root ?? replyTo,
      parent: replyTo,
    };
  }

  const response = await agent.post(postParams);
  return { uri: response.uri, cid: response.cid };
}

/**
 * Post text with a YouTube trailer link card embed.
 * Uses the actual trailer name from TMDB for the link card title.
 * Posts the link card without a thumbnail if upload fails.
 * Falls back to image embed only when no YouTube URL is available.
 */
export async function postWithTrailer(
  agent: AtpAgent,
  text: string,
  trailerUrl: string,
  movieTitle: string,
  trailerName: string,
  fallbackPoster: PosterImage | null,
  replyTo?: { uri: string; cid: string },
  root?: { uri: string; cid: string },
): Promise<{ uri: string; cid: string }> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  const postParams: Parameters<typeof agent.post>[0] = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  const ytKey = youtubeKeyFromUrl(trailerUrl);
  let usedTrailer = false;
  if (ytKey) {
    const thumb = await uploadYouTubeThumbnail(agent, ytKey);
    const external: External = {
      uri: trailerUrl,
      title: `${movieTitle} — ${trailerName}`,
      description: '',
      ...(thumb ? { thumb: thumb as External['thumb'] } : {}),
    };
    postParams.embed = {
      $type: 'app.bsky.embed.external',
      external,
    } as typeof postParams.embed;
    usedTrailer = true;
  }

  if (!usedTrailer && fallbackPoster) {
    const images = await uploadImages(agent, [fallbackPoster]);
    postParams.embed = {
      $type: 'app.bsky.embed.images',
      images: images as typeof postParams.embed extends { images: infer I } ? I : never,
    } as typeof postParams.embed;
  }

  if (replyTo) {
    postParams.reply = {
      root: root ?? replyTo,
      parent: replyTo,
    };
  }

  const response = await agent.post(postParams);
  return { uri: response.uri, cid: response.cid };
}

/** Common shape returned by all discovery functions. */
export interface ThreadResult {
  /** Summary post(s) — multiple when the bullet list overflows 300 chars. */
  summaryPosts: string[];
  moviePosts: string[];
  movieIds: number[];
  movieTitles: string[];
  trailerUrls: (string | null)[];
  trailerNames: string[];
  albumPosters: PosterImage[];
  moviePosters: (PosterImage | null)[];
}

/** Options for {@link runJob}. */
export interface JobOptions {
  /** Path to the seen-state JSON file. */
  stateFile: string;
  /** Label for log messages (e.g. "theatrical releases", "digital releases", "new trailers"). */
  label: string;
  /** Transform a TMDB movie ID into the tracking key. Default: `String(id)`. */
  trackingKey?: (id: number) => string;
  /** Discovery function — receives current state, returns thread or null. */
  discover: (state: TrackingState) => Promise<ThreadResult | null>;
}

/**
 * Post a thread: summary with optional album, then per-movie replies.
 * Returns the Bluesky refs for each reply post.
 */
export async function postThread(
  agent: AtpAgent,
  result: ThreadResult,
): Promise<Array<{ uri: string; cid: string }>> {
  // Post summary post(s) — first gets the album (or collage for 5+), overflow parts are text-only
  if (result.summaryPosts.length === 0) {
    throw new Error('summaryPosts must not be empty.');
  }

  // Build the summary image(s): collage for 5+ posters, native album for 1-4
  let summaryImages: PosterImage[] = result.albumPosters;
  if (result.albumPosters.length >= COLLAGE_THRESHOLD) {
    try {
      const collage = await createCollage(result.albumPosters);
      summaryImages = [collage];
      console.log(`Created poster collage (${result.albumPosters.length} posters).`);
    } catch (error) {
      console.error('Collage creation failed, falling back to album:', error);
      // Fall back to first 4 posters (Bluesky album limit)
      summaryImages = result.albumPosters.slice(0, 4);
    }
  }

  let rootRef: { uri: string; cid: string } | undefined;
  let parent: { uri: string; cid: string } | undefined;
  for (let s = 0; s < result.summaryPosts.length; s++) {
    const text = result.summaryPosts[s];
    let ref: { uri: string; cid: string };
    if (s === 0 && summaryImages.length > 0) {
      ref = await postWithImages(agent, text, summaryImages, parent, rootRef);
    } else {
      ref = await postWithImages(agent, text, [], parent, rootRef);
    }
    if (!rootRef) rootRef = ref;
    parent = ref;
    console.log(`Summary ${s + 1}/${result.summaryPosts.length}: ${ref.uri}`);
  }
  const summaryRef = rootRef!;

  // Post per-movie replies
  const replyRefs: Array<{ uri: string; cid: string }> = [];
  let replyParent = parent ?? summaryRef;
  for (let i = 0; i < result.moviePosts.length; i++) {
    const trailerUrl = result.trailerUrls[i];
    const moviePoster = result.moviePosters[i];

    let replyResult: { uri: string; cid: string };
    if (trailerUrl) {
      replyResult = await postWithTrailer(
        agent,
        result.moviePosts[i],
        trailerUrl,
        result.movieTitles[i],
        result.trailerNames[i],
        moviePoster,
        replyParent,
        summaryRef,
      );
    } else {
      const posters = moviePoster ? [moviePoster] : [];
      replyResult = await postWithImages(
        agent,
        result.moviePosts[i],
        posters,
        replyParent,
        summaryRef,
      );
    }
    replyRefs.push(replyResult);
    replyParent = replyResult;
    console.log(`  Reply ${i + 1}: ${replyResult.uri}`);
  }

  return replyRefs;
}

/**
 * Standard job runner: load state, discover, dry-run or post, update state.
 */
export async function runJob(options: JobOptions): Promise<void> {
  const DRY_RUN = process.env.DRY_RUN === '1';
  const IGNORE_SEEN = process.env.IGNORE_SEEN === '1';
  const toKey = options.trackingKey ?? ((id: number) => String(id));

  let state = loadState(options.stateFile);
  const result = await options.discover(IGNORE_SEEN ? {} : state);

  if (!result) {
    console.log(`No new ${options.label} to post.`);
    return;
  }

  console.log(`Found ${result.moviePosts.length} ${options.label} to announce.`);
  if (result.albumPosters.length > 0) {
    console.log(`Fetched ${result.albumPosters.length} album posters.`);
  }

  if (DRY_RUN) {
    for (let s = 0; s < result.summaryPosts.length; s++) {
      const label = result.summaryPosts.length > 1 ? ` (${s + 1}/${result.summaryPosts.length})` : '';
      console.log(`\n[DRY RUN] Summary post${label}:\n---`);
      console.log(result.summaryPosts[s]);
      console.log('---');
    }
    if (result.albumPosters.length > 0) {
      const mode = result.albumPosters.length >= COLLAGE_THRESHOLD ? 'Collage' : 'Album';
      console.log(`${mode}: ${result.albumPosters.length} poster(s)`);
      for (const p of result.albumPosters) {
        console.log(`  ${p.alt} (${(p.data.length / 1024).toFixed(0)} KB)`);
      }
    }
    console.log(`\n[DRY RUN] Detail replies:`);
    for (let i = 0; i < result.moviePosts.length; i++) {
      console.log(`\n--- Reply ${i + 1} ---`);
      console.log(result.moviePosts[i]);
      const trailer = result.trailerUrls[i];
      if (trailer) console.log(`Trailer: ${trailer}`);
      const poster = result.moviePosters[i];
      if (poster && !trailer) {
        console.log(`Poster (fallback): ${poster.alt} (${(poster.data.length / 1024).toFixed(0)} KB)`);
      }
      console.log('---');
    }
    return;
  }

  const credentials = credentialsFromEnv();
  const agent = await createClient(credentials);
  const replyRefs = await postThread(agent, result);

  // Update tracking state
  if (!IGNORE_SEEN) {
    if (replyRefs.length !== result.movieIds.length) {
      throw new Error(
        `Invariant violation: replyRefs length (${replyRefs.length}) does not match movieIds length (${result.movieIds.length}).`,
      );
    }
    for (let i = 0; i < result.movieIds.length; i++) {
      state = track(state, toKey(result.movieIds[i]), replyRefs[i]);
    }
    saveState(options.stateFile, state);
    console.log(`Tracking state updated (${result.movieIds.length} ${options.label} added).`);
  } else {
    console.log('IGNORE_SEEN: skipped state update.');
  }
}
