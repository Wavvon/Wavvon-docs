# Discovery v2

Four enhancements to the Wavvon-discovery service (the Next.js directory
described in [hub-discovery.md](hub-discovery.md), Layer 2): hub uptime
tracking, farm browsing, global search, and anonymous aggregate
analytics. All four are wishlist items in
[`../ROADMAP.md`](../ROADMAP.md) under "Discovery enhancements."

These extend the existing stack — Next.js route handlers, `better-sqlite3`
for storage (`discovery/src/lib/db.ts` in Wavvon-discovery), and
`@noble/ed25519` for signed self-listings (`discovery/src/lib/verify.ts`).
No new infrastructure, no new service.

The constraint that shapes every decision here is **sovereignty**:
discovery is a catalog, not a surveillance layer. It knows what operators
choose to publish about their hubs, farms, bots, games, and templates —
nothing about who uses them, what they say, or who looks them up.
Discovery probes hubs; hubs do not report to discovery, and users are
never an entity discovery tracks.

---

## Feature 1 — Hub uptime tracking

**Decision.** A background job pings every registered hub's public
`GET {hub_url}/info` endpoint every 15 minutes with a 5-second timeout.
Success is HTTP 200 within the timeout. Each result is one row in a new
`hub_pings(hub_pubkey, checked_at, success INTEGER)` table. The hub
listing page shows a 7-day uptime percentage —
`COUNT(success=1) / COUNT(*)` over the trailing window — and a warning
badge if the most recent check failed. Rows older than 30 days are
deleted by a daily prune (30 days × 96 checks/day ≈ 2880 rows per hub,
bounded).

**Alternatives considered.**

- **User-driven uptime** — browser clients ping hubs and report
  reachability. Rejected: it leaks which users checked which hubs, which
  is exactly the user-level tracking the sovereignty principle forbids,
  and it requires user cooperation for a signal discovery can gather
  itself.
- **Hub self-reporting heartbeat.** The farm admin panel design
  ([farm-impl.md](farm-impl.md)) already has hubs heartbeating to their
  farm. Rejected for reuse here: discovery is a different relationship.
  Hubs authenticate to their farm; they do **not** authenticate to
  discovery. Discovery probes hubs anonymously over the same public
  `/info` any client hits. Conflating the two would make discovery a
  trusted reporting target, which it deliberately is not.

**Tradeoff that decided it.** Server-side probing is the only mechanism
that needs no trust relationship and no user identity. It costs discovery
one outbound request per hub per 15 minutes — trivial at the catalog's
scale (hundreds to low thousands of hubs) — and the pruned table stays
small.

**Implementation (all in Wavvon-discovery).**

- `db.ts`: add the `hub_pings` table to `migrate()` with an index on
  `(hub_pubkey, checked_at)`; add `recordPing`, `uptimePercent(pubkey)`,
  `lastPingFailed(pubkey)`, and `prunePings()` helpers.
- A scheduler. Next.js route handlers don't run on a timer by
  themselves; pick one of two and record the choice in `decisions.md`
  when built: (a) a platform cron (Vercel Cron / Cloudflare Cron)
  hitting an internal `POST /api/cron/ping` and `POST /api/cron/prune`
  guarded by a shared secret header, or (b) a small sibling Node process
  (`scripts/uptime-worker.ts`) using `node-cron` when self-hosted. The
  pinger reuses the existing `fetchHubInfo` from
  `discovery/src/lib/scrape.ts` — a 200 there is also the listing
  re-verification signal, so uptime checks and `last_verified_at`
  refresh share one fetch.
- Listing UI: the hub card and `/hub/<pubkey>` page render the uptime
  percentage and the offline warning badge.

**Deferred.** Real-time status (WebSocket push to the listing page),
latency/response-time tracking, and a public `GET /api/status/:pubkey`
status-page API.

---

## Feature 2 — Farm browsing

**Decision.** A dedicated catalog, API, and page for managed farms —
infrastructure providers that host hubs for communities who don't want to
run a server. A new `farms` table:

```
farms(
  farm_pubkey       TEXT PRIMARY KEY,
  farm_url          TEXT,
  name              TEXT,
  description       TEXT,
  icon              TEXT,
  pricing_tiers     TEXT,   -- JSON: [{"name","max_members",...}]
  capacity_available INTEGER,
  join_url          TEXT,   -- optional farm-owned onboarding page
  listed_at         TEXT,
  last_verified_at  TEXT
)
```

