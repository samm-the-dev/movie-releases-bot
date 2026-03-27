/**
 * Entry point for the theatrical releases GHA job.
 *
 * Posts a summary with poster album, then per-movie reply threads
 * with trailer link cards (or poster fallback).
 */
import { getTheatricalReleases } from './theatrical.js';
import { postWithImages, postWithTrailer } from './post-helpers.js';
import {
  createClient,
  credentialsFromEnv,
} from '../.toolbox/lib/bluesky/client.js';
import { loadState, saveState, track } from '../.toolbox/lib/bluesky/state.js';

const STATE_FILE = 'state/seen_theatrical.json';
const DRY_RUN = process.env.DRY_RUN === '1';
const IGNORE_SEEN = process.env.IGNORE_SEEN === '1';

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
      replyResult = await postWithTrailer(
        agent,
        result.moviePosts[i],
        trailerUrl,
        result.movieTitles[i],
        result.trailerNames[i],
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
