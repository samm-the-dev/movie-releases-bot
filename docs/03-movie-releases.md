# Project Proposal: Now Showing / Now Streaming — Movie Release Bot

## Concept
A Bluesky bot that posts two types of movie release info: (1) new theatrical releases each week, and (2) digital/VOD release announcements when notable films leave theaters and hit streaming/purchase. Includes a Ko-fi donation link.

## Problem It Solves
People constantly miss when theatrical movies quietly land on digital/VOD. The theatrical-to-digital window varies wildly (30-120+ days) and there's no single reliable source that announces "this movie is now available to rent/buy at home." Existing movie Twitter/Bluesky accounts focus on reviews or hype, not practical availability.

## Relationship to Existing Project
Owner has an existing project seed for movie release watching. Scope of this proposal: ensure Bluesky posting is a core feature, add a Ko-fi donation link, and define the full data pipeline. Existing project should be audited for what's already built before starting new work.

## Data Sources

### TMDB (The Movie Database) API
- **Free tier**: Requires API key (free registration). No hard rate limit published but requests should be reasonable.
- **Relevant endpoints**:
  - `/movie/now_playing` — currently in theaters (by region)
  - `/movie/upcoming` — upcoming theatrical releases
  - `/movie/popular` — trending/popular films
  - `/discover/movie` — filter by release date, region, release type
  - `/movie/{id}/release_dates` — per-country release dates broken down by type (theatrical, digital, physical, TV)
  - `/movie/{id}/watch/providers` — JustWatch-powered data showing where to stream/rent/buy
- **Release type codes** (from `/release_dates`):
  - Type 1: Premiere
  - Type 2: Theatrical (limited)
  - Type 3: Theatrical
  - Type 4: Digital
  - Type 5: Physical
  - Type 6: TV
- **Key insight**: The `/release_dates` endpoint with type 4 (Digital) is the core data for the "now streaming" feature. Poll weekly for films that recently gained a type 4 release date in the US region.
- **Trending signal**: `/trending/movie/week` and `/movie/popular` provide a popularity signal for what people are watching right now. Useful for filtering which digital releases are worth announcing.

## Monetization
- **Ko-fi donation link**: In Bluesky bio and periodic pinned post. Film enthusiasts on Bluesky are a supportive community.
- **No affiliate linking for movies**: Unlike DTRPG, there's no practical affiliate program for linking to theater showtimes or streaming services. JustWatch has affiliate integrations but they're for larger publishers, not individual bots.
- **Potential**: If this gains followers, could become a foundation for curated newsletter or companion site with Ko-fi membership tiers.

## Architecture

### Runtime
- **GitHub Actions** on cron schedule
- **Two cadences**:
  - **Weekly (Thursday/Friday)**: "Opening this weekend" — new theatrical releases
  - **Weekly (Tuesday)**: "Now on digital" — films that recently hit VOD/digital (Tuesdays are traditional digital release days)

### Workflow — Theatrical Releases
1. GHA cron triggers (Thursday)
2. Call TMDB `/movie/upcoming` filtered to US region, this week's release dates
3. Filter to notable releases (e.g., popularity threshold, or manual allowlist)
4. Format post with title, genre, brief synopsis (from TMDB `overview`, truncated)
5. Post to Bluesky

### Workflow — Digital Releases
1. GHA cron triggers (Tuesday)
2. Call TMDB `/discover/movie` with `with_release_type=4` and `release_date.gte` / `release_date.lte` for the past 7 days, region US
3. Cross-reference against a watchlist of "notable theatrical releases" tracked since their theatrical debut
4. Filter to films that had a theatrical run (type 3) and now have a digital release (type 4)
5. Optionally call `/movie/{id}/watch/providers` to include where it's available
6. Format and post

### State Management
- Track "notable films" in a JSON file: when a film enters `now_playing`, add it to the watchlist with its TMDB ID and theatrical release date
- Each week, check watchlist films for new digital release dates
- Remove from watchlist once digital release is posted (or after 180 days)

### Post Format (example — theatrical)
```
🎬 Opening This Weekend (Mar 27)

• Sinners — Ryan Coogler's latest. Horror/thriller.
• Jurassic World Rebirth — Dinosaurs, again.
• The Alto Knights — De Niro plays two rival mob bosses.

What are you seeing? 🍿
```

### Post Format (example — digital)
```
📺 Now on Digital

Companion (2025) — the Jake Gyllenhaal AI thriller — is now available to rent/buy.

Theatrical: Jan 10 → Digital: Mar 25
Available on: Apple TV, Amazon, Vudu
```

## Open Questions
- How to define "notable" for digital release posts? Popularity threshold? Manual curation?
- Include streaming service availability (from TMDB watch providers) or just announce digital availability?
- Thread format for busy release weekends?
- Standalone bot account or personal account?
- How does this integrate with the existing project seed? Need to audit what's already built.

## Effort Estimate
- **MVP (theatrical releases only)**: 1 session. TMDB API is excellent and well-documented.
- **Digital release tracking**: 1-2 more sessions for the watchlist system and type-4 detection logic.
- **Existing project integration**: Unknown until audited. Could be 0 additional work if Bluesky posting just needs to be wired up.

## Risk / Considerations
- TMDB API is free but requires attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB"). Include in bot bio.
- TMDB digital release dates can lag reality by a few days. Posts should say "recently available" rather than "available today."
- The digital release detection depends on TMDB's release_dates being updated; for smaller films this may be incomplete.
