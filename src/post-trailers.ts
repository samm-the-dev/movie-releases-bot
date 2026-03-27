/**
 * Entry point for the new trailers GHA job (Wednesdays).
 *
 * Discovers upcoming movies with recently-published trailers
 * and posts a summary thread with YouTube link card embeds.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import { getNewTrailers, type PosterImage } from './trailers.js';
import { youtubeKeyFromUrl, youtubeThumbnailUrl } from './tmdb.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_trailers.json';
const DRY_RUN = process.env.DRY_RUN === '1';
const IGNORE_SEEN = process.env.IGNORE_SEEN === '1';

/**
 * Upload poster images and return blob refs.
 */
async function uploadImages(
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
 */
async function uploadYouTubeThumbnail(
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
 * Post text with a YouTube trailer link card embed.
 * Falls back to poster image if thumbnail upload fails.
 */
async function postWithTrailer(
  agent: AtpAgent,
  text: string,
  trailerUrl: string,
  movieTitle: string,
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
    if (thumb) {
      postParams.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: trailerUrl,
          title: `${movieTitle} — Official Trailer`,
          description: '',
          thumb,
        },
      } as typeof postParams.embed;
      usedTrailer = true;
    }
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

async function main(): Promise<void> {
  let state = loadState(STATE_FILE);

  const result = await getNewTrailers(IGNORE_SEEN ? {} : state);

  if (!result) {
    console.log('No new trailers to post.');
    return;
  }

  console.log(`Found ${result.moviePosts.length} new trailers to announce.`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Summary post:\n---');
    console.log(result.summaryPost);
    console.log('---');
    console.log('\n[DRY RUN] Trailer detail replies:');
    for (let i = 0; i < result.moviePosts.length; i++) {
      console.log(`\n--- Reply ${i + 1} ---`);
      console.log(result.moviePosts[i]);
      console.log(`Trailer: ${result.trailerUrls[i]}`);
      console.log('---');
    }
    return;
  }

  const credentials = credentialsFromEnv();
  const agent = await createClient(credentials);

  // Post summary (text-only, no album — trailers are the star here)
  const rt = new RichText({ text: result.summaryPost });
  await rt.detectFacets(agent);
  const summaryResult = await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });
  const summaryRef = { uri: summaryResult.uri, cid: summaryResult.cid };
  console.log(`Summary posted: ${summaryRef.uri}`);

  // Post per-movie trailer replies with YouTube link cards
  let parent = summaryRef;
  for (let i = 0; i < result.moviePosts.length; i++) {
    const replyResult = await postWithTrailer(
      agent,
      result.moviePosts[i],
      result.trailerUrls[i],
      result.movieTitles[i],
      result.moviePosters[i],
      parent,
      summaryRef,
    );
    parent = replyResult;
    console.log(`  Reply ${i + 1}: ${replyResult.uri}`);
  }

  // Update tracking state — key includes "trailer-" prefix to avoid
  // collision with theatrical/digital state files
  for (const movieId of result.movieIds) {
    state = track(state, `trailer-${movieId}`, { uri: null, cid: null });
  }
  saveState(STATE_FILE, state);
  console.log(`Tracking state updated (${result.movieIds.length} trailers added).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
