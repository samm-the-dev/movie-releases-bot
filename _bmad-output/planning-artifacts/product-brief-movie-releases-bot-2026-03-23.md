---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - docs/03-movie-releases.md
  - docs/shared-infra-notes.md
  - bio/scripts/crosspost-bluesky.mjs (reference — Bluesky posting pattern)
  - bio/.github/workflows/deploy-gh-pages.yml (reference — GHA crosspost job)
date: 2026-03-23
author: Smars
---

# Product Brief: movie-releases-bot

## 1. Analyst Audit

### 1.1 What the Proposal Defines

The proposal doc (`03-movie-releases.md`) is well-structured and covers:

- **Problem statement**: People miss when theatrical movies hit digital/VOD. No single reliable Bluesky source for practical availability info.
- **Data source**: TMDB API (free, well-documented). Key endpoints identified: `/movie/upcoming`, `/discover/movie` with `with_release_type`, `/movie/{id}/release_dates`, `/movie/{id}/watch/providers`.
- **Two posting cadences**: Weekly theatrical (Thursday) and weekly digital (Tuesday).
- **State management**: JSON watchlist tracking films from theatrical debut through digital release.
- **Post formats**: Example posts for both theatrical roundup and individual digital release announcements.
- **Monetization**: Ko-fi donation link in bio. No affiliate linking (no practical movie affiliate program).
- **Effort estimate**: MVP 1 session, digital tracking 1-2 more.

### 1.2 What Exists in Bio's Crossposting (Liftable)

The proven Bluesky posting pattern in `bio/scripts/crosspost-bluesky.mjs` provides:

| Component | What It Does | Reusable? |
|-----------|-------------|-----------|
| `@atproto/api` auth | `AtpAgent` login with handle + app password from env vars | **Yes** — direct lift |
| `RichText` facet detection | Auto-detects links in post text, creates facets | **Yes** — direct lift |
| Link card embed | `app.bsky.embed.external` with uri/title/description | **Yes** — adapt for movie cards |
| Reply threading | `resolveParent()` for reply chains via tracking file or feed search | **Partial** — thread format useful for busy weekends |
| Dry run mode | `DRY_RUN=1` env var skips posting | **Yes** — essential for testing |
| Tracking file | `.crossposted.json` with slug-to-uri/cid mapping | **Yes** — adapt to seen_ids pattern |
| GHA workflow | Checkout, setup-node, npm ci, run script, git-auto-commit | **Yes** — template pattern |

### 1.3 Toolbox Extraction Status

**Current state**: `toolbox/lib/bluesky/` does not exist yet. The shared-infra-notes.md (from ttrpg-releases-bot) already documents the decision to extract to toolbox as part of the first bot build.

**Extraction scope** (per shared-infra-notes):
- Auth: App Password login, session persistence
- Posting: text + link facets, thread support, 300-char handling
- State: seen_ids tracking, git auto-commit pattern

**Coordination needed**: The ttrpg-releases-bot is being built in parallel. Whichever bot session runs first should do the toolbox extraction. This project should consume from `toolbox/lib/bluesky/`, not build inline.

### 1.4 Open Questions Requiring Decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **"Notable" filter for digital releases** | (a) TMDB popularity threshold, (b) manual allowlist, (c) any film that had theatrical run | **(c) for MVP** — any film with type 3 (theatrical) + type 4 (digital) in US region. Popularity filtering is Phase 2 refinement. |
| 2 | **Include streaming service availability?** | (a) Just "now on digital", (b) include watch providers | **(a) for MVP** — watch providers endpoint adds complexity and the data can lag. Add in Phase 2. |
| 3 | **Thread format for busy weekends** | (a) Single post with bullet list, (b) thread with one film per post, (c) single post, overflow to thread | **(c)** — single post with top films, thread continuation if >5 releases. 300-char limit means ~4-5 films per post. |
| 4 | **Bot account vs personal** | (a) Separate @moviebot, (b) personal @samm-the-human, (c) hybrid | **(b) for MVP** — per shared-infra-notes recommendation. Split later if traction justifies. |
| 5 | **TMDB attribution** | Required by TMDB ToS | Include "Powered by TMDB" in bot bio and periodic post. |
| 6 | **Movie poster images in posts** | TMDB provides poster URLs | **Phase 2** — requires image upload to Bluesky blob store, adds complexity. Text-only MVP. |

### 1.5 Movie-Metadata-MCP Relationship

