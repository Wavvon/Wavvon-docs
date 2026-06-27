# Farm implementation — phases 1, 2 & 3

Detailed design for the first three phases of [farm-model.md](farm-model.md):
farm-level auth, hub multi-tenancy, and hub creation policy + admin
panel. The seven-step plan there is the *what*; this doc is the *how*
for steps 1-5 (folded into three implementation phases). Phases 6-7
are out of scope here.

> Status: designed, not built. The farm layer is on the wishlist; this
> doc exists so when the time comes a backend engineer can implement
> straight from it without re-deriving wire shapes.

## Resolved open questions (decisions up front)

The three forks that gate everything else, decided so the rest of the
doc has one shape to describe.

### Phase 1 ships first, by itself, against a single hub per farm

**Decision**: Phase 1 (farm-level auth) is deployable as a
single-tenant farm — one farm process, one hub. Phase 2 (multi-tenancy)
layers on without touching the auth wire.

**Why**: the migration risk lives entirely in the auth move (every
existing client breaks the day `/auth/*` moves off the hub). Decoupling
that move from the multi-tenancy work lets us stabilise the trust
boundary on a known-good single-hub deployment before adding the
"N hubs in one process" complexity. The farm-issued token shape, the
hub→farm verification path, and the `GET /farm/info` endpoint all carry
their own value before a second hub exists.

**Cost**: a single-hub farm is functionally equivalent to today's hub
(one community per process). Phase 1 alone changes the *trust model*,
not the *operator experience*. That is the entire point — get the trust
boundary right while it still affects one user.

### Farm and hub are separate binaries; the hub verifies tokens locally

**Decision**: `farm/` is a new crate in Wavvon-server alongside
`hub/`, `seed/`, `identity/`. It is its own binary. Hubs continue to
run as their own processes (one binary, possibly multiple instances
under one farm — see Phase 2). They communicate via HTTPS, not in-
process function calls.

**Why**:
- Two binaries can live on the same machine *or* on different machines.
  An operator who wants "all on one box" runs both processes locally;
  an operator who wants the hub on a beefy media server and the farm
  on a small auth box gets that for free.
- An embedded model (hub-as-library inside the farm process) would
  conflate two failure domains. A hub panic taking the farm's auth
  endpoint down with it is exactly the shape we don't want — auth
  outage stops every hub on the farm from accepting new sessions.
- The federation primitive already exists (`hub/src/federation/client.rs`
  in Wavvon-server). Hub→farm is the same shape, one new endpoint.

**Tradeoff**: a small per-request cost for the hub to verify tokens
against a (cached) farm pubkey. The next decision keeps that cost to
zero per request after the first warm-up.

### Hubs cache the farm's pubkey on startup; tokens verify locally with no network call

**Decision**: a farm-issued session token is an Ed25519-signed blob.
Hubs verify it locally using the farm's pubkey, which the hub caches
from `GET /farm/info` on startup (and re-fetches when verification
fails, capped at one refetch per minute to absorb a key rotation).

**Why this over "hub calls the farm to verify each request"**:
- The auth middleware is on every authenticated request. A network
  hop per request adds 1-5ms (LAN) to 20-100ms (different host) of
  latency to *everything* a logged-in user does. Unacceptable.
- The farm pubkey changes ~never (key rotation is a deliberate
  operator action, not a routine event). Caching for the lifetime of
  the process is correct.
- Local verification means the hub keeps working for already-issued
  tokens during a brief farm outage. The farm being down stops new
  sessions and renewals, not existing traffic. This matches the
  "hubs are mostly autonomous" mental model.

**Why this over "JWT with HS256 shared secret"**: shared-secret JWTs
require the farm and every hub to hold the same key. Adding a hub means
distributing the secret; rotating means rotating everywhere
simultaneously. Ed25519 + asymmetric verification means the farm holds
the private key alone; hubs hold only the public key, which is also
published at `/farm/info`. No secret distribution.

**Why a signed blob over a JWT structurally**: we already speak
Ed25519 everywhere (identity, hub-to-hub federation, alliance invite
tokens). One signing primitive across the whole protocol. JWT's
structural complexity (alg negotiation, JWS variants, `none` algorithm
foot-guns) buys nothing here. We use a fixed JSON shape with a
fixed signature suffix — same wire pattern as the alliance invite
token.

---

## Phase 1: Farm-level auth

### Goal

Move challenge/verify off the hub and onto the farm. A user
authenticates once per farm and the resulting session token works
against every hub on that farm without per-hub re-auth. The hub still
owns per-hub state (roles, display name, bans) but no longer issues or
verifies session tokens.

### New DB tables on the farm

The farm has its own SQLite database (`farm.db`), separate from any
hub's `hub.db`. Schema lives in a new
`farm/src/db/migrations.rs` (Wavvon-server).

#### `farms` (singleton)

A one-row table. The farm's own metadata.

| Column          | Type    | Notes                                       |
|-----------------|---------|---------------------------------------------|
| id              | INTEGER | Always `1`. CHECK constraint.               |
| public_key      | TEXT    | Ed25519 hex. Set on first start, immutable. |
| name            | TEXT    | Display name (operator-set).                |
| description     | TEXT    | Optional blurb.                             |
| directory_public| INTEGER | 0/1. Does `/farm/hubs` list publicly?       |
| created_at      | INTEGER | Unix.                                       |

The farm's Ed25519 keypair is generated on first start and stored
alongside the DB in `farm_identity.json` — exactly the same pattern as
`hub_identity.json` (`hub/src/main.rs:68` in Wavvon-server). The
`public_key` column on this table is a cached copy for cheap reads.

#### `farm_users`

Canonical per-farm user identity. A user appearing on multiple hubs
has one row here.

| Column          | Type    | Notes                                       |
|-----------------|---------|---------------------------------------------|
| public_key      | TEXT PK | Canonical user pubkey (master if paired).   |
| master_pubkey   | TEXT    | Nullable — legacy single-key users.         |
| first_seen_at   | INTEGER |                                             |
| last_seen_at    | INTEGER |                                             |

Note this table holds the *canonical* pubkey, the same resolution the
hub does today in `resolve_canonical_identity`
(`hub/src/auth/handlers.rs:29` in Wavvon-server). That logic moves to
the farm verbatim.

#### `pending_challenges`

Same shape as today's in-memory `state.pending_challenges` on the hub,
but persisted on the farm (so a farm restart doesn't strand a
mid-handshake client). TTL is 60s; rows past TTL are swept on read.

| Column         | Type    | Notes |
|----------------|---------|-------|
| public_key     | TEXT PK | The client's pubkey. |
| challenge_hex  | TEXT    | 32-byte random nonce, hex-encoded. |
| expires_at     | INTEGER | Unix.   |

#### `farm_sessions`

