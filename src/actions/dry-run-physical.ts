/**
 * Dry-run script for physical release discovery.
 *
 * Samples 30 days of TMDB type 5 (physical) release data for catalog
 * titles and prints results to stdout. Does NOT post to Bluesky or
 * update any state.
 */
import { getPhysicalReleases } from '../physical.js';

const LOOKBACK_DAYS = 30;

async function main(): Promise<void> {
  // Use an empty state — we want to see everything
  const state = {};

  console.log(`Sampling physical releases: past ${LOOKBACK_DAYS} days`);
  console.log('Catalog filter: primary release 2+ years before physical date');
  console.log('---\n');

  const result = await getPhysicalReleases(state, new Date(), LOOKBACK_DAYS);

  if (!result) {
    console.log('No catalog physical releases found in this window.');
    return;
  }

  // Print stats if available
  const stats = (result as unknown as Record<string, unknown>)._stats as
    | { totalDiscovered: number; skippedNonCatalog: number; included: number }
    | undefined;
  if (stats) {
    console.log(`TMDB returned: ${stats.totalDiscovered} type 5 releases`);
    console.log(`Skipped (not catalog): ${stats.skippedNonCatalog}`);
    console.log(`Passed filter: ${stats.included}`);
    console.log('');
  }

  console.log('=== SUMMARY POST ===');
  console.log(result.summaryPost);
  console.log('====================\n');

  if (result.albumPosters.length > 0) {
    console.log(`Album posters: ${result.albumPosters.length}`);
    for (const p of result.albumPosters) {
      console.log(`  ${p.alt} (${(p.data.length / 1024).toFixed(0)} KB)`);
    }
    console.log('');
  }

  console.log(`=== DETAIL POSTS (${result.moviePosts.length}) ===\n`);
  for (let i = 0; i < result.moviePosts.length; i++) {
    console.log(`--- Movie ${i + 1} ---`);
    console.log(result.moviePosts[i]);
    const poster = result.moviePosters[i];
    if (poster) {
      console.log(`Poster: ${poster.alt} (${(poster.data.length / 1024).toFixed(0)} KB)`);
    }
    console.log('---\n');
  }

  console.log(`Total: ${result.movieIds.length} catalog physical releases found.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
