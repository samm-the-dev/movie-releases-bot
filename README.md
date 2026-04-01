# Let's All Go to the Movies 📽️

A Bluesky bot that posts weekly movie release announcements — what's opening in theaters, what just hit digital, new trailers, and notable streaming additions.

**[@lagttm.bsky.social](https://bsky.app/profile/lagttm.bsky.social)**

## What it posts

📽️ **Theatrical releases** (Thursdays) — new movies opening this weekend in the US, with trailer link cards (or poster fallback), runtime, director, and TMDB links.

▶️ **Digital releases** (Tuesdays) — films that recently hit digital/VOD after a theatrical run, with the theatrical-to-digital date window and trailer link cards.

📽️ **New trailers** (Wednesdays) — recently-published official trailers for popular movies, posted as YouTube link card embeds.

▶️ **Streaming releases** (Mondays) — notable movies newly added to major US streaming services (Netflix, Disney+, Max, Hulu, Prime Video, Peacock, Paramount+, Apple TV+), filtered to subscription/free tier only.

Each post includes a summary thread followed by per-movie replies with details and embedded trailers. Theatrical, digital, and streaming posts include poster images — a collage grid for 5+ movies, or a native album for 1–4.

## How it works

- **TMDB API** for release discovery, movie details, poster images, and trailer videos
- **Streaming Availability API** (Movie of the Night) for streaming catalog changes
- **Bluesky** posting via [@atproto/api](https://www.npmjs.com/package/@atproto/api) with shared utilities from [toolbox](https://github.com/samm-the-dev/toolbox)
- **GitHub Actions** cron schedules for automated weekly posts
- State files track what's been posted to prevent duplicates

## Setup

Requires secrets in GitHub Actions:

- `TMDB_API_KEY` — free from [themoviedb.org](https://www.themoviedb.org/settings/api)
- `STREAMING_API_KEY` — free from [RapidAPI](https://rapidapi.com/movie-of-the-night-movie-of-the-night-default/api/streaming-availability)
- `BLUESKY_HANDLE` — Bluesky account handle
- `BLUESKY_APP_PASSWORD` — generated in Bluesky Settings > App Passwords
- `DEPLOY_KEY` — SSH deploy key with write access (for committing state files via GitHub Actions)

## Methodology

See the [about page](https://gist.github.com/samm-the-dev/a058c5a0fb38858b428fcec8f7ab42c9) for filtering criteria, data sources, and image credits.

## Attribution

This product uses the [TMDB API](https://www.themoviedb.org/) but is not endorsed or certified by TMDB.

Avatar and banner: [Theodor Horydczak Collection](https://www.loc.gov/pictures/collection/thc/), Library of Congress.
