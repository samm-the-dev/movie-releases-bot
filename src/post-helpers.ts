/**
 * Shared Bluesky posting helpers for image and trailer embeds.
 *
 * Used by post-theatrical.ts, post-digital.ts, and post-trailers.ts
 * to avoid duplicating upload and embed logic.
 */
import { RichText, type AtpAgent } from '@atproto/api';
import type { External } from '@atproto/api/dist/client/types/app/bsky/embed/external.js';
import { youtubeKeyFromUrl, youtubeThumbnailUrl } from './tmdb.js';

/** A poster image to upload to Bluesky. */
export interface PosterImage {
  data: Uint8Array;
  mimeType: string;
  alt: string;
}

/**
 * Upload poster images and return the blob refs for embedding.
 */
export async function uploadImages(
  agent: AtpAgent,
  posters: PosterImage[],
): Promise<Array<{ alt: string; image: unknown }>> {
  const images = [];
  for (const poster of posters) {
    const response = await agent.uploadBlob(poster.data, {
      encoding: poster.mimeType,
    });
    images.push({
      alt: poster.alt,
      image: response.data.blob,
    });
  }
  return images;
}

/**
 * Fetch a YouTube thumbnail and upload it as a Bluesky blob.
 * Returns null if the fetch or upload fails.
 */
export async function uploadYouTubeThumbnail(
  agent: AtpAgent,
  youtubeKey: string,
): Promise<unknown | null> {
  try {
    const url = youtubeThumbnailUrl(youtubeKey);
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const blobResponse = await agent.uploadBlob(new Uint8Array(buffer), {
      encoding: 'image/jpeg',
    });
    return blobResponse.data.blob;
  } catch {
    return null;
  }
}

/**
 * Post text with optional image embed. Returns uri/cid.
 */
export async function postWithImages(
  agent: AtpAgent,
  text: string,
  posters: PosterImage[],
  replyTo?: { uri: string; cid: string },
  root?: { uri: string; cid: string },
): Promise<{ uri: string; cid: string }> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  const postParams: Parameters<typeof agent.post>[0] = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  if (posters.length > 0) {
    const images = await uploadImages(agent, posters);
    postParams.embed = {
      $type: 'app.bsky.embed.images',
      images: images as typeof postParams.embed extends { images: infer I } ? I : never,
    } as typeof postParams.embed;
  }

  if (replyTo) {
    postParams.reply = {
      root: root ?? replyTo,
      parent: replyTo,
    };
  }

  const response = await agent.post(postParams);
  return { uri: response.uri, cid: response.cid };
}

/**
 * Post text with a YouTube trailer link card embed.
 * Uses the actual trailer name from TMDB for the link card title.
 * Posts the link card without a thumbnail if upload fails.
 * Falls back to image embed only when no YouTube URL is available.
 */
export async function postWithTrailer(
  agent: AtpAgent,
  text: string,
  trailerUrl: string,
  movieTitle: string,
  trailerName: string,
  fallbackPoster: PosterImage | null,
  replyTo?: { uri: string; cid: string },
  root?: { uri: string; cid: string },
): Promise<{ uri: string; cid: string }> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  const postParams: Parameters<typeof agent.post>[0] = {
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  };

  const ytKey = youtubeKeyFromUrl(trailerUrl);
  let usedTrailer = false;
  if (ytKey) {
    const thumb = await uploadYouTubeThumbnail(agent, ytKey);
    const external: External = {
      uri: trailerUrl,
      title: `${movieTitle} — ${trailerName}`,
      description: '',
      ...(thumb ? { thumb: thumb as External['thumb'] } : {}),
    };
    postParams.embed = {
      $type: 'app.bsky.embed.external',
      external,
    } as typeof postParams.embed;
    usedTrailer = true;
  }

  if (!usedTrailer && fallbackPoster) {
    const images = await uploadImages(agent, [fallbackPoster]);
    postParams.embed = {
      $type: 'app.bsky.embed.images',
      images: images as typeof postParams.embed extends { images: infer I } ? I : never,
    } as typeof postParams.embed;
  }

  if (replyTo) {
    postParams.reply = {
      root: root ?? replyTo,
      parent: replyTo,
    };
  }

  const response = await agent.post(postParams);
  return { uri: response.uri, cid: response.cid };
}
