# Todo

## MVP: Theatrical Releases

- [x] BMAD planning artifacts (product brief, architecture, PM scoping)
- [x] Toolbox Bluesky extraction (lib/bluesky/ -- client, state, format)
- [x] Scaffold project (package.json, tsconfig, toolbox submodule, GHA workflow)
- [x] TMDB client (release-date focused, date range helpers)
- [x] Theatrical release discovery + post formatting
- [x] GHA workflow (Thursday cron, dry-run via workflow_dispatch)
- [ ] Set up TMDB API key (repo secret)
- [ ] Set up Bluesky app password (repo secret)
- [ ] First live dry-run test via workflow_dispatch
- [ ] First live post

## Phase 2: Digital Release Tracking

- [x] Digital release discovery + per-film post format
- [x] GHA workflow (Tuesday cron)
- [ ] Watchlist pruning (180-day timeout)

## Phase 2+: Polish

- [x] Watch provider data (JustWatch links)
- [x] Movie poster image embeds
- [x] Popularity threshold tuning
- [ ] Ko-fi link in bot bio
- [ ] TMDB attribution in bot bio

## Phase 3: Trailer Support

- [x] TMDB video/trailer extraction via `/movie/{id}/videos` (append_to_response)
- [x] `pickTrailer()` — selects best official YouTube trailer (prefers Trailer > Teaser, most recent)
- [x] YouTube link card embeds (`app.bsky.embed.external`) with thumbnail for detail replies
- [x] Poster fallback when no trailer is available
- [x] Trailer link cards in theatrical release detail posts
- [x] Trailer link cards in digital release detail posts
- [x] New trailer discovery job — upcoming movies with trailers published in the past 7 days
- [x] GHA workflow (Wednesday cron, dry-run via workflow_dispatch)
- [x] Trailer state tracking (`state/seen_trailers.json`)
- [x] Tests for `pickTrailer`, `youtubeKeyFromUrl`, `youtubeThumbnailUrl`, `formatTrailerDetail`
