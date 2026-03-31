/**
 * Entry point for the streaming releases GHA job.
 *
 * Discovers movies newly added to major US streaming services,
 * posts a summary grouped by service + per-movie reply thread.
 */
import { getStreamingReleases } from './streaming.js';
import { runJob } from './post-helpers.js';

runJob({
  stateFile: 'state/seen_streaming.json',
  label: 'streaming releases',
  discover: (state) => getStreamingReleases(state),
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
