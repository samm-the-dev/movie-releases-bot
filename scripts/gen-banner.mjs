/**
 * Generate 1500x500 banner JPG for Bluesky profile.
 * Dark center with 14 discrete vertical red columns on each side,
 * fading from edges inward to the 1/3 mark.
 *
 * Usage: node scripts/gen-banner.mjs
 * Output: assets/banner.svg
 */
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

const W = 1500;
const H = 500;
const SCALE = 4;

mkdirSync('assets', { recursive: true });

const fontBuffer = readFileSync('assets/Quicksand-SemiBold.ttf');
const fontBase64 = fontBuffer.toString('base64');

const BASE = '#0d1117';

// 14 vertical columns per side, outer 1/3 each
const STEPS = 14;
const SIDE_W = W / 6;
const STEP_W = SIDE_W / STEPS;

const columns = [];
for (let i = 0; i < STEPS; i++) {
  // i=0 outermost (brightest red), i=13 innermost (dimmest, near base)
  const t = i / (STEPS - 1); // 0 (edge) to 1 (inner)
  // Fade from red into the base color (0d1117 = 13,17,23)
  const fade = Math.pow(1 - t, 1.5);
  const r = Math.round(13 + (90 - 13) * fade);
  const g = Math.round(17 + (12 - 17) * fade);
  const b = Math.round(23 + (12 - 23) * fade);

  // Left side
  const xL = i * STEP_W;
  columns.push(`<rect x="${xL}" y="0" width="${STEP_W + 1}" height="${H}" fill="rgb(${r},${g},${b})"/>`);

  // Right side
  const xR = W - (i + 1) * STEP_W;
  columns.push(`<rect x="${xR}" y="0" width="${STEP_W + 1}" height="${H}" fill="rgb(${r},${g},${b})"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face {
        font-family: 'Quicksand';
        font-weight: 600;
        src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
      }
    </style>
  </defs>

  <!-- Dark base -->
  <rect width="${W}" height="${H}" fill="${BASE}"/>

  <!-- Red vertical columns (14 per side, outer 1/3) -->
  ${columns.join('\n  ')}

  <!-- Tagline text -->
  <text x="50%" y="52%"
    font-family="Quicksand, sans-serif"
    font-weight="600"
    font-size="48"
    fill="#e0e0e0"
    fill-opacity="0.85"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="1">Now showing. Now streaming.</text>
</svg>`;

writeFileSync('assets/banner.svg', svg);

console.log('Generated assets/banner.svg');
