/**
 * Entry point for the theatrical releases GHA job.
 *
 * Discovers movies opening this weekend, formats a post,
 * and posts to Bluesky. Updates tracking state to prevent duplicates.
 */
import { getTheatricalReleases } from './theatrical.js';
import {
  createClient,
  credentialsFromEnv,
  post,
  postThread,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';
import type { TrackingState } from '../.toolbox/lib/bluesky/types.js';

const STATE_FILE = 'state/seen_theatrical.json';
const DRY_RUN = process.env.DRY_RUN === '1';

async function main(): Promise<void> {
  let state = loadState(STATE_FILE);

  const result = await getTheatricalReleases(state);

  if (!result) {
    console.log('No new theatrical releases to post.');
    return;
  }

  console.log(`Found ${result.movies.length} movies to announce.`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would post:\n');
    for (const postText of result.posts) {
      console.log('---');
      console.log(postText);
      console.log('---\n');
    }
    return;
  }

  const credentials = credentialsFromEnv();
  const agent = await createClient(credentials);

  if (result.posts.length === 1) {
    const postResult = await post(agent, { text: result.posts[0] });
    console.log(`Posted: ${postResult.uri}`);
  } else {
    const posts = result.posts.map((text) => ({ text }));
    const results = await postThread(agent, posts);
    console.log(`Posted thread (${results.length} posts):`);
    for (const r of results) {
      console.log(`  ${r.uri}`);
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
