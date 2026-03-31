/**
 * Entry point for the theatrical releases GHA job.
 *
 * Posts a summary with poster album, then per-movie reply threads
 * with trailer link cards (or poster fallback).
 */
import { getTheatricalReleases } from './theatrical.js';
import { runJob } from './post-helpers.js';

runJob({
  stateFile: 'state/seen_theatrical.json',
  label: 'theatrical releases',
  discover: (state) => getTheatricalReleases(state),
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
