/**
 * Entry point for the digital releases GHA job.
 *
 * Discovers films that recently hit digital/VOD after a theatrical run,
 * posts a summary with poster album + per-movie reply thread.
 */
import { getDigitalReleases } from './digital.js';
import { runJob } from './post-helpers.js';

runJob({
  stateFile: 'state/seen_digital.json',
  label: 'digital releases',
  discover: (state) => getDigitalReleases(state),
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
