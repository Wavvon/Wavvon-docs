#!/usr/bin/env node
// Renders the 1280x640 social preview cards GitHub shows when a repo link is
// shared. One per repo, from the same mark and palette as assets/icon.svg.
//
// GitHub has no API for the social preview, so uploading stays a manual step:
// Settings -> General -> Social preview -> Upload an image, per repo.
//
//   node docs/scripts/make-social-previews.mjs
//
// `sharp` is not a dependency of this repo; the script resolves it from a
// sibling checkout that already has it rather than adding one here for four
// images that change about never.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, "..", "assets");

const require = createRequire(import.meta.url);
let sharp;
for (const from of ["../../discovery/package.json", "../package.json"]) {
  try {
    sharp = require(require.resolve("sharp", { paths: [dirname(resolve(here, from))] }));
    break;
  } catch { /* try the next checkout */ }
}
if (!sharp) {
  console.error("sharp not found. Run `pnpm add -D sharp` in a sibling checkout, or `npx sharp-cli`.");
  process.exit(1);
}

const BG = "#1a1a2e";
const ACCENT = "#A78BFA";
const TEXT = "#e0e2ed";
const MUTED = "#9ba1b8";

const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Courier New', monospace";
const SANS = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const CARDS = [
  { file: "social-server", name: "server", line: "The hub binary — Rust, PostgreSQL, WebSocket, federation" },
  { file: "social-clients", name: "clients", line: "Web and desktop — React, Tauri, voice, encrypted DMs" },
  { file: "social-discovery", name: "discovery", line: "The public hub directory — browse, register, find a room" },
  { file: "social-docs", name: "docs", line: "Architecture, wire format, API spec, decisions" },
];

// The six triangles of assets/icon.svg, on its own 100-unit canvas. Kept as
// literal geometry so this script has no SVG parser and no build step.
const MARK = [
  "53.46,52 89.46,52 71.46,83.18",
  "50,54 68,85.18 32,85.18",
  "46.54,52 28.54,83.18 10.54,52",
  "46.54,48 10.54,48 28.54,16.82",
  "50,46 32,14.82 68,14.82",
  "53.46,48 71.46,16.82 89.46,48",
];

function card({ name, line }) {
  const markSize = 132;
  const markX = 200;
  const markY = 214;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <defs>
    <filter id="round" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b"/>
      <feColorMatrix in="b" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 18 -7" result="t"/>
      <feComposite in="SourceGraphic" in2="t" operator="atop"/>
    </filter>
    <radialGradient id="glow" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1280" height="640" fill="${BG}"/>
  <rect width="1280" height="640" fill="url(#glow)"/>

  <svg x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" viewBox="0 0 100 100" overflow="visible">
    ${MARK.map((p) => `<polygon filter="url(#round)" points="${p}" fill="${ACCENT}"/>`).join("\n    ")}
  </svg>

  <text x="${markX + markSize + 44}" y="${markY + markSize / 2}"
        font-family="${MONO}" font-size="104" font-weight="600"
        fill="${TEXT}" letter-spacing="3" dominant-baseline="central">wavvon</text>

  <text x="${markX}" y="${markY + markSize + 78}"
        font-family="${MONO}" font-size="46" font-weight="600"
        fill="${ACCENT}" letter-spacing="2">/${name}</text>

  <text x="${markX}" y="${markY + markSize + 138}"
        font-family="${SANS}" font-size="30" fill="${MUTED}">${line}</text>

  <rect x="0" y="632" width="1280" height="8" fill="${ACCENT}"/>
</svg>`;
}

mkdirSync(assets, { recursive: true });
for (const c of CARDS) {
  const svg = card(c);
  writeFileSync(resolve(assets, `${c.file}.svg`), svg);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(resolve(assets, `${c.file}.png`));
  console.log(`assets/${c.file}.png`);
}
