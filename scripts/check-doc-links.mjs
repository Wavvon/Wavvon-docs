#!/usr/bin/env node
// Two checks over the wiki's own cross-references, both for failures that
// have actually happened here:
//
//   1. Broken links — a relative .md target that does not exist. Three of
//      these shipped: shipped-log.md pointed at code-audit-2026-06-11.md and
//      two siblings as if they lived under docs/, while they live at the repo
//      root, so every one of them 404'd on GitHub.
//   2. Orphans — a document with no inbound link from any other document.
//      CLAUDE.md already says "a doc nobody can find from the index is a doc
//      nobody reads", and nothing enforced it: state-access-design.md sat
//      undecided for six weeks because nobody could reach it, and
//      getting-started.md — the first thing a newcomer should read — was
//      unreachable from anywhere at all.
//
// Usage: node scripts/check-doc-links.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// The index roots. Nothing links *to* these; they are where a reader starts.
const ENTRY_POINTS = new Set(["README.md", join("docs", "README.md")]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".github", "assets"]);

// Every markdown file is checked for broken links, but only the wiki proper is
// checked for orphans: CLAUDE.md, CHANGELOG.md and `.claude/agents/*.md` are
// reached by tooling or by GitHub's own UI, not by a reader following the
// index, so "nothing links here" is their normal state.
const isWikiDoc = (rel) =>
  rel.startsWith(`docs${sep}`) || rel === "ROADMAP.md" || rel === "COMPARISON.md";

function findMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findMarkdown(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = findMarkdown(repoRoot);
const known = new Set(files.map((f) => relative(repoRoot, f)));
const linkedTo = new Set();
const broken = [];

// Inline links and reference definitions both, but only relative .md targets:
// external URLs and anchors within a page are somebody else's problem.
const LINK = /\]\(\s*(?!https?:|mailto:|#)([^)\s]+?\.md)(?:#[^)\s]*)?\s*\)/g;

// Both docs and the conventions written *about* them are full of link syntax
// used as an example — CLAUDE.md's own "relative links between documents" line
// is three of them. Code is illustration, not a reference, so blank it first.
const stripCode = (text) =>
  text.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");

for (const file of files) {
  const from = relative(repoRoot, file);
  const text = stripCode(readFileSync(file, "utf8"));
  for (const [, target] of text.matchAll(LINK)) {
    const decoded = decodeURIComponent(target);
    const resolved = relative(repoRoot, resolve(dirname(file), decoded));
    // A link that climbs out of the repo is as broken as one that misses.
    if (resolved.startsWith("..") || !known.has(resolved)) {
      broken.push(`${from.split(sep).join("/")} -> ${target}`);
      continue;
    }
    if (resolved !== from) linkedTo.add(resolved);
  }
}

const orphans = [...known]
  .filter((f) => isWikiDoc(f) && !ENTRY_POINTS.has(f) && !linkedTo.has(f))
  .sort();

if (broken.length) {
  console.error(`FAIL — links to .md files that do not exist (${broken.length}):`);
  for (const b of broken) console.error(`  ${b}`);
}

if (orphans.length) {
  console.error(
    `FAIL — documents with no inbound link, unreachable from the index (${orphans.length}):`,
  );
  for (const o of orphans) console.error(`  ${o.split(sep).join("/")}`);
  console.error(
    "  Add each to docs/README.md's reading order, or link it from the doc it belongs to.",
  );
}

if (broken.length || orphans.length) process.exit(1);

console.log(
  `doc links OK: ${known.size} documents, every relative .md link resolves, no orphans.`,
);