The `movie-metadata-mcp` at `c:\Dev\movie-metadata-mcp\` is a third-party MCP server (by stevenaubertin) for interactive TMDB/OMDB queries. It's useful as a Claude tool for ad-hoc movie lookups but is **not suitable for the bot's data pipeline** — the bot needs its own lightweight TMDB client with release-date-specific polling logic (`/discover/movie` with release type filters, `/movie/{id}/release_dates`). The MCP server doesn't expose these endpoints.

---

## 2. Architecture Design

### 2.1 Repo Structure

```
movie-releases-bot/
├── .github/
│   └── workflows/
│       ├── post-theatrical.yml    # Thursday cron — weekly theatrical releases
│       └── post-digital.yml       # Tuesday cron — weekly digital releases (Phase 2)
├── .toolbox/                      # Submodule — shared Bluesky utilities
├── _bmad/                         # BMAD methodology
├── _bmad-output/                  # BMAD artifacts
├── docs/                          # Proposal + reference docs
├── src/
│   ├── tmdb.ts                    # TMDB API client (release-date focused)
│   ├── theatrical.ts              # Theatrical release discovery + formatting
│   ├── digital.ts                 # Digital release detection + formatting (Phase 2)
│   ├── watchlist.ts               # State management for tracking films (Phase 2)
│   └── post-theatrical.ts         # Entry point for theatrical GHA job
├── state/
│   ├── seen_theatrical.json       # Tracking: posted theatrical announcements
│   └── watchlist.json             # Tracking: films awaiting digital release (Phase 2)
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── todo.md
```

### 2.2 Data Pipeline — Theatrical Releases (MVP)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GHA Cron        │────▶│  TMDB API         │────▶│  Filter + Format │
│  Thursday 15:30  │     │  /discover/movie  │     │  Notable releases│
│  UTC             │     │  region=US        │     │  this weekend    │
└─────────────────┘     │  release_type=3   │     └────────┬────────┘
                        │  date range: Thu→  │              │
                        │  next Wed          │              ▼
                        └──────────────────┘     ┌─────────────────┐
                                                  │  Bluesky Post    │
                                                  │  (toolbox/lib/   │
                                                  │   bluesky/)      │
                                                  └────────┬────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  Update state/   │
                                                  │  seen_theatrical │
                                                  │  .json + commit  │
                                                  └─────────────────┘
```

**TMDB query for theatrical releases**:
```
GET /discover/movie
  ?region=US
  &with_release_type=3        # Theatrical
  &release_date.gte=YYYY-MM-DD  # This Thursday
  &release_date.lte=YYYY-MM-DD  # Next Wednesday
  &sort_by=popularity.desc
```

**Deduplication**: Check each TMDB movie ID against `seen_theatrical.json` before posting. Prevents re-announcing films that opened in limited release before wide release.

### 2.3 Data Pipeline — Digital Releases (Phase 2)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GHA Cron        │────▶│  TMDB API         │────▶│  Cross-ref with  │
│  Tuesday 15:30   │     │  /discover/movie  │     │  watchlist.json   │
│  UTC             │     │  region=US        │     │  (had theatrical) │
└─────────────────┘     │  release_type=4   │     └────────┬────────┘
                        │  date range: past  │              │
                        │  7 days            │              ▼
                        └──────────────────┘     ┌─────────────────┐
                                                  │  Format + Post   │
                                                  │  per film        │
                                                  └────────┬────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  Remove from     │
                                                  │  watchlist.json  │
                                                  └─────────────────┘
```

**Watchlist lifecycle**:
1. Theatrical job adds films to `watchlist.json` (TMDB ID, title, theatrical date)
2. Digital job checks watchlist films for type 4 release dates
3. Once posted (or after 180-day timeout), remove from watchlist

### 2.4 TMDB Client Design

Lightweight, focused on release-date endpoints:

```typescript
// src/tmdb.ts
interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  popularity: number;
  release_date: string;
  genre_ids: number[];
}

interface TMDBReleaseDateEntry {
  type: number;      // 1=Premiere, 2=Limited, 3=Theatrical, 4=Digital, 5=Physical, 6=TV
  release_date: string;
}

// Core functions:
// discoverByReleaseType(type, dateRange, region) -> TMDBMovie[]
// getReleaseDates(movieId, region) -> TMDBReleaseDateEntry[]
// getGenreMap() -> Map<number, string>  (cached, rarely changes)
```

**Rate limiting**: TMDB allows 40 req/10s. A typical weekly run makes <10 requests. No throttling needed.

### 2.5 Post Formatting

**Theatrical post** (single post, overflow to thread):
```
Opening This Weekend (Mar 27)

- Sinners -- Ryan Coogler's latest. Horror/thriller.
- Jurassic World Rebirth -- Dinosaurs return.
- The Alto Knights -- De Niro plays rival mob bosses.

