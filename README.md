# Let's All Go to the Movies 🎬

A Bluesky bot that posts weekly movie release announcements — what's opening in theaters and what just hit digital.

**[@lagttm.bsky.social](https://bsky.app/profile/lagttm.bsky.social)**

## What it posts

**Theatrical releases** (Thursdays) — new movies opening this weekend in the US, with posters, runtime, director, and TMDB links.

**Digital releases** (Tuesdays) — films that recently hit digital/VOD after a theatrical run, with the theatrical-to-digital date window.

Each post includes a summary with a poster album, followed by a threaded reply per movie with details.

## How it works

- **TMDB API** for release discovery, movie details, and poster images
- **Bluesky** posting via [@atproto/api](https://www.npmjs.com/package/@atproto/api) with shared utilities from [toolbox](https://github.com/samm-the-dev/toolbox)
- **GitHub Actions** cron schedules for automated weekly posts
- State files track what's been posted to prevent duplicates

## Setup

Requires three secrets in GitHub Actions:

- `TMDB_API_KEY` — free from [themoviedb.org](https://www.themoviedb.org/settings/api)
- `BLUESKY_HANDLE` — Bluesky account handle
- `BLUESKY_APP_PASSWORD` — generated in Bluesky Settings > App Passwords

## Attribution

This product uses the [TMDB API](https://www.themoviedb.org/) but is not endorsed or certified by TMDB.

Profile icon: [Video](https://lucide.dev/icons/video) from [Lucide](https://lucide.dev/) (MIT).
