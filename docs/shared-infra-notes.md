# Bluesky Bot Portfolio — Project Index

## Overview
A portfolio of Bluesky info-feed bots, each running on GitHub Actions cron schedules, aggregating free API data into useful posts. All share a common infrastructure pattern and link back to a Ko-fi donation page.

## Projects (Priority Order)

| # | Project | Status | Monetization | Audience |
|---|---------|--------|-------------|----------|
| 01 | [TTRPG New Releases](./01-ttrpg-new-releases.md) | Ready to build | DTRPG affiliate + Ko-fi | TTRPG Bluesky |
| 02 | [DFW Improv Tonight](./02-dfw-improv-tonight.md) | On hold (scope/multi-platform) | TBD | DFW local |
| 03 | [Movie Releases](./03-movie-releases.md) | Has existing project seed | Ko-fi | Film Bluesky |
| 04 | [Roll for Movie Night](./04-roll-for-movie-night.md) | Ready to build | DTRPG affiliate + Ko-fi | Film + TTRPG crossover |
| 05 | [DFW Nerd Week](./05-dfw-nerd-week.md) | Future (after 01-03) | DTRPG affiliate + Ko-fi | DFW nerd community |
| 06 | [Dev Feeds](./06-dev-feeds-parked.md) | Parked | Ko-fi | Dev community |

## Suggested Build Order
1. **Movie Releases (03)** — has existing project seed, audit first and extend
2. **TTRPG New Releases (01)** — strongest monetization path (DTRPG affiliate), straightforward RSS parsing
3. **Roll for Movie Night (04)** — once 01 and 03 are running, this is a lightweight weekly add-on
4. **DFW Improv Tonight (02)** — on hold; multi-venue, multi-platform aggregation (Humanitix, Eventbrite, others) is heavier than the single-API feeds. Revisit when there's bandwidth.
5. **DFW Nerd Week (05)** — composition layer, build after 01-03 are stable
6. **Dev Feeds (06)** — revisit later

## Shared Infrastructure

### Bluesky Posting Module
All bots share the same posting logic. Build once as a shared utility:

```
shared/
├── bluesky.ts          # Login, post, thread, link facets
├── state.ts            # Read/write seen_ids.json, git commit
├── formatting.ts       # Truncation, character counting, thread splitting
└── types.ts
```

**Key details:**
- Use `@atproto/api` (TypeScript) or `atproto` (Python)
- Authenticate with App Password (one per bot account, stored in GHA secrets)
- Persist session to avoid login rate limits (Bluesky login limits are stricter than post limits)
- 300-character post limit; link facets for clickable URLs
- Thread posting: create first post, then reply to it for subsequent posts

### GitHub Actions Pattern
Each bot is a separate repo (or a monorepo with separate workflows):

```yaml
name: Post to Bluesky
on:
  schedule:
    - cron: '30 15 * * 5'  # Friday 3:30 PM UTC (10:30 AM CT)
  workflow_dispatch: {}     # Manual trigger for testing

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run post
        env:
          BLUESKY_HANDLE: ${{ secrets.BLUESKY_HANDLE }}
          BLUESKY_PASSWORD: ${{ secrets.BLUESKY_PASSWORD }}
          DTRPG_AFFILIATE_ID: ${{ secrets.DTRPG_AFFILIATE_ID }}
          TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
          EVENTBRITE_TOKEN: ${{ secrets.EVENTBRITE_TOKEN }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Update seen IDs"
          file_pattern: "state/*.json"
```

### State Management
- `state/seen_ids.json` per bot tracks what's been posted
- Auto-committed back to repo after each run
- Alternative: GitHub Actions cache (simpler but ephemeral) or a gist

### Account Strategy Decision
**Option A: Separate bot accounts**
- Each feed gets its own Bluesky handle (e.g., @ttrpgreleases.bsky.social)
- Pro: Clean separation, followers self-select
- Con: More accounts to manage, slower individual growth

**Option B: Single personal account**
- All feeds post from the owner's personal Bluesky
- Pro: Everything builds one follower count, personal brand
- Con: Followers get content they didn't ask for

**Option C: Hybrid**
- Standalone accounts for the automated feeds (TTRPG, movies, improv)
- Personal account for curated content (Roll for Movie Night)
- Cross-promote between them

**Recommendation**: Start with Option B (personal account) for speed. Split into separate accounts later if any feed gains enough traction to justify it.

## API Keys Required

| Service | Cost | Signup |
|---------|------|--------|
| TMDB | Free | api.themoviedb.org |
| DriveThruRPG Affiliate | Free | Contact matt@roll20.net |
| Eventbrite | Free | eventbrite.com/platform |
| Humanitix | TBD (needs investigation) | events.humanitix.com — used by SG for paid shows |
| Bluesky App Password | Free | bsky.app settings |

## Ko-fi Setup
- Create Ko-fi page (kofi.com)
- Link in Bluesky bio for all bot accounts
- Periodic pinned post (not every post)
- Consider the ironic "subscribe to support my subscription tracker" angle from SubTrack for cross-promotion
