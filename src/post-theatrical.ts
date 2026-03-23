/**
 * Entry point for the theatrical releases GHA job.
 *
 * Discovers movies opening this weekend, formats a post with poster
 * images, and posts to Bluesky. Updates tracking state to prevent duplicates.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import { getTheatricalReleases, type PosterImage } from './theatrical.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_theatrical.json';
const DRY_RUN = process.env.DRY_RUN === '1';

/**
 * Upload poster images and build the embed parameter for agent.post().
 * Returns undefined if no posters are available.
 */
async function uploadPosters(
  agent: AtpAgent,
  posters: PosterImage[],
): Promise<Array<{ alt: string; image: unknown }> | undefined> {
  if (posters.length === 0) return undefined;

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
 * Post to Bluesky with text, facets, and optional image embed.
 * Handles the image embed directly since the toolbox module
 * only supports link card embeds.
 */
async function postWithImages(
  agent: AtpAgent,
  text: string,
  posters: PosterImage[],
): Promise<{ uri: string; cid: string }> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  const images = await uploadPosters(agent, posters);

  const postParams: Parameters<typeof agent.post>[0] = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  if (images) {
    postParams.embed = {
      $type: 'app.bsky.embed.images',
      images: images as typeof postParams.embed extends { images: infer I } ? I : never,
    } as typeof postParams.embed;
  }

  const response = await agent.post(postParams);

  return { uri: response.uri, cid: response.cid };
}

async function main(): Promise<void> {
  let state = loadState(STATE_FILE);

  const result = await getTheatricalReleases(state);

  if (!result) {
    console.log('No new theatrical releases to post.');
    return;
  }

  console.log(`Found ${result.movies.length} movies to announce.`);
  console.log(`Fetched ${result.posters.length} poster images.`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would post:\n');
    for (const postText of result.posts) {
      console.log('---');
      console.log(postText);
      console.log('---\n');
    }
    if (result.posters.length > 0) {
      console.log(`[DRY RUN] Would attach ${result.posters.length} poster image(s):`);
      for (const poster of result.posters) {
        console.log(`  ${poster.alt} (${(poster.data.length / 1024).toFixed(0)} KB)`);
      }
    }
    return;
  }

  const credentials = credentialsFromEnv();
  const agent = await createClient(credentials);

  // Post with images attached to the first post
  const firstResult = await postWithImages(agent, result.posts[0], result.posters);
  console.log(`Posted: ${firstResult.uri}`);

  // Thread continuation posts (no images)
  if (result.posts.length > 1) {
    let parent = firstResult;
    for (let i = 1; i < result.posts.length; i++) {
      const rt = new RichText({ text: result.posts[i] });
      await rt.detectFacets(agent);

      const response = await agent.post({
        text: rt.text,
        facets: rt.facets,
        reply: {
          root: { uri: firstResult.uri, cid: firstResult.cid },
          parent: { uri: parent.uri, cid: parent.cid },
        },
        createdAt: new Date().toISOString(),
      });
      parent = { uri: response.uri, cid: response.cid };
      console.log(`  Thread post ${i + 1}: ${response.uri}`);
    }
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
