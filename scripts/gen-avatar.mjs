/**
 * Generate a 400x400 profile avatar PNG.
 * Lucide "video" icon (MIT) with soft projector beam glow.
 *
 * Usage: node scripts/gen-avatar.mjs
 * Output: assets/avatar.png
 */
import { writeFileSync, mkdirSync } from 'fs';

const SIZE = 400;
const ICON_COLOR = '#ffffff';
const ICON_SIZE = 220;
const OFFSET_X = 55;
const OFFSET_Y = (SIZE - ICON_SIZE) / 2;
const SCALE = ICON_SIZE / 24;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="50%" stop-color="#1a2332"/>
      <stop offset="100%" stop-color="#151b23"/>
    </linearGradient>

    <!-- Soft projector glow: shifted right, tall-to-wide cone shape -->
    <radialGradient id="beam1" cx="75%" cy="50%" rx="28%" ry="35%">
      <stop offset="0%" stop-color="#d0d0d0" stop-opacity="0.16"/>
      <stop offset="50%" stop-color="#a0a0b0" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#607090" stop-opacity="0"/>
    </radialGradient>

    <!-- Wider cone spill expanding rightward -->
    <radialGradient id="beam2" cx="82%" cy="50%" rx="22%" ry="45%">
      <stop offset="0%" stop-color="#c0c8d0" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#1a2332" stop-opacity="0"/>
    </radialGradient>

    <!-- Tight bright core at lens exit -->
    <radialGradient id="core" cx="65%" cy="50%" rx="10%" ry="8%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="#c0c0c0" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

  <!-- Layered soft glow -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#beam2)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#beam1)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#core)"/>

  <g transform="translate(${OFFSET_X}, ${OFFSET_Y}) scale(${SCALE})">
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"
      stroke="${ICON_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="2" y="6" width="14" height="12" rx="2"
      stroke="${ICON_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/avatar.svg', svg);
console.log('Generated assets/avatar.svg');
