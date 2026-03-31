/**
 * Entry point for the new trailers GHA job (Wednesdays).
 *
 * Discovers popular movies with recently-published trailers
 * and posts a summary thread with YouTube link card embeds.
 */
import { getNewTrailers } from './trailers.js';
import { runJob } from './post-helpers.js';

runJob({
  stateFile: 'state/seen_trailers.json',
  label: 'new trailers',
  trackingKey: (id) => `trailer-${id}`,
  discover: (state) => getNewTrailers(state),
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