Farms self-register with the same signed-listing primitive as hubs and
bots: `POST /api/farms/register` carries a payload signed by the farm's
Ed25519 key; discovery fetches `GET {farm_url}/farm/info` to confirm the
key matches, verifies the signature and the ≤5-minute nonce, then upserts.
`DELETE /api/farms/register` (signed) withdraws. `GET /api/farms` browses
with `?q=` and `?has_free_tier=true` filters, returning
`{ farms: [...], total }`. A `/farms` page in the Next.js app mirrors the
hub-listing UI; each card shows name, description, tiers, current
capacity, and a **Join** button. Capacity is refreshed periodically by
the same probe mechanism as Feature 1, pinging `GET {farm_url}/farm/info`.

The Join button links to the hub creation wizard at `/new?farm={farm_url}`
(the wishlist's "Hub creation wizard on discovery"), or to the farm's own
`join_url` when it provides one.

**Alternative considered.** Model farms as hub listings with a `farm`
tag. Rejected: a farm is an infrastructure provider, not a community.
Its metadata (pricing tiers, available capacity, onboarding URL) has no
overlap with a hub's (security level, invite-only, language), and the
user intent differs — "pick a host" versus "join a community." Folding
them into one catalog would muddy both the schema and the browse UX.

**Tradeoff that decided it.** A separate catalog costs one more table and
one more page but reuses the entire signed-listing verification path
(`verify.ts`, `canonical.ts`, the nonce/replay check in
`api/hubs/route.ts`). The duplication is shape-only; the security
primitive is shared.

**Implementation (all in Wavvon-discovery).**

- `db.ts`: `farms` table + `listFarms`, `getFarm`, `upsertFarm`,
  `deleteFarm`, mirroring the hub helpers (JSON-encode `pricing_tiers` on
  write, parse on read, same as `tags`).
- `api/farms/register/route.ts` and `api/farms/route.ts`, following the
  `validateAndUpsert` pattern in `api/hubs/route.ts`. Factor the shared
  nonce/signature/`/info`-match validation into `lib/verify.ts` so hubs
  and farms don't drift.
- `app/farms/page.tsx` plus a `FarmCard` component.
- Farm side (Wavvon-server, `seed/` crate — the farm controller): farms
  must expose `GET /farm/info` returning at least `{ public_key, name,
  description, icon, pricing_tiers, capacity_available }`, and sign the
  registration payload with the farm key. This contract is owned by the
  backend-engineer; this doc only specifies the discovery-facing shape.

**Deferred.** Per-tier live pricing in a billing currency, farm reviews
or ratings, and capacity reservations/holds during the join flow.

---

## Feature 3 — Global search

**Decision.** One search box across all discovery catalogs.
`GET /api/search?q=<query>&types=hubs,bots,games,farms,templates` — the
`types` param selects which catalogs to query (defaults to all). The
response is a unified shape:

```ts
{ results: { type, id, name, description, url, icon, tags }[] }
```

Each catalog already has a `LIKE`/FTS query (`listHubs`, `listBots`,
etc.). Global search runs the selected ones in parallel with
`Promise.all`, then merges and ranks: exact name match first, then
description match, then tag match. A global (multi-type) search caps each
type at 5 results to keep the combined response fast; a single-type
search (`?type=hubs`) keeps the existing 20-per-page pagination. The UI is
a top-level search bar on the landing page and nav, rendering a grouped
dropdown (Hubs / Bots / Games / Farms / Templates), each result linking
to its detail page.

**Alternative considered.** A dedicated search service (Elasticsearch /
Meilisearch). Rejected: the catalogs are small — hundreds to low
thousands of entries each — so SQLite FTS5 covers it with no operational
overhead, no second datastore to deploy, secure, and keep in sync. If
volumes ever reach a scale where FTS5 strains, that's a future decision
with real data behind it, not a speculative one now.

**Tradeoff that decided it.** Fan-out-and-merge over the existing
per-catalog queries means no new index to maintain and no new failure
mode — if one catalog query errors, the others still return. The cost is
a slightly less sophisticated ranking than a purpose-built engine, which
is acceptable for the result volume.

**What is never indexed.** Message content (privacy — discovery has no
access to it anyway), user profiles (discovery has no user accounts), and
hub member lists. The index covers only operator-published catalog
metadata.

**Implementation (all in Wavvon-discovery).**

- `lib/search.ts`: per-catalog search functions returning the unified
  `SearchResult` shape, plus `globalSearch(q, types)` doing the
  `Promise.all` + rank + per-type cap.
- `api/search/route.ts`.
- A `GlobalSearchBar` component in the nav with the grouped dropdown.
- Games and templates are catalog types referenced by the wishlist (games
  exist per [gaming.md](gaming.md); templates are the "Hub config
  templates" wishlist item). Search degrades gracefully: a `types` entry
  for a catalog that isn't built yet returns an empty section rather than
  an error.

**Deferred.** Typo-tolerant / fuzzy matching, search-as-you-type
debounce tuning, and weighting by uptime or recency.

---

## Feature 4 — Anonymous aggregate analytics

**Decision.** A public ecosystem dashboard showing aggregate, anonymised
counts — and nothing else. `GET /api/analytics` returns recomputed-hourly,
cached JSON (no live queries on page load); `/analytics` renders charts.
No auth, because the data exposes nothing worth protecting. Counted:

- total registered hubs, bots, games, farms;
- hubs-by-tag histogram (top 10 tags);
- new registrations per week (last 12 weeks);
- **active hubs** — registered hubs that have **not** failed Feature 1's
  uptime check for 7+ consecutive days.

**Hub count integrity.** Two metrics, both meaningful: **registered**
(all-time registry size) versus **active** (currently reachable). A hub
offline 7+ days drops out of *active* but stays in *registered*. This is
the only place uptime data feeds analytics, and it's still a pure count —
no individual hub's status is exposed.

**Privacy guarantee.** No individual catalog entry is identifiable in any
analytics output. "12 hubs registered this week" tells you nothing about
which hubs, who operates them, or who their members are. Explicitly **not**
tracked, ever: user pubkeys, message counts (discovery has no access to
hub message data), user locations, IP addresses, and search queries
(who searched for what is never logged or counted).

**Alternative considered.** Per-hub stats — member counts, message
volume, activity graphs. Rejected: this requires hubs to report private
operational data to discovery, inverting the probe relationship and
making discovery a data sink for what communities do. Wavvon's ethos is
that the project does not know what communities do with the software
([decisions.md](decisions.md), [threat-model.md](threat-model.md)).
Counts of the catalog discovery itself maintains are the only data
discovery legitimately has.

**Tradeoff that decided it.** Catalog-only counts are strictly less
interesting than usage analytics — but usage analytics would require
either user tracking or hub reporting, both of which violate the
sovereignty principle. The dashboard is intentionally a measure of the
*registry*, not of *activity inside hubs*, and that boundary is the whole
point.

**Implementation (all in Wavvon-discovery).**

- `lib/analytics.ts`: `computeAnalytics()` running the count queries
  (including the active-hub join against `hub_pings`), cached in-memory
  with an hourly TTL or recomputed by the Feature 1 cron and stored in a
  single-row `analytics_cache(json TEXT, computed_at TEXT)` table.
- `api/analytics/route.ts` serving the cached JSON.
- `app/analytics/page.tsx` rendering charts from the JSON.

**Deferred.** Per-week active-hub trend (vs. just current active count),
geographic distribution of hubs (would need IP/location — out by
principle), and downloadable historical datasets.

---

## Feature 5 — Skin gallery

**Decision.** A catalog of user-submitted skins (the `.wavvonskin` files
from [custom-themes.md](custom-themes.md) §11), self-listed with the same
signed primitive as hubs and farms. A new `skins` table:

```
skins(
  id              TEXT PRIMARY KEY,  -- content hash of payload
  author_pubkey   TEXT,              -- signer + delete authority
  name            TEXT,
  base            TEXT,              -- built-in theme extended
  swatch_bg       TEXT,              -- --bg
  swatch_surface  TEXT,              -- --surface
  swatch_accent   TEXT,              -- --accent
  payload         TEXT,              -- full .wavvonskin JSON
  featured        INTEGER DEFAULT 0,
  listed_at       TEXT
)
```

The three swatch columns let the browse list render cards without shipping
the full skin JSON per entry.

`POST /api/skins/register` carries `{ payload, sig }` where `payload` is the
full `.wavvonskin` JSON bytes and `sig` is a base64url Ed25519 signature over
those bytes. Discovery verifies `sig` against the `author_pubkey` inside
`payload`, checks the ≤5-minute nonce, then upserts — mirroring
`validateAndUpsert` in `api/hubs/route.ts`. `DELETE /api/skins/register`
(signed, verified against the stored `author_pubkey`) withdraws.
`GET /api/skins?q=&base=&page=` browses, returning `{ skins: [...], total }`
with swatches but not payloads; `GET /api/skins/:id` returns the full body.
The `featured` flag is an operator-set sort hint — not a gate, identical to
hub listings.

**What discovery does NOT do.** Token value validation (the §7 security
allow-list in custom-themes.md) runs **client-side on import**, never
server-side on register. Discovery stores exactly what it receives; the client
rejects bad token values before applying. This keeps discovery a dumb catalog
and the validation rule in one place, shared across all three clients.

**Global search.** The `GET /api/search` fan-out (Feature 3) includes skins
as a `types` entry: `?types=hubs,bots,games,farms,templates,skins`. Skins
degrade gracefully if the table isn't built yet — an empty section rather
than an error.

**Tradeoff that decided it.** Like farms (Feature 2), a separate catalog costs
one table and one page but reuses the entire signed-listing path (`verify.ts`,
`canonical.ts`, the nonce/replay check). The duplication is shape-only; the
security primitive is shared. Server-side token validation was rejected because
it would duplicate the client's allow-list and let the two drift.

**Implementation (all in Wavvon-discovery).**

- `db.ts`: `skins` table + `listSkins`, `getSkin`, `upsertSkin`,
  `deleteSkin`, mirroring the hub helpers.
- `api/skins/register/route.ts` and `api/skins/route.ts`, following the
  shared `lib/verify.ts` validation.
- `app/skins/page.tsx` plus a `SkinCard` component (name, truncated author
  pubkey, base, three swatches).
- Client side (Wavvon-desktop / web / android): the `platform.skins` adapter
  gains `browse(query)` and `fetchSkin(id)`; owned by the frontend-engineer
  per custom-themes.md §11.

**Deferred.** Ranking by download count (needs an anti-gaming solution first),
an explicit curation queue, and skin version updates (re-listing a new
`version` under the same name).

---

## What's deferred (all features)

- **Real-time hub status** — WebSocket push, latency tracking,
  `GET /api/status/:pubkey` (Feature 1).
- **Farm billing/reviews/reservations** (Feature 2).
- **Fuzzy search and uptime/recency-weighted ranking** (Feature 3).
- **Active-hub trend lines and historical dataset export** (Feature 4).
- **Scheduler choice** — platform cron vs. sibling Node worker is left to
  the implementing engineer and recorded in `decisions.md` when built;
  both Feature 1 pinging and Feature 4 recompute share whichever is
  chosen.

---

## Contracts summary (who owns what)

| Piece | Repo | Owner |
|---|---|---|
| `hub_pings`, `farms`, `analytics_cache` tables + helpers | Wavvon-discovery (`discovery/src/lib/db.ts`) | frontend-engineer |
| Ping/prune/analytics scheduler | Wavvon-discovery (`scripts/` or `api/cron/`) | frontend-engineer |
| `/api/farms`, `/api/search`, `/api/analytics` routes + pages | Wavvon-discovery (`discovery/src/app/`) | frontend-engineer |
| Shared signed-listing validation | Wavvon-discovery (`discovery/src/lib/verify.ts`) | frontend-engineer |
| `GET /farm/info` + signed farm registration | Wavvon-server (`seed/` crate) | backend-engineer |
| `skins` table + helpers, `/api/skins` routes + page | Wavvon-discovery (`discovery/src/lib/db.ts`, `discovery/src/app/`) | frontend-engineer |
| `platform.skins` adapter (`browse`, `fetchSkin`) in clients | Wavvon-desktop / Wavvon-web / Wavvon-android | frontend-engineer |

See [hub-discovery.md](hub-discovery.md) for the signed-listing primitive
these features extend, and [farm-model.md](farm-model.md) /
[farm-impl.md](farm-impl.md) for the farm side of Feature 2.
