#!/usr/bin/env node
// Compare the hub's registered axum routes against the paths documented in
// openapi.yaml. Fails (exit 1) when a route exists in code but not in the
// spec; spec paths with no matching route are reported as warnings (they may
// be intentional, e.g. documented-but-gated endpoints).
//
// Usage: node scripts/check-openapi-coverage.mjs [path-to-Wavvon-server-checkout]
//   default checkout location: ../server or ../Wavvon-server (local layout),
//   ../hub or _hub (CI)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const hubArg = process.argv[2];
const hubRoot = hubArg
  ? hubArg
  : ["../server", "../Wavvon-server", "../hub", "_hub"]
      .map((p) => join(repoRoot, p))
      .find(existsSync);

// The hub crate moved from hub/ to crates/hub/ in the workspace
// restructure; accept either layout so the check keeps working against
// older checkouts too.
const serverRsPath = hubRoot
  ? ["crates/hub/src/server.rs", "hub/src/server.rs"]
      .map((p) => join(hubRoot, p))
      .find(existsSync)
  : undefined;

if (!serverRsPath) {
  console.error(
    `check-openapi-coverage: Wavvon-server checkout not found (tried ${hubRoot ?? "../server, ../Wavvon-server, ../hub, _hub"})`,
  );
  process.exit(2);
}

const serverRs = readFileSync(serverRsPath, "utf8");

// Axum `.route("/path/:param", ...)` registrations. Normalise `:param` to
// `{param}` to match OpenAPI syntax.
// Parameter NAMES may legitimately differ between code and spec
// (`/channels/{channel_id}` vs `/channels/{id}`), so compare on shape:
// every parameter segment is normalised to `{}`.
const normalize = (p) =>
  p.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\{[^}]*\}/g, "{}");

const codePaths = new Set(
  [...serverRs.matchAll(/\.route\(\s*"([^"]+)"/g)].map((m) => normalize(m[1])),
);

const spec = readFileSync(join(repoRoot, "openapi.yaml"), "utf8");
// Path entries are two-space-indented keys under `paths:` like `  /auth/verify:`
const specPaths = new Set(
  [...spec.matchAll(/^ {2}(\/[^\s:]*):\s*$/gm)].map((m) => normalize(m[1])),
);

const missingFromSpec = [...codePaths].filter((p) => !specPaths.has(p)).sort();
const missingFromCode = [...specPaths].filter((p) => !codePaths.has(p)).sort();

if (missingFromCode.length) {
  console.warn(
    `WARNING — documented in openapi.yaml but not registered in hub/src/server.rs (${missingFromCode.length}):`,
  );
  for (const p of missingFromCode) console.warn(`  ${p}`);
}

if (missingFromSpec.length) {
  console.error(
    `FAIL — registered in hub/src/server.rs but missing from openapi.yaml (${missingFromSpec.length}):`,
  );
  for (const p of missingFromSpec) console.error(`  ${p}`);
  process.exit(1);
}

// SDK generators name methods after operationId; without one they derive a
// name from the path, so renaming a path would rename a public SDK method.
const lines = spec.split(/\r?\n/);
const noOpId = [];
const opIds = new Map();
let currentPath = null;
lines.forEach((line, i) => {
  const p = line.match(/^ {2}(\/[^\s:]*):\s*$/);
  if (p) {
    currentPath = p[1];
    return;
  }
  const m = line.match(/^ {4}(get|post|put|patch|delete|head|options):\s*$/);
  if (!m || !currentPath) return;
  const op = `${m[1].toUpperCase()} ${currentPath}`;
  let id = null;
  for (let j = i + 1; j < lines.length && /^( {6}|\s*$)/.test(lines[j]); j++) {
    const idLine = lines[j].match(/^ {6}operationId:\s*(\S+)\s*$/);
    if (idLine) id = idLine[1];
  }
  if (!id) noOpId.push(op);
  else opIds.set(id, [...(opIds.get(id) ?? []), op]);
});
const duplicateIds = [...opIds].filter(([, ops]) => ops.length > 1);
if (noOpId.length || duplicateIds.length) {
  for (const op of noOpId) console.error(`FAIL — no operationId: ${op}`);
  for (const [id, ops] of duplicateIds)
    console.error(`FAIL — operationId ${id} used by: ${ops.join(", ")}`);
  process.exit(1);
}

console.log(
  `openapi coverage OK: ${codePaths.size} registered routes all documented (spec has ${specPaths.size} paths, ${opIds.size} operationIds).`,
);
