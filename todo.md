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

- [ ] Watchlist system (track films from theatrical debut, check for type 4 digital release)
- [ ] Digital release discovery + per-film post format
- [ ] GHA workflow (Tuesday cron)
- [ ] Watchlist pruning (180-day timeout)

## Phase 2+: Polish

- [ ] Watch provider data (where to stream/rent/buy)
- [ ] Movie poster image embeds
- [ ] Popularity threshold tuning
- [ ] Ko-fi link in bot bio
- [ ] TMDB attribution in bot bio
