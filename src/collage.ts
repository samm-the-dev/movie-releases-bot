/**
 * Poster collage generator.
 *
 * Creates a single grid image from multiple movie posters using sharp.
 * Used when there are 5+ movies — below that, Bluesky's native album
 * handles it fine.
 */
import sharp from 'sharp';
import type { PosterImage } from './post-helpers.js';

/** Minimum number of posters to trigger collage (below this, use native album). */
export const COLLAGE_THRESHOLD = 5;

/** Poster dimensions in the grid. */
const POSTER_WIDTH = 200;
const POSTER_HEIGHT = 300;

/** Gap between posters. */
const GAP = 8;

/** Number of columns in the grid. */
const COLS = 3;

/** Dark background color. */
const BG_COLOR = { r: 24, g: 24, b: 24 };

/**
 * Create a poster collage from multiple images.
 * Returns a single JPEG PosterImage suitable for Bluesky upload.
 *
 * @param posters - Array of poster images (at least COLLAGE_THRESHOLD)
 * @returns A single PosterImage containing the grid collage
 */
export async function createCollage(posters: PosterImage[]): Promise<PosterImage> {
  if (posters.length === 0) {
    throw new Error('createCollage requires at least one poster.');
  }

  const rows = Math.ceil(posters.length / COLS);
  const width = COLS * POSTER_WIDTH + (COLS - 1) * GAP;
  const height = rows * POSTER_HEIGHT + (rows - 1) * GAP;

  // Resize each poster to fit the grid cell
  const resized = await Promise.all(
    posters.map((p) =>
      sharp(Buffer.from(p.data))
        .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: 'cover' })
        .toBuffer(),
    ),
  );

  // Position each poster in the grid
  const composites = resized.map((buf, i) => ({
    input: buf,
    left: (i % COLS) * (POSTER_WIDTH + GAP),
    top: Math.floor(i / COLS) * (POSTER_HEIGHT + GAP),
  }));

  const data = await sharp({
    create: { width, height, channels: 3 as const, background: BG_COLOR },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    data: new Uint8Array(data),
    mimeType: 'image/jpeg',
    alt: `Movie poster collage (${posters.length} movies)`,
  };
}
