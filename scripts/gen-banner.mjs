/**
 * Generate 1500x500 banner PNG for Bluesky profile.
 * Dark theater interior with red wall glow + tagline in Quicksand.
 *
 * Usage: node scripts/gen-banner.mjs
 * Output: assets/banner.png
 */
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

const W = 1500;
const H = 500;

mkdirSync('assets', { recursive: true });

// Base64-encode the font for SVG embedding
const fontBuffer = readFileSync('assets/Quicksand-SemiBold.ttf');
const fontBase64 = fontBuffer.toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face {
        font-family: 'Quicksand';
        font-weight: 600;
        src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
      }
    </style>

    <!-- Dark center -->
    <linearGradient id="base" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>

    <!-- Red walls: horizontal gradient, full height -->
    <linearGradient id="walls" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#8b1a1a" stop-opacity="0.55"/>
      <stop offset="25%" stop-color="#3a0a0a" stop-opacity="0.15"/>
      <stop offset="50%" stop-color="#0d1117" stop-opacity="0"/>
      <stop offset="75%" stop-color="#3a0a0a" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#8b1a1a" stop-opacity="0.55"/>
    </linearGradient>

    <!-- Subtle overhead warm light -->
    <radialGradient id="overhead" cx="50%" cy="20%" r="40%">
      <stop offset="0%" stop-color="#3a2a1a" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0d1117" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Base dark background -->
  <rect width="${W}" height="${H}" fill="url(#base)"/>

  <!-- Red wall glows on sides -->
  <rect width="${W}" height="${H}" fill="url(#walls)"/>

  <!-- Subtle warm overhead -->
  <rect width="${W}" height="${H}" fill="url(#overhead)"/>

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
