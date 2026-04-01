# Movie Releases Bot

Bluesky bot ([@lagttm.bsky.social](https://bsky.app/profile/lagttm.bsky.social)) for weekly movie release announcements: theatrical, digital, trailers, and streaming. Powered by TMDB API, Streaming Availability API, and GitHub Actions.

## Key References

- Proposal: `docs/movie-releases.md`
- Bluesky shared utilities: consume from `toolbox/lib/bluesky/` (extracted from bio crossposting)
- Methodology & credits gist: https://gist.github.com/samm-the-dev/a058c5a0fb38858b428fcec8f7ab42c9
  - **Update this gist whenever filtering thresholds or data sources change** (e.g. MIN_RATING, MIN_POPULARITY, MIN_RATING_NOTABLE, streaming services list)
