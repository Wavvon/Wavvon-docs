# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this repo is

**Wavvon-docs** — the architecture wiki and API contract for Wavvon, a
self-hosted, federated voice+text community platform. No code, no build step:
Markdown plus `openapi.yaml`.

```
docs/            the wiki — 87 documents. Start at docs/README.md.
ROADMAP.md       an index over the issue trackers, future-features.md, Ideas
openapi.yaml     the hub HTTP API contract
CONTRIBUTING.md  branching model and workflow for every Wavvon repo
COMPARISON.md    feature comparison
assets/          images used by the docs
.github/         CI: the doc-link check
scripts/         check-openapi-coverage.mjs, check-doc-links.mjs,
                 check-doc-paths.mjs, make-social-previews.mjs
```

Sibling repos:

| Repo | Contents |
|---|---|
| [Wavvon-server](https://github.com/Wavvon/Wavvon-server) | Rust workspace: hub, farm, identity/store crates, seed |
| [Wavvon-clients](https://github.com/Wavvon/Wavvon-clients) | Web + desktop clients, shared TS packages, voice crate |
| [Wavvon-discovery](https://github.com/Wavvon/Wavvon-discovery) | Optional public hub directory site |

Commit to **`main`** — this repo has no `develop`. See `CONTRIBUTING.md`.

---

## The wiki

`docs/README.md` is the index and the reading order. **Read it before grepping**
for "how does X work" — it cross-references the right documents and, from there,
the right source files. The big topics (multi-device, home hubs, alliances,
federation, farm model, anti-spam, voice transport, recovery attestation) are
already captured; don't re-derive what's documented.

The wiki is optimized for **why** and **where**, not **what**. Code is
authoritative for what. If a document starts restating code, that's the signal to
cut it back to rationale and pointers.

New documents go under `docs/` **and into `README.md`'s reading order** — a doc
nobody can find from the index is a doc nobody reads. Keep files under ~200
lines; split when they grow.

`scripts/check-doc-links.mjs` enforces that, and CI runs it on every push and
PR. It fails on a document with no inbound link, and on a relative `.md` link
that resolves to nothing. Both had already happened: `state-access-design.md`
sat undecided for six weeks because nothing pointed at it, `getting-started.md`
was unreachable from anywhere, and three links in `shipped-log.md` aimed inside
`docs/` at files that live at the repo root. Link syntax inside backticks or a
fenced block is ignored, so writing *about* the convention is safe.

### `docs/decisions.md`

The design rationale log. Newest entry at the **top**. Each entry:
**decision / alternatives considered / tradeoff / outcome**.

- When a decision supersedes an earlier one, mark the earlier entry with a status note. **Never delete it** — the record of what was tried is the point.
- Older entries move verbatim to `decisions-archive.md`.
- Reopening a settled question (for example "why not SQLite on the hub", "why federated rather than centralized") means writing a *new* entry, not editing the old one, and not re-litigating from memory.

### `docs/shipped-log.md`

The full historical record of delivered work. **This** is where "what did we
build recently" lives — not `ROADMAP.md`.

### `ROADMAP.md` and what it indexes

`ROADMAP.md` is an **index**, kept at the repo root because
`Wavvon-server/README.md` links it publicly. The work is split by **how
committed we are** — one question, so an item has exactly one home
(decisions.md, 2026-08-21):

| Where | Contains | Reads as |
|---|---|---|
| **Issues** on [Wavvon-server](https://github.com/Wavvon/Wavvon-server/issues) / [Wavvon-clients](https://github.com/Wavvon/Wavvon-clients/issues) | designed work in flight, blocked work, open bugs | what we're working on |
| `docs/future-features.md` | intent settled, design pending | what we'll work on |
| **[Ideas](https://github.com/Wavvon/Wavvon-docs/discussions/categories/ideas)** discussions | not committed to | what we might do |

Items move right to left: a wish we decide to pursue becomes a future feature,
and becomes an issue once it is designed. `ROADMAP.md` itself carries only the
index and 💤 Won't do, which is a decision list rather than a plan.

**Open work moved to the trackers on 2026-09-16** (decisions.md), and
`docs/next-up.md` and `docs/wishlist.md` were **deleted** the same day — a
pointer file is a second home, and two homes for one item drift. `gh issue
list --repo Wavvon/Wavvon-server` (and `--repo Wavvon/Wavvon-clients`) is how
you see open work from here. Don't recreate either file; if something needs
saying about *how* the trackers are used, it goes in this file or in
`CONTRIBUTING.md`.

- **Open an issue when the work becomes available to someone else**, not as a
  second copy of a plan. The file says "we will"; the issue says "this can be
  picked up now". Two homes for one item always drift — so nothing is
  mirrored.
- **Close via the PR**, never by hand: `Fixes #N` in the PR body closes the
  issue when it merges to `develop` (the default branch on all three code
  repos).
- **A milestone is the release, not the fix.** Set `v<version>` when the work
  lands; the milestone closes when the tag leaves `main`.
- **Bugs are open, not necessarily scheduled** — an open issue says it is real
  and unfixed, not that anyone is on it.
- **Rationale does not go in an issue.** A paragraph of *why* belongs in the
  design doc or in `decisions.md`; the issue links to it. Issue bodies are not
  link-checked by CI, so a relative wiki link there rots silently — use full
  `https://github.com/Wavvon/Wavvon-docs/blob/main/docs/…` URLs.
- Anything shipped is **deleted** from `future-features.md`, never annotated as
  "shipped" or "deferred tail". It moves to `shipped-log.md`.
- Once a design doc lands under `docs/`, the item graduates out of
  `future-features.md` and into an issue.
- A deliberate refusal is closed **as not planned**, linking `decisions.md` —
  that is what stops the same proposal coming back.

### `openapi.yaml`

The hub HTTP API contract. `scripts/check-openapi-coverage.mjs` checks it against
the hub's routes. When the server repo adds or changes an endpoint, this file is
part of that change — a spec that drifts from the implementation is worse than no
spec.

---

## Project invariants a document must not contradict

These are settled. If a draft conflicts with one, the draft is wrong — or it
needs a new `decisions.md` entry arguing the change explicitly.

- **Federated, not centralized.** No single source of truth across hubs. Designs needing global coordination must justify the cost.
- **Two-axis state.** Community-axis state (channels, messages, roles) lives on community hubs; personal-axis state (prefs, DM history, block/mute/ignore, home hub list, custom themes, drafts) lives on the user's home hub(s). Never mixed.
- **Identity is a keypair, not an account.** No email, no password, no username. Multi-device via a BIP39 master phrase plus signed per-device subkey certs.
- **PostgreSQL is the hub's only storage backend.**
- **Wire-format changes are cross-repo operations** — the server's `identity` crate, the hub, the desktop Rust shell and the clients' TypeScript must match byte-for-byte, pinned by shared test vectors.
- **Clients branch on hub `capabilities` strings, never on version numbers.**

---

## Conventions

- Prose in this repo is English. Code comments (in the other repos) are English too.
- Relative links between documents: `[multi-device.md](multi-device.md)`, and `[ROADMAP.md](../ROADMAP.md)` from inside `docs/`.
- Point at code with repo-relative paths and name the repo: `Wavvon-server: crates/hub/src/routes/`.
- Competitor references are allowed — factual, no logos, no disparagement.
- Don't write source code here. Design output is a plan the server/clients repos implement.
