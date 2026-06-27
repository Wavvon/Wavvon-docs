#!/usr/bin/env node
// Compare the hub's registered axum routes against the paths documented in
// openapi.yaml. Fails (exit 1) when a route exists in code but not in the
// spec; spec paths with no matching route are reported as warnings (they may
// be intentional, e.g. documented-but-gated endpoints).
//
// Usage: node scripts/check-openapi-coverage.mjs [path-to-Wavvon-server-checkout]
//   default checkout location: ../hub (local layout) or _hub (CI)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const hubArg = process.argv[2];
const hubRoot = hubArg
  ? hubArg
  : ["../hub", "_hub"].map((p) => join(repoRoot, p)).find(existsSync);

if (!hubRoot || !existsSync(join(hubRoot, "hub", "src", "server.rs"))) {
  console.error(
    `check-openapi-coverage: Wavvon-server checkout not found (tried ${hubRoot ?? "../hub, _hub"})`,
  );
  process.exit(2);
}

const serverRs = readFileSync(join(hubRoot, "hub", "src", "server.rs"), "utf8");

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

console.log(
  `openapi coverage OK: ${codePaths.size} registered routes all documented (spec has ${specPaths.size} paths).`,
);