What are you seeing?
```

Rules:
- Title + short description per film (genre from TMDB genre_ids)
- Truncate overview to fit — aim for ~50 chars per film line
- Max ~5 films per post (300-char limit). If >5, thread continuation.
- Sort by TMDB popularity descending
- ASCII only in post text (no emoji in MVP — keep it clean and Bluesky-native)

**Digital post** (Phase 2, one post per film):
```
Now on Digital

Companion (2025) -- the AI thriller -- is now available to rent/buy.

Theatrical: Jan 10 -> Digital: Mar 25
```

### 2.6 GHA Workflow — Theatrical (MVP)

```yaml
name: Post Theatrical Releases
on:
  schedule:
    - cron: '30 15 * * 4'  # Thursday 3:30 PM UTC = 10:30 AM CT
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: node dist/post-theatrical.js
        env:
          TMDB_API_KEY: ${{ secrets.TMDB_API_KEY }}
          BLUESKY_HANDLE: ${{ secrets.BLUESKY_HANDLE }}
          BLUESKY_APP_PASSWORD: ${{ secrets.BLUESKY_APP_PASSWORD }}
          DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && '1' || '0' }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "update theatrical seen IDs [skip ci]"
          file_pattern: "state/*.json"
```

**Notes**:
- `workflow_dispatch` defaults to dry-run mode for safe manual testing
- `[skip ci]` in commit message prevents recursive workflow triggers
- `contents: write` permission for state file auto-commit

### 2.7 Dependencies

```json
{
  "dependencies": {
    "@atproto/api": "^0.13.x"
  },
  "devDependencies": {
    "typescript": "^5.7.x",
    "@types/node": "^20.x",
    "vitest": "^3.x"
  }
}
```

- `@atproto/api` consumed via toolbox shared module (still needed as direct dep for types)
- TMDB API is plain `fetch` — no SDK needed
- No `gray-matter` or content parsing (unlike bio's crossposting)

### 2.8 Testing Strategy

- **TMDB client**: Unit tests with fixture responses (mock fetch)
- **Formatting**: Unit tests for post truncation, threading logic, genre mapping
- **Deduplication**: Unit tests for seen_ids filtering
- **Integration**: `DRY_RUN=1` mode in GHA for end-to-end validation without posting

---

## 3. PM Scoping

### 3.1 MVP — Phase 1: Theatrical Releases

**Goal**: Weekly Thursday post announcing notable theatrical releases opening this weekend in the US.

**Scope**:
- TMDB `/discover/movie` polling for type 3 (theatrical) releases
- Single-post format with overflow threading
- Deduplication via `seen_theatrical.json`
- Bluesky posting via toolbox shared module
- GHA cron workflow (Thursday)
- `workflow_dispatch` with dry-run for testing
- TMDB attribution in bot bio

**Out of scope for Phase 1**:
- Digital/VOD release tracking
- Watch provider data
- Movie poster images
- Popularity filtering (post all notable theatrical releases)
- Separate bot account

**Dependencies**:
- TMDB API key (free registration)
- Bluesky app password (existing account)
- Toolbox Bluesky extraction (coordinate with ttrpg-releases-bot)

**Acceptance criteria**:
1. `workflow_dispatch` produces correct dry-run output for current week
2. Cron run posts formatted theatrical releases to Bluesky
3. State file updated and committed after each run
4. No duplicate posts across weeks

### 3.2 Phase 2: Digital Release Tracking

**Goal**: Weekly Tuesday post announcing films that recently hit digital/VOD after theatrical run.

**Adds**:
- Watchlist system (`watchlist.json`) — populated by theatrical job, consumed by digital job
- TMDB `/discover/movie` with `release_type=4` for digital release detection
- Separate GHA workflow (Tuesday cron)
- Per-film post format with theatrical-to-digital date range
- 180-day watchlist timeout/cleanup

**Optional Phase 2 additions** (can be deferred to Phase 3):
- Watch provider data (where to stream/rent/buy)
- Popularity threshold for digital releases
- Movie poster image embeds
- Thread format for multiple digital releases in one week

### 3.3 Effort Estimate

| Phase | Scope | Estimate |
|-------|-------|----------|
| **Pre-req** | Toolbox Bluesky extraction (if not done by ttrpg-bot) | 1 session |
| **Phase 1** | Theatrical releases MVP | 1 session |
| **Phase 2** | Digital release tracking | 1-2 sessions |
| **Phase 2+** | Watch providers, images, popularity filtering | 1 session |

### 3.4 Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| TMDB digital release dates lag reality | Medium | "Recently available" language, not "available today" |
| TMDB data incomplete for smaller films | Medium | Accept — bot focuses on notable releases anyway |
| Bluesky API changes | Low | `@atproto/api` maintained by Bluesky team |
| Rate limiting (TMDB) | Very Low | Weekly run makes <10 requests |
| Toolbox extraction coordination | Medium | Check toolbox state at session start; extract if needed |
