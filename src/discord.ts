/**
 * Discord webhook notifications.
 *
 * Sends a summary embed to a Discord channel after each Bluesky post.
 * Opt-in via DISCORD_WEBHOOK_URL env var — no URL means no Discord posting.
 *
 * Builds embeds from structured ThreadResult data, keeping Discord
 * formatting decoupled from Bluesky post formatting.
 */
import type { ThreadResult } from './post-helpers.js';

/** Discord embed object (subset of the full spec). */
interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
}

/** Discord webhook payload. */
interface DiscordWebhookPayload {
  embeds: DiscordEmbed[];
}

/** Max description length for a Discord embed. */
const MAX_DESCRIPTION = 4096;

/** Format a movie title as a linked bullet. Prefers deep link, falls back to TMDB. */
function formatTitle(title: string, tmdbId: number, link?: string | null): string {
  const url = link ?? (tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : null);
  return url ? `• [${title}](${url})` : `• ${title}`;
}

/**
 * Build a Discord embed description from ThreadResult data.
 * Uses service groups when available, otherwise a flat list.
 * Each movie title links to its streaming page or TMDB.
 */
export function buildDescription(
  movieTitles: string[],
  movieIds: number[],
  groups?: ThreadResult['groups'],
  movieLinks?: (string | null)[],
  blueskyThreadUrl?: string,
): string {
  const sections: string[] = [];

  if (groups && groups.length > 0) {
    for (const group of groups) {
      const lines = [
        `**${group.label}:**`,
        ...group.indices.map((i: number) => formatTitle(movieTitles[i], movieIds[i], movieLinks?.[i])),
      ];
      sections.push(lines.join('\n'));
    }
  } else {
    const lines = movieTitles.map((title, i) => formatTitle(title, movieIds[i], movieLinks?.[i]));
    sections.push(lines.join('\n'));
  }

  let description = sections.join('\n\n');

  if (blueskyThreadUrl) {
    description += `\n\n[View full thread on Bluesky](${blueskyThreadUrl})`;
  }

  if (description.length > MAX_DESCRIPTION) {
    description = description.slice(0, MAX_DESCRIPTION - 3) + '...';
  }

  return description;
}

/**
 * Extract the title line from the first summary post.
 * This is the emoji + header (e.g. "▶️ New on Streaming (March 24 – March 31)").
 */
function extractTitle(summaryPosts: string[]): string {
  return summaryPosts[0]?.split('\n')[0] ?? '';
}

/**
 * Send a summary notification to a Discord webhook.
 */
export async function notifyDiscord(
  webhookUrl: string,
  result: ThreadResult,
  label: string,
  blueskyThreadUrl?: string,
): Promise<void> {
  const title = extractTitle(result.summaryPosts);
  const description = buildDescription(
    result.movieTitles,
    result.movieIds,
    result.groups,
    result.movieLinks,
    blueskyThreadUrl,
  );

  const embed: DiscordEmbed = {
    title,
    description,
    color: 0x1d9bf0, // Bluesky blue
  };

  const payload: DiscordWebhookPayload = { embeds: [embed] };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  } else {
    console.log(`Discord notification sent for ${label}.`);
  }
}
