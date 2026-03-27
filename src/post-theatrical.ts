/**
 * Entry point for the theatrical releases GHA job.
 *
 * Posts a summary with poster album, then per-movie reply threads
 * with individual posters, runtime, and director info.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import { getTheatricalReleases, type PosterImage } from './theatrical.js';
import { youtubeKeyFromUrl, youtubeThumbnailUrl } from './tmdb.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_theatrical.json';
const DRY_RUN = process.env.DRY_RUN === '1';
const IGNORE_SEEN = process.env.IGNORE_SEEN === '1';

/**
 * Upload poster images and return the blob refs for embedding.
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
 * Returns null if the fetch or upload fails.
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
 * Post text with optional image embed. Returns uri/cid.
 */
async function postWithImages(
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
 * Falls back to image embed if thumbnail upload fails.
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

  // Try to create a YouTube link card embed
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

  // Fall back to poster image if trailer embed failed
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

  const result = await getTheatricalReleases(IGNORE_SEEN ? {} : state);

  if (!result) {
    console.log('No new theatrical releases to post.');
    return;
  }

  console.log(`Found ${result.moviePosts.length} movies to announce.`);
  console.log(`Fetched ${result.albumPosters.length} album posters.`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Summary post:\n---');
    console.log(result.summaryPost);
    console.log('---');
    if (result.albumPosters.length > 0) {
      console.log(`Album: ${result.albumPosters.length} poster(s)`);
      for (const p of result.albumPosters) {
        console.log(`  ${p.alt} (${(p.data.length / 1024).toFixed(0)} KB)`);
      }
    }
    console.log('\n[DRY RUN] Movie detail replies:');
    for (let i = 0; i < result.moviePosts.length; i++) {
      console.log(`\n--- Reply ${i + 1} ---`);
      console.log(result.moviePosts[i]);
      const trailer = result.trailerUrls[i];
      if (trailer) {
        console.log(`Trailer: ${trailer}`);
      }
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

  // Post summary with poster album
  const summaryResult = await postWithImages(agent, result.summaryPost, result.albumPosters);
  console.log(`Summary posted: ${summaryResult.uri}`);

  // Post per-movie replies — trailer link card when available, poster fallback
  let parent = summaryResult;
  for (let i = 0; i < result.moviePosts.length; i++) {
    const trailerUrl = result.trailerUrls[i];
    const moviePoster = result.moviePosters[i];

    let replyResult: { uri: string; cid: string };
    if (trailerUrl) {
      // Extract movie title from the post text (first line)
      const movieTitle = result.moviePosts[i].split('\n')[0];
      replyResult = await postWithTrailer(
        agent,
        result.moviePosts[i],
        trailerUrl,
        movieTitle,
        moviePoster,
        parent,
        summaryResult,
      );
    } else {
      const posters = moviePoster ? [moviePoster] : [];
      replyResult = await postWithImages(
        agent,
        result.moviePosts[i],
        posters,
        parent,
        summaryResult,
      );
    }
    parent = replyResult;
    console.log(`  Reply ${i + 1}: ${replyResult.uri}`);
  }

  // Update tracking state
  for (const movieId of result.movieIds) {
    state = track(state, String(movieId), { uri: null, cid: null });
  }
  saveState(STATE_FILE, state);
  console.log(`Tracking state updated (${result.movieIds.length} movies added).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