A farm-issued session token. The token *is* a signed blob (see "Token
shape" below) and not stored in this table — the table records
issuance and revocation only.

| Column          | Type    | Notes                                          |
|-----------------|---------|------------------------------------------------|
| jti             | TEXT PK | Random 16-byte hex. Token's unique ID.         |
| public_key      | TEXT    | FK → `farm_users.public_key`.                  |
| issued_at       | INTEGER | Unix.                                          |
| expires_at      | INTEGER | Unix. Default 30 days.                         |
| revoked_at      | INTEGER | Nullable. Set on explicit logout/revoke.       |
| scope           | TEXT    | `'member'` or `'lobby'` (forwarded as today).  |

The hub does *not* call this table — it verifies the token's signature
locally. The table exists so the farm can answer "is this jti
revoked?" via a `POST /farm/auth/revoke-check` endpoint that hubs hit
only when they want belt-and-braces (see "Revocation, briefly" below).

### Token shape

A farm session token is a base64url-encoded `payload | signature` pair,
where:

- `payload` = `serde_json::to_vec(&FarmToken)` — canonicalised
  (sort keys, no whitespace) so the same logical token always serializes
  identically.
- `signature` = `ed25519(farm_private_key, payload)`.

```json
{
  "v": 1,
  "iss": "https://farm.example.com",
  "iss_pk": "abc123...",
  "sub": "user_canonical_pubkey_hex",
  "master": "master_pubkey_hex_or_null",
  "jti": "16_byte_random_hex",
  "iat": 1748000000,
  "exp": 1750592000,
  "scope": "member"
}
```

The wire format the client sees and stores:

```
Authorization: Bearer <base64url(payload)>.<base64url(signature)>
```

A dot separator, not a JWT — explicit "this is not a JWT" via lack of
the header segment. The hub treats it as opaque: split on `.`, base64-
decode both parts, verify the signature with the cached farm pubkey,
deserialize the payload, check `exp`, check `iss_pk` matches the cached
farm pubkey (defence-in-depth against pubkey rotation), and use `sub`
as the canonical pubkey for the rest of the request.

**Why not a hub-stored opaque token (current shape)**: opaque tokens
would force the hub to ask the farm "who is this token?" on every
request. The whole point of moving auth to the farm was to avoid
that round-trip. A signed self-describing token gives the hub
everything it needs in one local hash check.

### `GET /farm/info`

Public, unauthenticated. Analogous to today's hub `GET /info`
(`hub/src/routes/health.rs:15` in Wavvon-server).

```json
{
  "kind": "wavvon-farm",
  "version": "0.1.0",
  "name": "example farm",
  "description": "...",
  "public_key": "<farm ed25519 hex>",
  "directory_public": true,
  "auth": {
    "challenge_url": "/auth/challenge",
    "verify_url": "/auth/verify",
    "renew_url": "/auth/renew"
  },
  "hubs": {
    "list_url": "/farm/hubs"
  },
  "policy": {
    "max_hubs_per_creator": 5,
    "hub_creation_open": false
  }
}
```

The `kind: "wavvon-farm"` discriminator lets a client probe a URL
without knowing whether it points at a farm or a legacy hub. A legacy
hub's `/info` does not have this field; clients use its presence to
branch.

The hub also fetches `/farm/info` on startup to cache `public_key` —
this is how the verification-without-network-call path stays correct
across farm key changes.

### Routes that move from hub to farm

| Old (on hub)         | New (on farm)        | Body shape                                    |
|----------------------|----------------------|-----------------------------------------------|
| `POST /auth/challenge` | `POST /auth/challenge` | unchanged (`{ public_key }`)               |
| `POST /auth/verify`    | `POST /auth/verify`    | unchanged shape, **scope** field now reflects farm-level state; per-hub gates (lobby, survey) stay on the hub |
| `POST /auth/renew`     | `POST /auth/renew`     | unchanged                                  |

The wire bodies *do not change*. Only the host they're sent to changes.
That is deliberate — it minimises the client-side migration to "switch
the base URL for these three endpoints."

The challenge nonce expansion (PoW security level proof) also moves to
the farm: it is per-farm policy now, not per-hub. See "What moves up
with auth" below.

### Routes that stay on the hub

Everything else. Specifically, the hub still runs:

- `POST /auth/verify`-style *gating* (lobby scope check, challenge
  token, survey) when the user **enters** that hub. The hub no longer
  issues a session token; it issues a per-hub *admission token* (or
  simply records the visit) on top of the farm token. See "Hub-side
  admission" below.
- Per-hub bans, roles, approval queues, invites, all moderation.
- All channel/voice/DM endpoints.

### What moves up with auth

These hub features become farm-level in Phase 1:

- **Challenge-response signature flow**.
- **Security-level PoW check** (`min_security_level`). Becomes a farm
  setting; one PoW proof per user applies to every hub on the farm.
- **Cross-device cert resolution** (`resolve_canonical_identity`). The
  farm is the source of truth for the user's canonical pubkey across
  paired devices.
- **Identity-axis state**: `subkey_revocations`, `subkey_certs`,
  `pairing`, `prefs`, `dh_keys`, `friends` (the personal-axis state
  listed in [home-hub.md](home-hub.md)). The farm *is* the home hub
  for users whose home hub list points at it. Other farms can also
  be in a user's home hub list — being a farm doesn't force this
  relationship.

These stay on the hub:

- **Approval queue, invite codes, lobby, survey, challenge token, bot
  invites**. All per-community gating.
- **Bans**. A ban is "this user is not welcome in this community."
  Cross-hub-ban federation is out of scope for Phase 1.
- **Roles and permissions**.

### Hub-side admission

After authenticating against the farm, a client targets a specific hub
by including the farm token in the `Authorization` header. The hub:

1. Verifies the token signature locally against its cached farm
   pubkey. Bad signature → `401 invalid_farm_token`.
2. Extracts `sub` (the canonical user pubkey).
3. Runs the existing per-hub admission checks: bans, approval status,
   lobby/PoW/challenge/survey gates as appropriate.
4. If admission passes, the request proceeds. The hub does *not* mint
   a separate token — the farm token is the only bearer credential.

The per-hub "first time this user has hit this hub" flow (insert a
`users` row, run the invite/approval gate, assign default roles) runs
inside the admission middleware. The existing logic in
`hub/src/auth/handlers.rs:258-381` (user upsert, approval flow,
role assignment) is preserved verbatim — it just runs on the first
authenticated request to the hub rather than during `/auth/verify`.

This means the hub's `auth/handlers.rs` mostly empties out. What
remains in `auth/middleware.rs` is the new verification path:

```
1. Pull "Authorization: Bearer <token>".
2. Split on ".", decode payload + signature.
3. ed25519_verify(state.cached_farm_pubkey, payload, signature).
4. Deserialize payload as FarmToken.
5. Check now < exp; check token.iss_pk == cached_farm_pubkey.
6. Optional: belt-and-braces revocation check against the farm
   (rate-limited, cached for 60s).
7. Run per-hub admission (bans, approval, lobby/scope).
8. Resolve to AuthUser { public_key: token.sub }.
```

Bot tokens — today a separate `bot_tokens` table on the hub — stay on
the hub for Phase 1. Bots authenticate against their hub directly as
they do now. (External bots may eventually want a farm-level token
shape; that is a Phase 3+ design problem.)

### Revocation, briefly

A signed token cannot be un-issued. Three layers handle this:

1. **Short expiry**: 30 days default. A revoked-then-leaked token
   stops being a problem after at most 30 days.
2. **Explicit revocation list on the farm**: `farm_sessions.revoked_at`.
   Logout marks the row revoked; a hub that wants stronger guarantees
   calls `POST /farm/auth/revoke-check { jti }` and caches the answer
   for 60s. Most hubs won't bother for chat traffic; this is here for
   the future "force-logout this device" UX.
3. **Farm key rotation**: in the disaster case, rotate the farm
   private key. Every existing token is now invalid. Operators do this
   ~never; the path exists so it isn't a panic when it's needed.

### Migration strategy

The hub is, today, a self-contained auth island. The migration is the
delicate part — every existing client is holding a hub-issued opaque
session token that the new code paths don't recognise.

Three-step rollout:

1. **Dual-issue on the hub** (one release). The hub starts running
   *both* the old code path (issue opaque tokens, validate them) and
   accepts the new farm-token shape. New clients can use either.
   No farm process exists yet; this is the on-ramp.
2. **Stand up the farm process**. Operators run `wavvon-farm` next to
   the hub. The hub gets configured with `WAVVON_FARM_URL=...`,
   fetches `/farm/info`, caches the pubkey. Clients are released that
   prefer farm tokens but fall back to hub tokens if the hub doesn't
   advertise farm support yet.
3. **Hub stops issuing opaque tokens** (one release later). The old
   `auth/handlers.rs` paths return `410 use_farm`. Clients still
   holding opaque tokens get the error, refresh against the farm,
   carry on.

Hub `/info` grows a `farm_url: string | null` field in step 1 to
advertise the migration state. Clients see it and branch:

```json
{
  "name": "my-hub",
  "version": "...",
  "farm_url": "https://farm.example.com",
  "...": "..."
}
```

When `farm_url` is null, the hub is in self-contained-auth mode
(today's behaviour, the post-Phase-1 default for un-farmed hubs).
When `farm_url` is set, clients route auth there.

This keeps the migration **opt-in per hub**: a hub operator who never
wants farms keeps `farm_url` null forever. The farm code path is
additive.

### Wire changes — Phase 1

A backend engineer implementing this should produce:

- **New `farm/` crate in Wavvon-server** mirroring `hub/`'s structure:
  `farm/src/main.rs`, `farm/src/server.rs`, `farm/src/state.rs`,
  `farm/src/db/migrations.rs`, `farm/src/routes/{health,auth,hubs}.rs`,
  `farm/src/token.rs` (sign/verify helpers).
- **`/farm/info`, `/auth/challenge`, `/auth/verify`, `/auth/renew`,
  `POST /farm/auth/revoke-check`** as documented above.
- **`hub/src/auth/middleware.rs` rewrite**: replace the opaque
  session lookup with the signed-token verification flow. Add a
  `cached_farm_pubkey: ArcSwap<Option<String>>` field to `AppState`
  in `hub/src/state.rs`, populated by a one-shot fetch on startup and
  refreshed on verification failure (rate-limited).
- **`hub/src/auth/handlers.rs` shrinks**: `challenge`, `verify`, `renew`
  return `410 Gone` in step 3 of the migration. The
  `resolve_canonical_identity` helper *moves* to the farm crate
  (and the per-hub user-row upsert moves into the admission
  middleware, see above).
- **`hub/src/state.rs`**: add `farm_url: Option<String>` and
  `cached_farm_pubkey: ArcSwap<...>`.
- **`hub/src/routes/health.rs::info`**: add `farm_url` to the JSON
  response.
- **Client changes** (`Wavvon-desktop`, `Wavvon-web`, `Wavvon-android`):
  the hub-detection step before `/auth/challenge` fetches `/info`;
  if `farm_url` is set, all `/auth/*` calls target the farm; the
  resulting `Authorization` header is used against the hub
  unchanged. No new client-facing UI in Phase 1 — the user does not
  know a farm exists yet.

---

## Phase 2: Hub multi-tenancy

### Goal

One farm process can host many hubs. Each hub is still an independent
community with its own channels, members, roles, DB. The change is
operational, not semantic — what used to be N hub processes becomes one
farm process plus N hub instances behind it.

### Process model: hubs stay separate processes, farm routes to them

**Decision**: hubs remain their own OS processes. The farm runs a
reverse proxy (in-process axum middleware, not a separate nginx) that
routes incoming requests to the correct hub process based on
`hub_id` in the URL.

**Why not "one process hosting N hubs"** (the literal reading of
"multi-tenancy"): a hub's `AppState` carries broadcast channels, voice
relay state, screen-share buffers, per-channel WS subscription sets.
Threading `hub_id` through every existing usage is invasive — every
`state.chat_tx`, every `state.voice_channels.read().await`, every
SQL query that today reads from `hub.db` would need to be
`hub_id`-scoped. The blast radius is the entire `hub/` crate.

Multiple processes give us, for free:
- One DB file per hub. Today's backup story (`cp hub.db
  backup-2026-05-27.db`) keeps working unchanged.
- Independent crash domains. A panic in one hub doesn't kill the
  others.
- Today's hub binary unchanged in shape — what differs is that the
  farm process spawns it (or coexists with operator-spawned
  instances) and proxies to it.

**Why not "one DB with a `hub_id` column partition"**: SQLite's
single-writer model means one busy hub stalls writes for the others.
Cross-tenant query bugs (forgetting a `WHERE hub_id = ?`) are a class
of vulnerability that doesn't exist with per-DB isolation. And the
per-hub SQLite file is part of what makes the hub easy to operate
today — combining them throws that away for nothing.

### Routing: path prefix `/hub/<hub_id>/...`

**Decision**: a request to `https://farm.example.com/hub/abc123/channels`
is routed to the hub instance whose id is `abc123`. Path prefix, not
subdomain.

**Why path prefix over subdomain**:
- TLS termination at the farm. One certificate, one cert renewal,
  one hostname to publish. Subdomains-per-hub need a wildcard cert or
  per-hub DNS records — both more operational complexity for the
  self-hoster the farm model targets.
- The farm is the URL the user remembers. `farm.example.com/hub/abc`
  reads as "hub `abc` on farm.example.com", which is the mental model.
- A directory-listing URL (`farm.example.com/farm/hubs`) sits cleanly
  next to hub URLs in the same namespace.

**Why not just `hub_id` as a query parameter**: query params don't
naturally route — every endpoint handler would need to extract and
dispatch. Path prefix lets axum's router do the dispatch once at the
top.

The farm's router:

```
GET  /farm/info              → farm handler
GET  /farm/hubs              → farm handler
POST /farm/hubs              → farm handler
POST /auth/challenge         → farm handler
POST /auth/verify            → farm handler
POST /auth/renew             → farm handler
*    /hub/<hub_id>/*         → proxy to hub at hubs[hub_id].upstream_url
```

The `<hub_id>` is an opaque short identifier (8-12 hex chars,
generated on hub creation). It is *not* the hub's pubkey — the pubkey
is long and exposes routing details. The mapping `hub_id →
upstream_url` lives in the new `hubs` table on the farm.

Inside the hub process, routes look the same as today — the path
prefix is stripped by the farm before proxying. A hub that
currently serves `GET /channels` continues to serve `GET /channels`;
the farm rewrites `/hub/abc/channels` → `/channels` before the
upstream call. This means **no changes to existing hub route paths**.

### New DB table on the farm: `hubs`

| Column            | Type    | Notes                                              |
|-------------------|---------|----------------------------------------------------|
| id                | TEXT PK | 8-12 hex chars. Generated on create.               |
| owner_pubkey      | TEXT    | FK → `farm_users.public_key`. Hub creator.         |
| name              | TEXT    | Display name (operator-set).                       |
| description       | TEXT    | Optional.                                          |
| visibility        | TEXT    | `'public'` or `'private'`.                         |
| upstream_url      | TEXT    | `http://127.0.0.1:3010` etc. — where the farm proxies to. |
| hub_pubkey        | TEXT    | The hub process's Ed25519 pubkey (cached from the hub's `/info`). |
| created_at        | INTEGER | Unix.                                              |
| max_users         | INTEGER | Per-hub cap. Nullable = no cap.                    |

`visibility` drives the `/farm/hubs` listing: public hubs appear in
the unauthenticated response; private hubs are reachable by direct
URL but not listed.

### `GET /farm/hubs` — listing endpoint

Public, unauthenticated. Returns only `visibility='public'` rows.

```json
{
  "hubs": [
    {
      "id": "abc12345",
      "name": "Friends of Foo",
      "description": "...",
      "hub_pubkey": "<hub ed25519 hex>",
      "url": "https://farm.example.com/hub/abc12345",
      "created_at": 1748000000
    }
  ]
}
```

`GET /farm/hubs?include=private` (authenticated, hub-owner or
farm-admin only) includes private hubs too — used by the operator's
admin UI.

The two-axis directory rule from
[farm-model.md](farm-model.md) ("farm AND hub admin both opt in")
maps cleanly here: `farms.directory_public` gates whether the farm
publishes the endpoint at all; `hubs.visibility` gates whether each
hub appears in it.

### `POST /farm/hubs` — hub creation

Authenticated (farm session). Body:

```json
{
  "name": "My new hub",
  "description": "...",
  "visibility": "public"
}
```

The farm enforces a per-creator quota (`max_hubs_per_creator`, default
5). Above the quota → `403 quota_exceeded`. Quota is per `owner_pubkey`,
not per session.

On accept:

1. Generate `hub_id` (random hex, unique across `hubs`).
2. Generate the new hub's Ed25519 keypair (`hub_identity.json`).
3. Spawn the hub process (or, for operator-managed deployments, write
   a row with `upstream_url=null` and have the operator wire it up).
4. Fetch `/info` from the new hub; cache `hub_pubkey`.
5. Return `{ id, url: "https://farm.example.com/hub/<id>", hub_pubkey }`.

**Process supervision**: the farm can either spawn hubs as child
processes (simple, ties their lifetime to the farm) or expect an
operator-provided systemd unit per hub (decoupled, more flexible).
Phase 2 ships with **operator-provided**: the `POST /farm/hubs`
endpoint creates the row and returns instructions, the operator runs
the hub. Auto-spawn is a Phase 3+ refinement.

This keeps Phase 2's blast radius minimal — no new process supervisor,
no new systemd-vs-Windows-service-vs-docker-compose abstraction. The
farm is "auth + directory + reverse proxy" and nothing else.

### What changes in `AppState`

The hub's `AppState` (`hub/src/state.rs` in Wavvon-server) is *not*
modified by Phase 2 — each hub process has its own `AppState`, scoped
to its own DB and own broadcast channels. This is the payoff of the
process-separation decision above.

The farm has its own `FarmAppState`:

```
FarmAppState {
  farm_identity: Identity,
  db: SqlitePool,                 // farm.db
  pending_challenges: RwLock<HashMap<...>>,
  hubs: RwLock<HashMap<String, HubRoute>>,  // hub_id → upstream
  http_client: reqwest::Client,
}

HubRoute {
  upstream_url: String,
  hub_pubkey: String,
  last_health_check: Instant,
}
```

The `hubs` map is loaded from the DB on startup and updated when
hubs are created/destroyed. Health checks (background task pinging
each hub's `/health`) update `last_health_check` and let the farm
return `503 hub_unavailable` quickly on a downed hub.

### Wire changes — Phase 2

- **New farm routes**: `GET /farm/hubs`, `POST /farm/hubs`,
  `GET /farm/hubs/{hub_id}` (owner-only metadata),
  `PATCH /farm/hubs/{hub_id}` (rename, change visibility),
  `DELETE /farm/hubs/{hub_id}` (tombstone — the hub row goes away,
  the hub's DB is left for the operator to back up and delete).
- **New farm proxy layer**: an axum fallback handler that matches
  `/hub/{hub_id}/{*rest}`, looks up `hubs[hub_id]`, rewrites the path,
  and forwards the request (preserving headers, body, query string).
  WS connections are proxied by upgrading and bridging the two
  sockets.
- **Farm `/farm/info`** grows the `policy.max_hubs_per_creator` and
  `policy.hub_creation_open` fields.
- **Hub `/info`** is unchanged from Phase 1 — the hub doesn't know
  it's behind a farm proxy. The farm's response to `GET /hub/<id>/info`
  is the upstream hub's `/info` verbatim.
- **Client changes**: the client now treats `farm.example.com/hub/<id>`
  as the hub's canonical URL. The `add_hub` flow (currently in
  `Wavvon-desktop`'s `AddHubModal`) accepts that URL shape; it fetches
  `/info` against the full path and proceeds as today. New UI work —
  browsing hubs on a farm — is deferred to Phase 4 (per
  farm-model.md). For Phase 2, the client treats farm-hosted hubs the
  same as directly-addressed hubs.

---

---

## Phase 3: Hub creation policy + admin panel

### Goal

Phase 2 shipped a `POST /farm/hubs` endpoint but assumed the operator
calls it directly (curl / a script). Phase 3 puts a policy model around
"who can call it," surfaces that policy in a farm-operator admin UI,
and gives end users a client-side flow to create a hub on a farm they
have access to. Nothing in this phase changes the auth wire or the
proxy layer — it is purely policy + UI on top of the Phase 2
substrate.

### A. Farm creation policy (operator-side)

The farm operator controls who can create hubs. This is a *farm-level*
config — one knob covering every hub on the farm, not per-hub.

The Phase 1 `farms` table grows three policy columns and one display
flag (replacing the Phase 1 `directory_public` boolean with a clearer
name; `directory_public` stays as an alias for the migration window).

| Column                    | Type    | Notes                                                            |
|---------------------------|---------|------------------------------------------------------------------|
| creation_policy           | TEXT    | `'open'` \| `'admin_only'` \| `'disabled'`. Default `'admin_only'`. |
| max_hubs_per_user         | INTEGER | Per-pubkey cap. `0` = unlimited. Default `5`.                    |
| max_hubs_total            | INTEGER | Farm-wide cap. `0` = unlimited. Default `0`.                     |
| allow_discovery_listing   | INTEGER | 0/1. Advertise on the discovery network as "open for creation". Default `0`. |

Policy semantics:

- `open`: any user with a valid farm session can `POST /farm/hubs`,
  subject to `max_hubs_per_user` and `max_hubs_total`.
- `admin_only`: only the farm admin (the operator pubkey, see
  "Farm admin identity" below) can create hubs. Non-admin requests
  return `403 creation_admin_only`.
- `disabled`: `POST /farm/hubs` returns `403 creation_disabled` for
  everyone, including the admin. Useful for a farm that has reached
  its operator-defined size and wants to harden against accidental
  growth.

The `max_hubs_per_user` quota was already mentioned in Phase 2's
`POST /farm/hubs` (default 5). Phase 3 promotes it from a hard-coded
default to a configured column. The Phase 2 default-5 stays as the
DB default.

#### Farm admin identity

There is no concept of a separate "farm admin account" — identity is
still pubkey-only (see `farm-model.md`). Phase 3 designates the
**operator pubkey** stored in a new singleton column:

| Column         | Type | Notes                                               |
|----------------|------|-----------------------------------------------------|
| admin_pubkey   | TEXT | Ed25519 hex. The operator's user pubkey.            |

Set on first start via a CLI flag (`wavvon-farm --admin-pubkey <hex>`)
or by reading the file the operator pastes their recovery-phrase-
derived pubkey into. Subsequent changes require either the existing
admin's signature or a process restart with the flag — same shape as
hub admin transfer today.

The admin-only farm endpoints require a farm session token whose `sub`
matches `farms.admin_pubkey`. Middleware rejects with
`403 farm_admin_only` otherwise.

#### `PATCH /farm/settings` — read/update policy

Authenticated, farm-admin only.

```
GET /farm/settings
→ {
    "name": "example farm",
    "description": "...",
    "creation_policy": "open",
    "max_hubs_per_user": 5,
    "max_hubs_total": 0,
    "allow_discovery_listing": true
  }

PATCH /farm/settings
  body: any subset of:
  {
    "name": "...",
    "description": "...",
    "creation_policy": "open" | "admin_only" | "disabled",
    "max_hubs_per_user": 0..,
    "max_hubs_total": 0..,
    "allow_discovery_listing": true | false
  }
→ 200 (full updated settings, same shape as GET)
  | 400 invalid_value
  | 403 farm_admin_only
```

`creation_policy` and `allow_discovery_listing` are surfaced
unauthenticated in `GET /farm/info` (the existing `policy` block grows
the new fields) and `GET /farm/public-info` (see section D below).

### B. Farm admin panel

The farm operator gets a new client surface — a **Farm Settings** view
in the desktop client, sibling to today's per-hub Hub Settings. It
appears only when the user's pubkey matches the farm's `admin_pubkey`
on a farm they have a session against.

This is **not** the per-hub admin panel. Per-hub admin (roles,
channels, members, bans) stays exactly where it is. Farm-level admin
covers the farm's policy, the catalog of hubs hosted on it, and the
farm-level user index.

#### Settings page

The Farm Settings sidebar has three tabs:

1. **General** — name, description, creation policy selector
   (`open` / `admin_only` / `disabled`), quota fields
   (`max_hubs_per_user`, `max_hubs_total`), discovery opt-in toggle
   (`allow_discovery_listing`). All saves go through `PATCH /farm/settings`.
2. **Hubs** — listed below.
3. **Users** — listed below.

#### Hubs tab — `GET /farm/hubs?include=all`

Already exists from Phase 2 in the `?include=private` form. Phase 3
generalises:

```
GET /farm/hubs?include=public         (default, unauthenticated)
GET /farm/hubs?include=private        (auth: hub owner, includes their private hubs)
GET /farm/hubs?include=all            (auth: farm admin, every hub)
→ {
    "hubs": [
      {
        "id": "abc12345",
        "name": "Friends of Foo",
        "description": "...",
        "owner_pubkey": "<hex>",
        "owner_display": "alice",        // best-effort from farm_users
        "visibility": "public",
        "member_count": 42,              // scraped from hub /info on a schedule
        "url": "https://farm.example.com/hub/abc12345",
        "hub_pubkey": "<hex>",
        "created_at": 1748000000,
        "suspended_at": null
      }
    ]
  }
```

`member_count` is best-effort: the farm caches the last successful
scrape of each hub's `/info` member-count field (a new field on hub
`/info` — see "Wire changes" below) and surfaces `null` when no
recent scrape exists. Live counts are not required for the admin UI;
a 5-minute-stale number is fine.

Each row gets two destructive actions in the UI: **Suspend** and
**Delete**.

#### `PATCH /farm/hubs/:hub_id/suspend` — hub suspension

Authenticated, farm-admin only.

```
PATCH /farm/hubs/:hub_id/suspend
  body: { "suspended": true | false, "reason": "..." (optional) }
→ 200 { "id": "...", "suspended_at": 1748000000 | null }
  | 403 farm_admin_only
  | 404 hub_not_found
```

Suspension semantics:

- `hubs` table grows `suspended_at INTEGER NULL` and
  `suspension_reason TEXT NULL`.
- While `suspended_at IS NOT NULL`, the farm proxy short-circuits
  `/hub/<hub_id>/*` requests with `503 hub_suspended` plus a JSON body
  carrying `{ "reason": "...", "suspended_at": ... }` so the client
  can render a useful message instead of a generic 503.
- The hub process itself is not killed — its DB stays intact, its
  per-hub admin can still log in via direct upstream URL if the
  operator chose to expose one. The 503 is purely the farm proxy
  refusing to forward.
- Unsuspending clears both columns.

`DELETE /farm/hubs/:hub_id` already exists from Phase 2 (tombstone the
row, leave the hub DB for the operator). Phase 3 adds farm-admin
authentication to it — Phase 2 left this as "owner or admin"; Phase 3
locks it to admin to match the suspension symmetry. The hub owner can
still request deletion via a `DELETE /farm/hubs/:hub_id` call
authenticated as the owner pubkey, which is allowed; the admin
gets the same endpoint, also allowed. Either-or, not both required.

#### Users tab — `GET /farm/users`

Authenticated, farm-admin only. The farm-level user index.

```
GET /farm/users?page=1&limit=50&q=<search>
→ {
    "users": [
      {
        "public_key": "<hex>",
        "master_pubkey": "<hex>" | null,
        "first_seen_at": 1748000000,
        "last_seen_at": 1748000000,
        "hubs_owned": 2,
        "hubs_member_of": 4,
        "active_sessions": 1
      }
    ],
    "total": 137,
    "page": 1,
    "limit": 50
  }
```

`hubs_owned` counts rows in `hubs` with `owner_pubkey = public_key`.
`hubs_member_of` is the count of hubs reporting this pubkey in their
per-hub user list — best-effort via a periodic farm-side scrape of
each hub's existing user-list endpoint, cached, refreshed on demand.
`active_sessions` counts non-expired non-revoked rows in `farm_sessions`.

The admin can revoke farm sessions for a user:

```
POST /farm/users/:pubkey/revoke-sessions
  body: { "all": true } | { "jti": "..." }
→ 204 | 403 farm_admin_only | 404 user_not_found
```

`all: true` marks every non-revoked row for that pubkey in
`farm_sessions` as `revoked_at = now`. The user is logged out the
next time any hub calls `POST /farm/auth/revoke-check` for the jti,
or when their token expires — whichever comes first. Hubs that opt
into revocation checking (the Phase 1 belt-and-braces path) see the
effect within their 60s cache TTL.

`POST /farm/users/:pubkey/revoke-sessions { jti }` revokes a single
session — used when a user reports "I lost my laptop." The user pubkey
must own the jti; mismatched pairs return `400 jti_owner_mismatch`.

There is no `DELETE /farm/users/:pubkey`. A farm cannot un-know a
pubkey it has seen — the row is the audit trail. "Ban this user from
the farm" is achieved by suspending each hub they own and revoking
their sessions; a true farm-level ban is a Phase 4+ design.

### C. User-facing hub creation flow

When `creation_policy = open`, the client renders an entry point for
authenticated users to create a hub.

#### 1. Entry point

The "Create a hub" action lives in **two** places in the client, both
of which already exist as discovery surfaces today:

- **Hub sidebar `+` button** (`ChannelSidebar` / hub-list area of
  `App.tsx` in Wavvon-desktop). Today the `+` button opens
  `AddHubModal` for joining an existing hub. Phase 3 wraps it in a
  small popover with two choices: **Join a hub** (existing flow) and
  **Create a hub** (new flow). The popover only renders the "Create"
  option when the user has at least one farm in their known-farms
  list that satisfies the eligibility rules (see Farm picker below) —
  no dead option ships.
- **Discover page** (`DiscoverPage.tsx` in Wavvon-desktop). A new
  tab/section "Host your own community" sits alongside the existing
  hub-listings grid. This is the discovery entry — for users who
  don't already know a farm.

Both entry points open the same modal: **Create a hub** with the farm
picker as its first step.

#### 2. Farm picker

The first step of hub creation. Lists farms the user is eligible to
create on:

> A farm appears in the picker iff *all* hold:
> - The user has a known-farm entry for it (local storage, see below).
> - The farm's `GET /farm/info` advertises `creation_policy = open`.
> - `hubs_owned_by_user < max_hubs_per_user` (or `max_hubs_per_user == 0`).
> - `total_hubs < max_hubs_total` (or `max_hubs_total == 0`).

The client computes eligibility by calling `GET /farm/info` on each
known farm (already cached during normal operation — same fetch the
client makes today against a hub's `/info` on add). The user-specific
counts come from a new lightweight endpoint:

```
GET /farm/me/hub-quota
  auth: farm session
→ {
    "hubs_owned_by_user": 2,
    "max_hubs_per_user": 5,
    "total_hubs": 41,
    "max_hubs_total": 0,
    "can_create": true,
    "reason": null | "quota_exceeded" | "policy_admin_only" | "policy_disabled"
  }
```

`can_create` is the AND of policy and quota; `reason` tells the UI
which message to render. The client calls this once when the user
opens the picker and renders only farms with `can_create = true`.

Below the eligible-farm list, the picker has a **"Add another
farm"** secondary action. It opens the existing add-hub URL prompt,
but pointed at a farm URL (the prompt accepts either today via the
farm-or-hub discrimination on `/info`'s `kind` field, Phase 1). Once
the user connects to a new farm, it lands in their known-farms list
and the picker re-evaluates eligibility.

The Discover page's new "Host your own community" tab uses the same
picker UI with one extension: it surfaces farms listed in the public
discovery network (section D) that the user has *not* yet connected
to, with a "Connect & create" action that authenticates against the
farm first and then proceeds to the form.

The known-farms list is stored client-side in the same `hubs.json`-
shaped local file the client already uses for hub URLs. New schema
field per entry:

```json
{
  "url": "https://farm.example.com",
  "kind": "wavvon-farm",
  "name": "example farm",
  "added_at": 1748000000
}
```

Farms and hubs coexist in the same store, discriminated by `kind`.
The client's connect-on-startup pass already calls `/info` on each;
the `kind` field tells it which routes to expect.

#### 3. Hub creation form

After the user picks a farm, the form renders:

| Field        | Required | Validation                                                   |
|--------------|----------|--------------------------------------------------------------|
| name         | yes      | 2-64 chars; trimmed; no leading/trailing whitespace.         |
| description  | no       | 0-280 chars.                                                 |
| visibility   | yes      | `public` (listed in farm directory) or `private`.            |
| icon         | no       | Same upload flow as existing hub icon (base64, ~256 KB max). |

`POST /farm/hubs` extends the Phase 2 shape with the icon field and
explicit validation responses:

```
POST /farm/hubs
  auth: farm session
  body: {
    "name": "My new hub",
    "description": "...",
    "visibility": "public" | "private",
    "icon": "data:image/png;base64,..." (optional)
  }
→ 201 {
    "id": "abc12345",
    "url": "https://farm.example.com/hub/abc12345",
    "hub_pubkey": "<hex>",
    "name": "My new hub",
    "visibility": "public",
    "created_at": 1748000000
  }
  | 400 invalid_name (with `details: "too_short" | "too_long" | "whitespace"`)
  | 400 invalid_visibility
  | 400 invalid_icon
  | 403 creation_disabled
  | 403 creation_admin_only
  | 403 quota_exceeded (with `details: "per_user" | "farm_total"`)
  | 409 name_conflict       (only if the farm chooses to enforce unique names — see below)
```

**Name uniqueness**: not enforced by default. Two hubs on the same
farm with the same display name is fine; they have different
`hub_id`s and different URLs. A future per-farm setting
(`require_unique_names`) can opt in, but it is not in Phase 3 —
display names are display.

The icon, if provided, is forwarded to the spawned hub on first start
the same way today's hub admin sets an icon. The farm itself doesn't
store hub icons; it proxies the upload to the hub's existing
`/admin/icon` endpoint on the first successful proxy after spawn.

#### 4. Post-creation

The farm's `POST /farm/hubs` flow already (Phase 2):

1. Generates `hub_id`, generates the hub keypair, writes the row.
2. Either spawns the hub process (Phase 3+ auto-spawn, deferred) or
   returns operator instructions. Phase 3 ships with **auto-spawn for
   the open-policy case** — if the user just created a hub via the
   client, the farm spawns the hub process and waits for its `/info`
   to respond healthy (timeout 10s). If the timeout fires, the row is
   tombstoned and the response is `503 hub_spawn_timeout` so the user
   can retry without a dead row left behind.
3. Returns `{ id, url, hub_pubkey, ... }`.

The client then:

- Calls the new hub's `POST /auth/verify` (or the farm token already
  works against the new hub via the proxy — same farm session, same
  trust root). The user becomes the first member.
- The hub's "first user with no admins" bootstrap (same logic the hub
  uses today when an operator first connects) assigns the
  `owner_pubkey` from the spawn payload the admin role.
- Navigates the user into the new hub's default channel.

The owner role assignment is server-side, not client-asserted: the
farm passes `owner_pubkey` to the spawned hub via a startup parameter
or via the hub's existing first-admin bootstrap path. The client does
not call any "make me admin" endpoint.

### D. Discovery — farms open for creation

Farms with `allow_discovery_listing = true` should be findable by
users who have never connected to them. Following the same
no-central-registry rule as hub discovery, the farm itself exposes
a public probe endpoint and the user-shared URL is the discovery
primitive.

#### `GET /farm/public-info`

Public, unauthenticated. Strictly narrower than `/farm/info` — exposes
only the fields a non-member needs to decide whether to connect:

```json
{
  "kind": "wavvon-farm-public",
  "name": "example farm",
  "description": "...",
  "creation_policy": "open",
  "hub_count": 41,
  "max_hubs_total": 100,
  "allow_discovery_listing": true,
  "country": "IT",
  "region": "EU-West",
  "languages": ["it", "en"],
  "tags": ["gaming", "community"],
  "icon": "data:image/png;base64,..." | null
}
```

The `country` and `region` fields come from the `farms` singleton row
(see Section E's wire changes). They are surfaced here so that a
client doing a direct paste-URL probe — bypassing the discovery
website — still gets the locality info to render on the farm card.

If `allow_discovery_listing = false`, the endpoint returns
`404 discovery_disabled` instead of the body — the farm operator has
opted out of being probed for discovery.

The full `/farm/info` is still public; `/farm/public-info` is a
deliberately narrower surface for the discovery website and "paste a
URL to check" UI. A farm that wants to be reachable for hub-creation
discovery flips one flag.

#### Discover page integration

The existing `DiscoverPage.tsx` (Wavvon-desktop) is today a list of
hubs from the directory at `discovery.wavvon.io`. Phase 3 adds a
sibling tab/section: **"Host your own community"**.

Two sources for the farm list rendered there:

1. **User's known-farms list** — farms the user has previously
   connected to. Filtered to those advertising
   `creation_policy = open`.
2. **Manual URL probe** — a "Check a farm URL" input. The user
   pastes `https://farm.example.com`, the client fetches
   `/farm/public-info`, renders a card, and offers
   **"Connect & create"**.

There is **no** central farm registry. The discovery website
(`Wavvon-discovery`) gets an optional "Farms open for hub creation"
listing populated by the same self-submission flow hubs already use —
hub-discovery.md's signed-listing primitive applies one-for-one
(farm signs a payload with its Ed25519 key; directory verifies). The
schema for a farm listing on the directory mirrors the hub-listing
schema with `kind = "wavvon-farm"` plus `creation_policy` and
`hub_count`. That listing flow is an extension of the existing
discovery service and is **deferred to the same Phase 3 work in
Wavvon-discovery**, not part of the farm server changes. The farm
server side ships in this phase; the directory-side extension ships
when Wavvon-discovery picks it up.

The Discover page's existing hub-grid is unchanged. The new section
sits alongside it, switchable via a tab.

### E. Discovery website integration

Section D gave farms a self-describing public probe (`/farm/public-info`)
and a paste-URL flow. Section E layers an **aggregator** on top: the
`Wavvon-discovery` website grows a farms listing, populated by farm
self-submission, that the client can fetch and rank by ping. This is the
same shape as layer 2 of [hub-discovery.md](hub-discovery.md) — a
convenience directory, not an authority. Any farm can self-host a
competing aggregator; clients can be pointed at alternatives. The
no-central-coordinator constraint stands: the discovery website
aggregates self-submitted, self-signed listings, it does not gatekeep.

#### Farm self-registration with the discovery website

When the farm admin flips `allow_discovery_listing = true` via
`PATCH /farm/settings`, the farm process performs a one-shot
registration call against the discovery website:

```
POST https://discovery.wavvon.app/farms/register
  body: {
    "farm_url": "https://farm.example.com",
    "farm_pubkey": "<ed25519 hex>",
    "name": "example farm",
    "description": "...",
    "region": "EU-West",
    "country": "IT",
    "languages": ["it", "en"],
    "tags": ["gaming", "community"]
  }
→ 202 accepted     (verification will follow async)
  | 400 invalid_body
  | 429 rate_limited
```

The two locality fields are required:

- `country`: ISO 3166-1 alpha-2 code (e.g. `"IT"`, `"US"`, `"DE"`).
- `region`: coarser grouping, one of `"EU-West"`, `"EU-East"`,
  `"US-East"`, `"US-West"`, `"APAC"`, `"LATAM"`, `"MEA"`.

Two additional filter fields are also submitted, each backed by a
column on the farm's `farms` singleton row and editable via
`PATCH /farm/settings`:

- `languages`: BCP-47 codes the farm primarily operates in, 1-5
  values (e.g. `["it", "en"]`). Default `["en"]`. A farm appears in
  a `?language=` filter if the code is in this array.
- `tags`: self-tags from a fixed vocabulary, max 3 per farm. Allowed
  values: `gaming`, `professional`, `creative`, `education`,
  `community`, `18plus`. Free-form tags are not accepted —
  `PATCH /farm/settings` rejects unknown values with `400 invalid_tag`.
  This prevents spam and gaming the search.

These are **self-declared** the same way `country` and `region`
are; the discovery website does not verify them.

The discovery website does a lightweight geo-check at registration
time: it resolves the farm's hostname and checks that the IP falls
within the declared country (using a public IP-geolocation DB). If
there is a mismatch, registration is accepted but the farm is flagged
`geo_unverified: true` and shown with a note in the picker
("Region self-declared, not verified"). This is a soft check —
operators on CDNs or with split-horizon DNS may legitimately have
IPs in different countries, so a hard fail would lock out valid
deployments.

The discovery website does **not** trust the request body on its face.
On receipt it calls back to the farm:

```
GET {farm_url}/farm/public-info
  expects:
    - HTTP 200
    - kind == "wavvon-farm-public"
    - allow_discovery_listing == true
    - signed envelope verifiable with the submitted farm_pubkey
```

The signed envelope is the same primitive hub listings use
(hub-discovery.md): the discovery website asks for a fresh
`/farm/public-info` and verifies it carries an Ed25519 signature over
`(canonicalised body | nonce | timestamp)` from `farm_pubkey`. The farm
already holds its private key — no new credential exists. Verification
failures (unreachable, flag off, signature mismatch) drop the
registration without persisting it. Success persists the farm in the
discovery website's listing DB.

Registration is **push-only**: the farm row in `farms` gains no column
recording the discovery website's acknowledgement. The discovery
website owns its own state; the farm just keeps re-asserting (or
removing) itself by signed call.

#### Deregistration

Two paths, both safe against impersonation:

1. **Operator opt-out**: setting `allow_discovery_listing = false` via
   `PATCH /farm/settings` triggers the farm to call:

   ```
   DELETE https://discovery.wavvon.app/farms/register
     body: {
       "farm_pubkey": "<ed25519 hex>",
       "nonce": "<random hex>",
       "signature": "<ed25519(farm_priv, farm_pubkey | nonce)>"
     }
   → 204 | 401 invalid_signature | 404 not_listed
   ```

   The signature proves the caller holds the private half of
   `farm_pubkey` — the only authority that matters.

2. **Discovery website revalidation**: the discovery website
   re-probes every listed farm on a schedule (default: every 6 hours)
   by calling `GET {farm_url}/farm/public-info`. A listing is dropped
   when the probe returns `404 discovery_disabled`, the flag is off,
   the signature no longer verifies, or the farm has been unreachable
   for two consecutive sweeps (12h).

The discovery website does not retry deregistration — the worst case
(network blip during opt-out) is that the next 6h sweep removes the
farm anyway. Optimistic best-effort with a guaranteed backstop.

#### Discovery website API

A new public endpoint on the discovery website (not on the hub or farm
binary):

```
GET https://discovery.wavvon.app/farms
  optional query params:
    ?country=IT             — filter to farms declaring country = IT
    ?region=EU-West         — filter to farms in the region
    ?language=it            — filter to farms whose languages array contains "it"
    ?tag=gaming             — filter to farms whose tags array contains "gaming"
                              (repeatable; multiple ?tag= values use AND logic —
                              farm must carry every listed tag)
  multiple filters combine with AND. Omitting them all returns the full
  global list (unchanged behaviour).
→ {
    "farms": [
      {
        "farm_url": "https://farm.example.com",
        "farm_pubkey": "<ed25519 hex>",
        "name": "example farm",
        "description": "...",
        "hub_count": 41,
        "capacity_pct": 65,
        "country": "IT",
        "region": "EU-West",
        "languages": ["it", "en"],
        "tags": ["gaming", "community"],
        "geo_unverified": false,
        "last_verified_at": 1748000000
      }
    ],
    "generated_at": 1748001800
  }
```

Field notes:

- `capacity_pct` = `(hub_count / max_hubs_total) * 100`, rounded. When
  the farm has `max_hubs_total = 0` (unlimited), the field is omitted
  (or `null`); the client treats absence as "no cap, never weight
  down."
- `country` and `region` echo the farm's declared locality (see
  `POST /farms/register` above). `geo_unverified` is `true` when the
  discovery website's registration-time IP-geolocation check
  disagreed with the declared country — the picker surfaces a small
  "self-declared" note on those farms.
- `languages` and `tags` echo the farm's self-declared values. The
  discovery website does not verify them. `languages` defaults to
  `["en"]`, `tags` defaults to `[]` — older farms registered before
  these columns existed surface those defaults.
- `last_verified_at` is when the discovery website last successfully
  hit `/farm/public-info`. Stale entries (older than 24h) are flagged
  to the client; entries older than the 12h drop threshold should
  already be gone, but the client still defends against stragglers.
- `generated_at` is the discovery website's serialisation timestamp,
  used by the client to age its local cache.
- No auth. The list is public — anyone can scrape it, federate it,
  or host an alternative aggregator at a different URL.

#### Client-side farm picker — discovery + ping ranking

The Section C farm picker (Phase 3C, "User-facing hub creation flow")
gains a richer feed. The flow when the user opens **Create a hub →
Farm picker**:

1. **Fetch the discovery list, country/region filtered first**.
   The client first attempts a filtered fetch against
   `GET https://discovery.wavvon.app/farms`:
   - Desktop/mobile: use the OS locale/timezone to infer a likely
     country code (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`
     → map to country). This is a best-effort hint, not authoritative.
   - If the inferred country yields ≥ 3 results: use
     `?country=<code>` filtered fetch.
   - If the country fetch returns < 3 results or inference fails: fall
     back to `?region=<region>` (coarser).
   - If that is still < 3 results: fall back to the global list (no
     query params).

   The picker UI shows a region label on each farm card and a
   **"Show farms in other regions"** expandable at the bottom
   (collapsed by default) — the user can always override the
   heuristic. A farm the user is already connected to always appears
   regardless of the active region filter, even when it falls outside
   the inferred bucket; connected farms bypass filtering.

   **Language pre-filter**. Layered on top of the country/region
   fetch, the client adds `?language=<code>` derived from the OS
   locale (`navigator.language`, first two chars). If the combined
   fetch returns fewer than 3 results, the client drops the language
   param and re-fetches — same fallback shape as the country→region
   widening. The picker shows a **"Show all languages"** toggle so
   the user can override. Connected farms again bypass the filter.

   **Tag filter**. No default tag filter — the picker doesn't infer
   tags from the client. The user can optionally pick one or more
   tag chips (`gaming`, `professional`, `creative`, `education`,
   `community`, `18plus`) in the picker UI; selected tags are sent
   as repeated `?tag=` params (AND logic, matches the discovery API).

   The response is cached locally for 15 minutes, keyed by the query
   params used. A manual **Refresh** button on the picker invalidates
   the cache. Failure (offline, discovery website down) falls back to
   connected-farms-only — discovery is additive, not load-bearing.

   Country/region filtering is a UX heuristic that narrows the
   candidate pool *before* probing — faster load, fewer wasted probes,
   no behavioural change to ping measurement which still runs against
   every returned farm.

2. **Merge with connected farms**.
   The user's known-farms list (Phase 3C, `hubs.json`-shape entries
   with `kind: "wavvon-farm"`) is unioned with the discovery list,
   deduplicated by `farm_url`. Connected farms are tagged
   `connected: true` regardless of whether they appear in the
   discovery feed — a farm that has opted out of discovery but the
   user has already joined still appears.

3. **Probe in parallel**.
   For each farm in the merged list:
   ```
   GET {farm_url}/farm/public-info
   ```
   Three sequential attempts per farm, median of the three taken as
   the ping. 5-second timeout per attempt. All farms probed in
   parallel (bounded by a sane concurrency cap, e.g. 16). Probes
   produce one of:
   - `{ reachable: true, ping_ms: <median>, info: <body> }`
   - `{ reachable: false, reason: "timeout" | "error" | "stale" }`

   `stale` is set when discovery's `last_verified_at` is older than
   24h **and** the live probe also fails — these go in the
   "unavailable" group.

   A UI strip — "Checking availability of N farms…" — is shown during
   probing. This is also the privacy disclosure: probing sends the
   user's IP to each farm in the list. That is acceptable here
   because the user is choosing where to host a community and will
   connect to one of these farms anyway, but the disclosure is
   explicit so the user knows the probe happened.

4. **Rank**.
   Sort order, in tie-break sequence:

   1. **Reachable** above **unreachable**. Unreachable farms collapse
      into a folded "Unavailable" group at the bottom.
   2. Among reachable: **median ping ascending** (lower is better).
   3. **Capacity tier** — farms with `capacity_pct < 80` (or
      `capacity_pct` absent, i.e. unlimited) rank above farms at
      `>= 80%`. The tier is the primary sort *bucket*; ping orders
      within each bucket. A farm at 99% capacity ranks below a farm
      at 79% even with a faster ping.
   4. **Connected farms** get a small tie-break boost when ping is
      within ~10ms of a non-connected farm — familiarity wins ties,
      not real performance differences.

5. **Render**.
   Each farm card shows:

   - Name and description.
   - Ping badge — `"23 ms"`, `"180 ms"`, or `"unreachable"`.
   - `hub_count` (e.g. "41 hubs hosted").
   - Capacity bar when `max_hubs_total > 0`. Hidden when unlimited.
   - Language tags — e.g. `"IT · EN"` — joined from the
     `languages` array.
   - Tag chips — one per entry in `tags`, rendered as small pills.
   - **"Already a member"** badge for `connected: true` farms.
   - **"Hub limit reached"** greyed state when the per-user quota
     check (next step) returns exhausted.

6. **Quota headroom check before allowing creation**.
   For each *reachable* farm the client also calls the Phase 3C
   endpoint `GET {farm_url}/farm/me/hub-quota`. Quota fetch runs in
   parallel with the public-info probe, gated by the farm having a
   live session token; for farms the user has never authenticated
   against, quota is checked **after** the user picks the farm (the
   client authenticates first, then re-checks). Farms returning
   `can_create = false` due to `reason = "quota_exceeded"` are
   rendered greyed-out with the "Hub limit reached" affordance —
   not hidden, because the user benefits from understanding why a
   familiar-looking farm is unavailable. `policy_admin_only` and
   `policy_disabled` farms are filtered out of the picker entirely,
   same as Phase 3C — those aren't "limit reached," they're "not
   open for this user," which the picker shouldn't surface.

#### Privacy considerations

Two leaks worth being explicit about:

1. **Probe IP exposure**: each probed farm sees the user's IP. The
   "Checking availability of N farms…" strip surfaces this. There is
   no anonymous-probe mode in Phase 3 — adding one would require
   onion routing or a probe-proxy service, both of which are larger
   designs than this aggregator warrants.

2. **Aggregator scrape**: the discovery website sees which farms it
   has indexed, but **not** which farms a specific client picked.
   The client does not report its choice back. A privacy-respecting
   aggregator never needs to know what the user did with the list.

#### Wire changes — Section E

No new endpoints on the farm or hub binaries. The farm already exposes
`/farm/public-info` (Section D) and `/farm/me/hub-quota` (Section C);
the farm holds its Ed25519 keypair (Phase 1) and uses it to sign the
registration and deregistration payloads. Section E adds two
locality columns to the `farms` singleton:

- `farms` table gains `country TEXT` and `region TEXT` columns (set
  via `PATCH /farm/settings` — same surface the admin already uses for
  policy and listing-opt-in).
- `farms` table also gains `languages TEXT` (JSON array, default
  `'["en"]'`) and `tags TEXT` (JSON array, default `'[]'`).
- `/farm/public-info` response gains `country`, `region`, `languages`,
  and `tags` (all sourced from the `farms` row).
- `PATCH /farm/settings` gains `languages` and `tags` as editable
  fields. Validation: `languages` must be 1-5 BCP-47 codes; `tags`
  must be a subset (size ≤ 3) of the fixed vocabulary (`gaming`,
  `professional`, `creative`, `education`, `community`, `18plus`) —
  unknown values return `400 invalid_tag`.
- Discovery website `POST /farms/register` body gains `country`,
  `region`, `languages`, and `tags`; the discovery website's listing
  DB gains those columns plus a `geo_unverified BOOLEAN` set by the
  registration-time IP geo-check.
- Discovery website `GET /farms` gains `?country`, `?region`,
  `?language`, and `?tag` (repeatable, AND across multiple values)
  query params (all combine with AND; omitting all returns the global
  list); each entry in the response gains `country`, `region`,
  `languages`, `tags`, and `geo_unverified` fields.

Registration remains push-only — the discovery website's
acknowledgement is not persisted on the farm side.

**Discovery website API additions** (in `Wavvon-discovery`, not in
this repo — contract only):

| Method | Path                                          | Auth                  | Purpose                                  |
|--------|-----------------------------------------------|-----------------------|------------------------------------------|
| POST   | `/farms/register`                             | farm pubkey signature | Submit a farm for discovery indexing.    |
| DELETE | `/farms/register`                             | farm pubkey signature | Remove a previously-listed farm.         |
| GET    | `/farms`                                      | none                  | Public farm catalog with ranking inputs. |

The discovery website owns the revalidation cron (every 6h), the
listing DB schema, and any rate-limiting on registration. Those are
internal to that service; this doc only fixes the wire contract.

**Client additions** (Wavvon-desktop, Wavvon-web, Wavvon-android):

- Local cache for `GET https://discovery.wavvon.app/farms` — 15-minute
  TTL, manual refresh button invalidates. Stored in the same client
  config area as the known-hosts list, separate key.
- Parallel probe runner — 5s per attempt, 3 attempts per farm, median
  taken, bounded parallelism (~16). Pre-existing HTTP client reused.
- Sort algorithm — bucket by reachable/capacity, sort by median ping
  within bucket, apply connected-farm tie-break boost.
- Picker UI — capacity bar, ping badge, language tags ("IT · EN"),
  tag chips, "Already a member" badge, "Hub limit reached" greyed
  state, "Checking availability of N farms…" privacy strip, fold-out
  "Unavailable" group. Pre-filter the discovery fetch with
  `?language=<os locale>` and widen on under-3 results; optional
  tag-chip selector sends repeated `?tag=` params.

**Discovery website is a convenience, not a dependency**: when
`discovery.wavvon.app` is unreachable the picker still works against
the user's known-farms list, with paste-URL fallback (Section D)
fully functional. An operator running an alternative aggregator can
configure the client to point at a different `discovery_base_url` —
the API shape is the contract, not the hostname.

### Wire changes — Phase 3

**New `farms` table columns** (additive ALTERs):
- `creation_policy TEXT NOT NULL DEFAULT 'admin_only'`
- `max_hubs_per_user INTEGER NOT NULL DEFAULT 5`
- `max_hubs_total INTEGER NOT NULL DEFAULT 0`
- `allow_discovery_listing INTEGER NOT NULL DEFAULT 0`
- `admin_pubkey TEXT` (set on first start; CHECK that it parses as hex on insert)

**New `hubs` table columns** (additive ALTERs to the Phase 2 shape):
- `suspended_at INTEGER NULL`
- `suspension_reason TEXT NULL`

(Phase 2 already defined `owner_pubkey`, `name`, `description`,
`visibility`, `created_at`; Phase 3 reuses them.)

**New endpoints on the farm** (all under `farm/src/routes/admin.rs`
plus a couple of additions to existing route files in Wavvon-server):

| Method | Path                                  | Auth        | Purpose                              |
|--------|---------------------------------------|-------------|--------------------------------------|
| GET    | `/farm/settings`                      | farm admin  | Read full settings.                  |
| PATCH  | `/farm/settings`                      | farm admin  | Update policy/quota/listing/etc.     |
| GET    | `/farm/hubs?include=all`              | farm admin  | All hubs including suspended.        |
| PATCH  | `/farm/hubs/:hub_id/suspend`          | farm admin  | Suspend / unsuspend a hub.           |
| GET    | `/farm/users`                         | farm admin  | Paginated farm-user index.           |
| POST   | `/farm/users/:pubkey/revoke-sessions` | farm admin  | Revoke all or one session for user.  |
| GET    | `/farm/me/hub-quota`                  | farm session| Current user's create-eligibility.   |
| POST   | `/farm/hubs`                          | farm session| Extended Phase 2 shape; adds `icon`. |
| GET    | `/farm/public-info`                   | none        | Narrow discovery probe.              |

**`GET /farm/info` additions** (the existing endpoint grows):
- `policy.creation_policy` (replaces `policy.hub_creation_open` —
  same data, more values; the old boolean stays available as
  `policy.hub_creation_open = (creation_policy == 'open')` for the
  one-release migration window).
- `policy.allow_discovery_listing`.

**Hub `/info` additions** (additive, used by the farm to populate
`member_count` in the admin hub list):
- `member_count: integer` — count of distinct member pubkeys in the
  hub's `users` table. Computed cheaply on `/info` (cached, 60s TTL).

**What the client must store locally** (Wavvon-desktop, Wavvon-web,
Wavvon-android):

- The existing known-hosts list (today: `hubs.json`-shape) grows a
  `kind: "wavvon-hub" | "wavvon-farm"` discriminator on each entry.
  Existing entries default to `wavvon-hub` on migration.
- Per-farm cached state on the client:
  ```
  FarmState {
    url: string;
    name: string;
    creation_policy: "open" | "admin_only" | "disabled";
    allow_discovery_listing: boolean;
    is_admin: boolean;            // user's pubkey == farm.admin_pubkey
    last_info_at: number;
  }
  ```
  Refreshed on `/farm/info` fetch; drives whether the farm appears in
  the picker and whether Farm Settings is reachable for this user.
- Hub-creation modal state is transient (in-memory React state, not
  persisted) — the user fills it once.

**Client UI surfaces** (Wavvon-desktop is the reference; Wavvon-web
and Wavvon-android mirror):

- Hub sidebar `+` button popover: **Join a hub** / **Create a hub**.
- `CreateHubModal` (new) with three steps: farm picker → form →
  result.
- `DiscoverPage.tsx`: new tab/section **"Host your own community"**
  with the farm picker UI plus a "Check a farm URL" probe input.
- `FarmSettingsPage` (new): General / Hubs / Users tabs. Rendered
  in the same nav slot as today's Hub Settings, switched in when the
  user is the farm admin.

---

## What's deferred

Out of scope for this doc (covered in `farm-model.md` and its eventual
follow-up implementation docs):

- **Client browse-the-farm UX** (Phase 4) — Phase 3 covers creation
  discovery; browsing all hubs on a farm one is already a member of
  is a separate UX.
- **Hub migration export/import** (Phase 6).
- **Deep links** (Phase 7).
- **Cross-farm discovery** (layer 5) — `seed/` crate work,
  fundamentally separate.
- **DMs moving to the farm level** — called out in farm-model.md as
  the eventual destination; deferred until both phases above are
  stable, because the federated DM outbox protocol has its own
  migration story.
- **Game catalog at the farm level** — see [gaming.md](gaming.md).
- **Generic job queue refactor** — the `dm_worker.rs` rewrite into
  a kind-dispatched queue happens when farm-level DMs land, not
  before.

## Cross-references

- [farm-model.md](farm-model.md) — high-level design this doc implements
- [identity.md](identity.md) — auth primitive (challenge-response + Ed25519)
- [federation.md](federation.md) — hub-to-hub protocol (the model
  hub→farm verification follows)
- [home-hub.md](home-hub.md) — personal-axis state; a farm naturally
  serves the home-hub role for its users
- [decisions.md](decisions.md) — add a new top entry when Phase 1
  starts shipping
