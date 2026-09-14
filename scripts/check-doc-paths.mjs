#!/usr/bin/env node
// Every source path a doc cites must exist.
//
// The class of drift this catches: a module is split or renamed, and the docs
// go on naming the old file. Nothing fails, nobody notices, and a reader is
// sent to a path that has not existed for months. Sixteen such citations were
// found by hand on 2026-09-14 (`routes/ws.rs` after ws became a directory,
// `store/src/migrations.rs` for a file in the hub crate, a deleted `seed`
// crate advertised in the README).
//
// Docs cite paths in a shorthand — `routes/paging.rs` for
// `server/crates/hub/src/routes/paging.rs` — so a citation counts as resolved
// when it is a *suffix* of a real path. That is deliberately lenient: the
// point is to catch paths that exist nowhere, not to police prefixes.
//
// Run from the repo root of Wavvon-docs with the sibling repos checked out
// beside it; with no siblings it still checks this repo's own citations.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = resolve(DOCS_REPO, "..");
const SIBLINGS = ["server", "clients", "discovery"].map((r) => join(CONTAINER, r)).filter(existsSync);
const ROOTS = [DOCS_REPO, ...SIBLINGS];

// Most citations name files in the sibling repos. Checked out alone — which is
// how CI sees this repo — there is nothing to resolve them against, and every
// one of them would look broken. Say so and pass rather than fail on absence.
if (SIBLINGS.length === 0) {
  console.log("doc paths: skipped — no sibling repos checked out beside this one.");
  process.exit(0);
}

const SKIP = new Set([
  "node_modules", "target", "target-pg17", "target-test", ".git", ".next",
  "dist", "dist-hub", "uploads", "playwright-report", "test-results", "coverage",
]);

// A citation inside these records what was true when it was written, or what
// was deleted on purpose. Both are legitimate reasons to name a path that is
// not there.
const RECORDS = new Set([
  "shipped-log.md", "decisions-archive.md", "decisions.md",
  "code-audit-2026-06-11.md", "security-audit-2026-07-04.md",
  "android-client.md", "client-monorepo.md", "custom-themes.md",
  "browser-client.md", "client-parity.md", "lobby-bot-survey.md",
  "android-rewrite-notes.md", "accessibility.md",
]);

// Design docs whose citations name files the design would create. Checking
// them would be checking a plan against the absence of its own execution.
const PLANS = new Set([
  "discovery-v2.md", "missions.md", "home-hub.md", "identity-vault.md",
  "screen-share-modal.md", "performance.md", "settings-ia.md",
  "hub-creation-wizard.md", "webauthn-auth.md",
]);

// Paths a doc tells the reader to create, and vendored trees this script
// deliberately does not walk.
const NOT_OURS = /^\.claude\/settings\.local\.json$|^node_modules\//;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    out.push({ path: p.replaceAll("\\", "/"), dir: e.isDirectory() });
    if (e.isDirectory()) walk(p, out);
  }
  return out;
}

const all = ROOTS.flatMap((r) => walk(r));
const suffixes = new Set();
for (const { path, dir } of all) {
  const parts = path.replaceAll("\\", "/").split("/");
  for (let i = 0; i < parts.length; i++) {
    const s = parts.slice(i).join("/");
    suffixes.add(s);
    if (dir) suffixes.add(s + "/");
  }
}

const CITE = /`([A-Za-z0-9_@.$/-]*\/[A-Za-z0-9_@.$/-]+)`/g;
const SOURCEY = /\.(rs|ts|tsx|js|jsx|mjs|json|toml|yml|yaml|sql|css|html|sh)$|\/$/;

const findings = [];
for (const { path, dir } of all) {
  if (dir || !path.endsWith(".md")) continue;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (RECORDS.has(name) || PLANS.has(name)) continue;
  const rel = path.slice(CONTAINER.length + 1);
  const text = readFileSync(path, "utf8");
  const seen = new Set();
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(CITE)) {
      const cited = m[1].replace(/[#:].*$/, "");
      if (seen.has(cited) || !SOURCEY.test(cited)) continue;
      // Shorthands and URLs, not paths.
      if (/^https?:|^@|^\.{1,2}\/|^\//.test(cited) || cited.includes("...")) continue;
      if (/^([a-z0-9-]+\.)+(io|com|org|net|dev)\//.test(cited)) continue;
      if (NOT_OURS.test(cited)) continue;
      seen.add(cited);
      if (suffixes.has(cited) || suffixes.has(cited + "/")) continue;
      findings.push({ rel, line: i + 1, cited });
    }
  });
}

if (findings.length === 0) {
  console.log(`doc paths OK: every cited source path resolves (checked ${ROOTS.length} repos).`);
  process.exit(0);
}
console.error(`${findings.length} cited paths do not exist:\n`);
for (const f of findings) console.error(`  ${f.rel}:${f.line}  ${f.cited}`);
console.error(`\nEither fix the citation or, if it records history, add the file to RECORDS or PLANS in ${"scripts/check-doc-paths.mjs"}.`);
process.exit(1);
