/**
 * Entry point for the new trailers GHA job (Wednesdays).
 *
 * Discovers popular movies with recently-published trailers
 * and posts a summary thread with YouTube link card embeds.
 */
import { RichText } from '@atproto/api';
import { getNewTrailers } from './trailers.js';
import { postWithTrailer } from './post-helpers.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_trailers.json';
const DRY_RUN = process.env.DRY_RUN === '1';
const IGNORE_SEEN = process.env.IGNORE_SEEN === '1';

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
      result.trailerNames[i],
      null,
      parent,
      summaryRef,
    );
    parent = replyResult;
    console.log(`  Reply ${i + 1}: ${replyResult.uri}`);
  }

  // Update tracking state (skip when ignoring seen — allows repeated test runs)
  if (!IGNORE_SEEN) {
    for (const movieId of result.movieIds) {
      state = track(state, `trailer-${movieId}`, { uri: null, cid: null });
    }
    saveState(STATE_FILE, state);
    console.log(`Tracking state updated (${result.movieIds.length} trailers added).`);
  } else {
    console.log('IGNORE_SEEN: skipped state update.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
