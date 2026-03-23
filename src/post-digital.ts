/**
 * Entry point for the digital releases GHA job.
 *
 * Discovers films that recently hit digital/VOD after a theatrical run,
 * posts a summary with poster album + per-movie reply thread.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import { getDigitalReleases, type PosterImage } from './digital.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_digital.json';
const DRY_RUN = process.env.DRY_RUN === '1';

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
 * Post text with optional image embed.
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

async function main(): Promise<void> {
  let state = loadState(STATE_FILE);

  const result = await getDigitalReleases(state);

  if (!result) {
    console.log('No new digital releases to post.');
    return;
  }

  console.log(`Found ${result.moviePosts.length} digital releases to announce.`);
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
      const poster = result.moviePosters[i];
      if (poster) {
        console.log(`Poster: ${poster.alt} (${(poster.data.length / 1024).toFixed(0)} KB)`);
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

  // Post per-movie replies
  let parent = summaryResult;
  for (let i = 0; i < result.moviePosts.length; i++) {
    const moviePoster = result.moviePosters[i];
    const posters = moviePoster ? [moviePoster] : [];

    const replyResult = await postWithImages(
      agent,
      result.moviePosts[i],
      posters,
      parent,
      summaryResult,
    );
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
