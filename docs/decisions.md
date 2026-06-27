# Design Decisions

Why Wavvon is shaped the way it is. Each entry: the decision, the
alternative we considered, and why we chose this. New decisions go at
the top. This file holds the most recent entries; older ones are
relocated verbatim to [decisions-archive.md](decisions-archive.md)
so this file stays small enough to read whole.

## Web voice via a WebSocket Opus relay, not WebRTC

**Decision** (shipped 2026-06-13): the browser client joins the same voice
channels as native clients by relaying Opus frames over a hub WebSocket
endpoint (`/voice/ws`), not over WebRTC. Native clients keep their UDP
path; the hub fan-out routes each relayed frame to both UDP (desktop,
Android) and WS (web) participants in one channel. The browser frames the
same Opus wire format as UDP, encoding/decoding with the `opusscript` WASM
codec. Hub handler is `hub/src/routes/voice_ws.rs` (Wavvon-server); the
client side is `VoiceWsSession` in `apps/web/src/platform/voice.ts`
(Wavvon-client). Full data flow in [voice.md](voice.md).

**Why**: the browser cannot open raw UDP sockets, so the existing transport
was a hard wall. The WS relay reuses what already exists — the hub's Opus
fan-out, the session-token auth, and the exact UDP wire format — adding
only a second sender registry (`voice_ws_senders`) and a socket handle to
`AppState`. It got browser voice working end-to-end against the live pipeline
with no new media stack on the hub.

**Alternatives considered**:

- **WebRTC (SFU on the hub)** — rejected for v1: it forces the hub to
  terminate ICE/DTLS-SRTP and run a real SFU, a large new subsystem, for
  no gain over relaying the Opus frames we already produce. WebRTC stays
  the right answer for a future P2P/lower-latency upgrade and is already
  the chosen path for screen-share v2 ([screen-share-webrtc.md](screen-share-webrtc.md)),
  but voice did not need it to ship.
- **Leave browser voice deferred (status quo)** — rejected: it was the
  largest remaining parity gap and produced the "join voice button + voice
  unavailable banner" contradiction the design review flagged.

**Tradeoff**: the WS relay carries audio through the hub's WebSocket layer
rather than a dedicated media transport, and the browser path has no
RNNoise/VAD denoise (the WASM codec and `ScriptProcessorNode` graph are the
v1 ceiling). Per-stream WS framing is heavier than UDP; acceptable because
the browser audience is smaller and latency-tolerant relative to native.

## Client apps consolidate into one monorepo; hub server stays separate

> **Status (2026-06-13): shipped.** The three client repos were merged into
> the Wavvon-client monorepo across five staged commits — `apps/desktop`,
> `apps/web`, `apps/android/android` plus shared `packages/core|ui|platform|i18n`.
> The decision below is preserved as written (future tense); the structure
> it describes is now live. See [architecture.md](architecture.md) for the
> current repository map.

**Decision**: the three client repos — Wavvon-desktop, Wavvon-web,
Wavvon-android — merge into a single client monorepo (`wavvon`) with
internal pnpm workspace packages (`packages/core`, `packages/ui`,
`packages/platform`, `packages/i18n`) for shared code and per-app
projects under `apps/*`. The Rust hub server (Wavvon-server) stays its
own repo. Full plan, staged migration, and CI/release/updater details in
[client-monorepo.md](client-monorepo.md).

**Why**: the clients already share code, but through three fragile edges.
A `file:` dep from desktop into Wavvon-web (`@wavvon/utils`,
`@wavvon/i18n`) pulled a **second copy of React** into the packaged
desktop build and crashed it, forcing a `dedupe` band-aid in the desktop
Vite config (desktop `7844c31`). The desktop release workflow checks out
**two repos** just to resolve i18n. The Android web fork reaches across
repos via a Vite alias (`@components` → `../wavvon-desktop/src/...`) that
only works with both repos checked out side by side. And the trigger:
invite-link parsing (`#invite=` / `?invite=`) would otherwise be written
2–3 times — the desktop has `parseHubInput()`, the web client has no URL
invite parser at all. A workspace makes the double-React class
structurally impossible (single hoisted React), collapses the dual
checkout to one, and lets a shared-code change plus all consuming clients
land in one commit. [browser-client.md](browser-client.md) already
flagged this refactor as deferred; this is it.

**Alternatives considered**:

- **Keep multi-repo + the cross-repo Vite alias / `file:` deps (status
  quo)** — rejected: it is the source of the double-React crash, the
  dual-checkout release, and the side-by-side-checkout requirement; every
  shared-code change is a multi-repo dance.
- **Standalone published `@wavvon/core` npm package (separate repo)** —
  rejected: the publish / version-bump / update-consumers cycle adds
  *more* friction than today, not less. An internal workspace package
  shares code with zero release machinery and lets a shared-code change
  and all its consumers ship in one commit.
- **Full monorepo including the Rust hub server** — rejected: the hub is
  a different deploy unit (server binary / Docker image with its own
  release cadence and its own CI), not an installed app. Co-locating it
  buys nothing and couples unrelated release pipelines.

**Tradeoff**: consolidating three public repos into one drops the org's
public repo count six → four, a minor negative against the stated
stars/visibility goal (mitigated by keeping the old repos archived but
visible, and by one well-documented clients repo being a stronger
newcomer entry point). The Wavvon-server Docker web-builder stage must
re-point its Wavvon-web checkout to the monorepo's `apps/web` — a
cross-repo coordination point called out in the migration. The TS
identity crypto stays byte-pinned to the hub's wire-format vectors; that
contract was already cross-repo and is unchanged (now one TS
implementation instead of three).

## Hubs may optionally self-serve the web client (operator sovereignty, not central hosting)

**Decision**: a hub can serve the browser client from its own origin. Setting
`WAVVON_WEB_CLIENT_DIR` makes the hub serve a directory of built web-client
assets at `/` with SPA fallback; unset, the hub is API-only exactly as before.
The official Docker image bakes a version-matched web-client build in and sets
the var by default, so `docker compose up` yields a working client at the hub's
own URL. The served client defaults its first hub connection to its serving
origin (via an injected `window.__WAVVON_HOME_HUB__`) while keeping the
type-a-URL flow for adding other hubs.

**Why**: the highest-value growth lever for a small operator is "send a link, a
friend is in" — no app install, no typing a hub URL into a separate hosted page.
Serving the client from the hub's own origin delivers that and is also the most
federation-honest shape: each operator serves their own client from their own
domain. This is not a Wavvon-operated service — it reinforces operator
sovereignty rather than centralizing anything, and it does not phone home.
Requested by the first external hub operator (videogamezone pilot, 2026-06-12).

**Alternatives considered**:

- **Compile-time embed (rust-embed) behind a toggle** — rejected: freezes a
  web-client build into every hub binary, bloats the binary for the
  proxy/hosted-client majority, and forces a hub recompile to ship a web-client
  fix.
- **Hosted client only (status quo) + documented nginx/Caddy sidecar** — kept as
  a documented option for advanced operators, but doesn't meet the zero-config
  bar the pilot operator asked for.
- **Runtime-dir only, no Docker baking** — leaves the dominant Docker path
  needing a manual mount; baking into the image is what makes it frictionless.

**Tradeoff**: the Docker image grows by the web-client bundle and the hub
release pipeline gains a cross-repo Wavvon-web checkout (same pattern the
desktop release uses for i18n). The served client is pinned to the web-client
release current at the hub release cut; the floor is that the served client
never requires API surface newer than the hub shipping it. API 404 semantics
are preserved by serving the SPA fallback only to `Accept: text/html`
navigations.

## Demo Hub removed — discovery is the entry point for new users

**Decision**: the "Try a demo hub" button and `DEMO_HUB_URL` constant are
removed from all clients. There is no Wavvon-operated demo hub. New users
find entry points through the discovery site; communities that want to be
newcomer-friendly can tag themselves accordingly there.

**Why**: a Wavvon-operated hub is a service relationship — the project
would run infrastructure, make uptime commitments, and own a community
space. That directly contradicts the "we publish software, not services"
posture. The code was always a single constant and one conditional button;
a dead code path with no operational backing is worse than no path at all.

**What we ruled out**:

- **A community-volunteer "official demo hub"** — possible, but gives one
  community a privileged label the project can't sustain or control. A
  "newcomer-friendly" tag in discovery is the right shape.
- **Keeping the constant as `null`** — the feature was already half-dead.
  Removing the code removes the implication that someone will fill it in.

---

## Missions, sparks, and cosmetic catalog removed — Wavvon operates no monetization infrastructure

**Decision**: the missions system (sponsor-funded spark rewards), spark
balance, cosmetic catalog, and entitlement blobs are removed entirely from
all clients and from Wavvon-discovery. `MISSIONS_ENABLED`,
`MISSIONS_SERVICE_URL`, `MissionsSection`, `CosmeticsSection`, and all
related discovery API routes are deleted. Wavvon ships software only; it
operates no monetization service. Sustainability is an open question
handled by donations and community support, without building a revenue
mechanism into the protocol.

**Why**: missions required the project to permanently run a central service
— handling sponsor relationships, anti-fraud, PoW on claims, entitlement
signing. That is infrastructure debt that grows with adoption and assumes
the project always operates it. More importantly, it puts a sponsor
relationship structurally inside the software, even when well-scoped. The
sovereignty pitch is cleaner and more honest without it: Wavvon publishes
software, anyone can run it, no part of the software phones home to a
project-operated service.

**What we ruled out**:

- **Keeping missions behind `MISSIONS_ENABLED = false`** — dead code with
  a constant implies future intent. If the intent is gone, so is the code.
- **Farm hosting as a Wavvon revenue line** — anyone can operate a farm;
  the project publishing farm software is not the same as the project
  running a farm for money. If someone at Wavvon wants to run a commercial
  farm later, that is an independent business decision, not something baked
  into the software design.
- **A "supporter flair" cosmetic tied to donations** — tying any cosmetic
  to money reintroduces missions complexity at a smaller scale. Donations
  remain a simple link with no in-software perks.

**What's still open**: how the project sustains itself long-term. Donations
are the current answer. Other approaches (grants, commercial support,
community funding) can be explored without adding any code to the protocol.

---

## Observability: operator-scoped infrastructure metrics only — no PII in spans or metrics

**Decision**: Wavvon ships two observability surfaces for hub operators:
a Prometheus-compatible `GET /metrics` endpoint (aggregate counters —
uptime, DB size, active connections, message throughput) and optional
OTLP trace export via `WAVVON_OTLP_ENDPOINT`. Both are **infrastructure
observability tools for the hub operator**, not user analytics. The
hard rule: **no personally-identifiable information may appear in any
span, metric label, or structured log field**. Permitted: HTTP
method/route, status code, query latency, error type, aggregate counts.
Forbidden: user IDs, pubkeys, display names, channel names, message
content, DM participants, social graph edges, or any value that
identifies a specific user, conversation, or relationship.

**Why**: the metrics endpoint and OTLP export are opt-in, operator-run
surfaces — the hub admin points them at their own Grafana, Jaeger, or
Prometheus instance. But "operator-only" is not a sufficient privacy
guarantee on its own, because operators differ in trust level depending
on the hub, and the data shape matters regardless of who receives it.
An attribute like `user_id=<pubkey>` or `channel=general` appearing in
a span means a leaked trace file or a compromised monitoring stack
becomes a surveillance artifact. Keeping spans strictly technical
eliminates that class of risk entirely, with no loss of operational
value — latency, error rates, and throughput do not require identity.

**What we ruled out**:

- **Per-user request tracing** (attaching `user_pubkey` to spans for
  debugging auth flows). Rejected: the debug value can be achieved in
  a dev environment with a local trace sink and a test account; shipping
  it in the production path permanently associates identity with traffic
  patterns in the operator's monitoring store.
- **Message-count metrics labelled by channel** (`wavvon_messages_total{channel="general"}`).
  Rejected: channel names are community content, not infrastructure. The
  existing aggregate `wavvon_messages_total` counter carries no label.
- **Opt-in "detailed mode"** that unlocks PII labels when the operator
  enables it. Rejected: any opt-in expands the surface and the rule
  becomes "PII is ok in some deployments," which is the wrong invariant
  to hold over time. The technical spans are sufficient; detailed mode
  offers no observability benefit that can't be met without identity.

**Tradeoff**: a stripped span for a failed auth request contains the
error type but not the pubkey that failed. Debugging an auth bug in
production requires correlating with server logs, not just the trace.
We accept that because structured logs are the right tool for
per-request debugging and traces are the right tool for latency
profiling — the two should stay separate. Nothing in this decision
prevents operators from adding a non-PII correlation ID (a random
request ID) to both.

---

## Hub admin panel removed — hub management moves to desktop client

**Decision**: the web-based hub admin panel (`/admin/panel`) is removed
entirely. Hub management — banning users, managing roles, channels, and
reports — belongs in the desktop client, not a separate web UI. Hub ownership
is set at hub-creation time through the client wizard, so there is no
bootstrapping problem to solve.

**Why**: the hub panel duplicated what the desktop client already does or
should do. Adding a full Ed25519+TOTP web auth system to a panel that manages
things the client already handles is the wrong abstraction. One entry point for
hub management.

**What we ruled out**:

- **Web panel with static token auth** — already existed; removed for security.
- **Web panel with Ed25519+TOTP auth** — designed and built, then reverted
  because the underlying use case was wrong. Supersedes the entry below
  ("Admin panel auth: desktop-app signing + TOTP"); see
  [`admin-panel-auth.md`](admin-panel-auth.md) (now archived).

---

## Architecture: Farm → Server → Hub; standalone hub binary deprecated

**Decision**: the canonical deployment unit is Farm (control plane, manages
multiple servers) → Server (compute node, runs hub processes) → Hub (community
space, the product users experience). A hub is never run directly — it is
always started and managed by a server agent connected to a farm. Standalone
`wavvon-hub` binary usage is deprecated.

**Why**: the original "hub = server" assumption no longer holds. The farm needs
to manage geographically distributed servers. A standalone hub creates a
separate bootstrapping and management problem that complicates both the client
wizard and the farm's control surface.

**What we ruled out**:

- **Standalone hub with web-panel bootstrap** — the original approach; removed.
- **Hub binary as a first-class deployment target** — superseded by the
  server-agent-managed model.

---

## OAuth account linking — rejected as an auth mechanism; deferred as a social badge

**Decision**: OAuth login (Google, Steam, GitHub, etc.) will not be used as an
identity mechanism or recovery path in Wavvon.

**Why rejected for auth/recovery**: linking a Wavvon identity to a centralized
provider account means that if the provider bans the user, suspends the app, or
changes its API, the user loses Wavvon access too. This directly conflicts with
the "your hub can't take your identity" sovereignty pillar that justifies the
Ed25519 keypair model.

**Better path for the same UX problem** (the "I forgot my 24-word phrase" case):
encrypted-passphrase identity backup — the user picks a passphrase, the recovery
phrase is encrypted with it, and the result is stored wherever the user chooses
(their hub, a password manager, cloud storage). Gives the "login with passphrase"
feel without any third-party dependency. Design in
[`identity-recovery.md`](identity-recovery.md) — Part 1 (Backup / export).

**OAuth may still ship as**: a "verified badge" feature — "this Wavvon identity is
linked to my GitHub / Steam profile". That is metadata for social proof, not auth.
Tracked in [`future-features.md`](future-features.md).

**Alternative considered**: use OAuth only for first-time onboarding to smooth
key creation. Rejected: the keys the OAuth flow would create would still be tied
to the provider — losing the provider account loses the key. The recovery phrase
is a better first-time safety net and doesn't require any external account.

---

## Admin panel auth: desktop-app signing + TOTP, not a shared bearer token

**Decision**: the web admin surfaces (hub web panel, farm console) drop the
shared `web_admin_token` for a two-factor login tied to real identity. Factor
one is an Ed25519 challenge signed by the user's **desktop app** — the browser
shows a challenge, a `wavvon://sign-admin` deep link hands it to the Tauri app,
which confirms with a dialog and signs with the user's existing key
(`auth_creds.rs`), then POSTs the signature to the server's own
`/admin/auth/signed` endpoint (desktop→server, so no browser localhost listener
and no CORS). Factor two is RFC 6238 TOTP, secret stored server-side keyed by
canonical pubkey, with a QR enrollment on first login. A successful login mints
a short-lived, server-side, opaque cookie session (12h, instantly revocable) —
not a signed blob. The panel is **role-aware**: farm admin (`farms.admin_pubkey`)
gets the farm console, a hub admin (role with `admin` on that hub) gets that
hub's panel, multi-hub admins get a desktop-side picker. A signed, 8-hour
`admin_panel: true` farm token is the remote/headless fallback (still requires
TOTP). TOTP applies to the web panels only, never the desktop client. Full design
in [`admin-panel-auth.md`](admin-panel-auth.md).

**Alternatives considered**:

- **Keep the shared bearer `web_admin_token`** ([`hub-admin-panel.md`](hub-admin-panel.md)
  Feature 1). Rejected: a single secret with no identity behind it, no second
  factor, and no link to the role system; a leak grants full admin with nothing
  to revoke per-person. This entry supersedes that flow.
- **Sign in the browser** (import the key into the page / WebCrypto). Rejected:
  the private key must never enter the browser. Keeping the desktop app as the
  signer matches the rest of Wavvon's auth and behaves like a hardware key.
- **A browser localhost callback server** for the signature. Rejected: it
  reintroduces the CORS/preflight problem and an open local port. Routing the
  signature desktop→server over HTTPS avoids both — the browser only ever talks
  same-origin and polls for completion.
- **A farm-level `hub_admin_grants` table** to centralize who admins which hub.
  Rejected: hub-admin authority is community-axis and already lives in each hub's
  `user_roles`. A farm-side grant store would put a community decision on the
  hosting layer, violating the two-axis rule ([`home-hub.md`](home-hub.md)). Hub
  admin is managed per-hub; the multi-hub picker is client-side convenience.

**Tradeoff**: the flow needs the desktop app installed and adds a browser
poll-for-callback round trip, which is more moving parts than pasting a token.
We accept that because it buys real identity (the same key the user already
holds), a true second factor, instant per-person revocation, and reuse of the
existing role and `admin_pubkey` authorization — and the remote-token fallback
covers the headless case for operators without the desktop app on the box.

---

## Custom themes: CSS design tokens, not CSS injection; personal-axis, file-portable

**Decision**: user-created skins expose a curated set of CSS custom properties
(surfaces, text, accent, status, borders, effects, shadows, one radius scale knob)
as a JSON `.wavvonskin` file with a `base` fallback theme and a `tokens` override
map. The active skin is applied via `element.style.setProperty()` on
`document.documentElement`; a `[data-theme="custom"]` block in `styles.css` holds
the base fallback. The skin is stored in `~/.wavvon/appearance.json` (desktop/android)
or `localStorage` (web) using the same `#[serde(default)]` pattern as `voice.json`.
The existing four-theme picker gains a fifth "Custom" card that shows the skin name
and three swatches when a skin is active. Full design in
[`custom-themes.md`](custom-themes.md).

**Alternatives considered**:

- **Arbitrary CSS injection** (a raw textarea the user types CSS into). Rejected:
  a shared `.wavvonskin` file becomes an attack vector (`url()` for external
  fetches, `;`/`}` to break out of declarations, `expression()` in older engines).
  Even locally, an accidental layout breakage is unrecoverable without a "reset all."
  A validated token allowlist is the correct blast radius.
- **Full CSS custom property surface** (every `--r-*`, `--space-*`, `--text-*` token
  exposed). Rejected: spacing and type-scale tokens are load-bearing for layout and
  are not theme-specific — the built-in themes don't touch them. Exposing them means
  a skin can overflow text, collapse panels, or break grid math. Only the tokens the
  built-in themes actually override are skinnable.
- **Theme stored entirely in the profile file** (alongside the theme selection today).
  Rejected: the profile is the identity/hub-membership document, not a settings bag.
  The `voice.json` sidecar pattern is the established precedent for audio settings;
  `appearance.json` follows the same shape and will migrate cleanly into the personal
  prefs blob when home hubs land.
- **Hub-level themes as the first skin feature.** Rejected for v1: community-axis
  operator branding is a separate design problem — it requires hub DB storage,
  federation of the token blob, operator permissions, and a "user opt-out" story.
  Personal skins have none of those dependencies and deliver user value sooner.

**Tradeoff**: the `base` + sparse overrides model means a skin file is tiny and
forward-compatible (new tokens just inherit from `base`), but it means a skin and its
base theme are coupled — if the base theme's values change in a future release, the
skin's unset tokens change with them. We accept that because the alternative
(snapshotting all token values into every skin file) makes files verbose, breaks when
token names change, and loses the benefit of upstream theme improvements. The skin
author sets only what they want to differ; the theme maintainer owns the rest.

---

## Database abstraction: trait-based store crate split, not inline raw SQLx

**Decision**: the hub's data layer will move from a bare `sqlx::SqlitePool` embedded directly in `AppState` and raw `sqlx::query*` calls scattered across every route handler, to a set of domain-split traits (`AuthStore`, `UserStore`, `ChannelStore`, `MessageStore`, `RoleStore`, `InviteStore`, `ModerationStore`, `SettingsStore`, and more) collected into a `HubStore` super-trait, implemented by `wavvon-store-sqlite` (the current code, moved) and eventually `wavvon-store-postgres` (community contribution). `AppState.db: SqlitePool` becomes `AppState.store: Arc<dyn HubStore>`. A `StoreError` enum (`NotFound`, `Conflict`, `PermissionDenied`, `Internal`) replaces per-route ad-hoc `.map_err()` and `"UNIQUE"` string-sniffing. `#[async_trait]` is the dispatch mechanism. Transaction scope is managed by a `with_transaction<F, T>` closure. Migration contract: each backend owns its schema via a `Migrate` trait; the hub calls `store.run_migrations()` on startup. Full design in [`store-trait-design.md`](store-trait-design.md).

**Alternatives considered**:

- **Keep the current raw-SQLx approach indefinitely.** Rejected: it makes every handler a database-backend coupling point. Swapping the database means touching every route file, and error normalization requires ad-hoc per-handler decisions. The current design accidentally bakes SQLite's FTS5 and UNIQUE-conflict message text into the application layer.
- **One God trait `HubStore` with all methods.** Rejected: a single 100-method trait is unimplementable in pieces — the compiler demands all methods at once, so a backend author can't work domain by domain. Domain-split traits with a blanket super-trait impl give a seam per domain.
- **An explicit `Transaction<'conn>` object** (begin/commit/rollback). Rejected: the lifetime of a SQLite transaction handle (`&mut Connection`) differs from Postgres's pooled `Transaction<'c>`, so abstracting it leaks backend types. The closure form (`with_transaction<F, T>`) keeps the transaction type private to each backend.
- **Feature-flag the backend at compile time** (one `Cargo.toml` feature, conditional impls). Rejected: forces recompilation to switch backends and cannot support runtime selection (an operator editing `hub.toml` without recompiling). `Arc<dyn HubStore>` supports runtime selection by `database_url` prefix.
- **Move to `sea-orm` or `diesel` with their own abstraction layers.** Rejected: both introduce significant LoC overhead and ORM conventions that fight the existing `sqlx` query patterns. The trait layer is thinner and lets each backend stay idiomatic to its own engine.

**Tradeoff**: `Arc<dyn HubStore>` with `#[async_trait]` adds one heap allocation (a boxed `Pin<Box<dyn Future>>`) per database call — negligible against any real IO round-trip. The `with_transaction` closure pattern is awkward when callers need to branch on intermediate results inside a transaction; those flows must be written as linear closures. Both costs are accepted: allocation is noise; transaction shape discipline is necessary regardless of the abstraction.

**What's deferred**: the actual refactor — create `wavvon-store`, move the current SQLx bodies to `wavvon-store-sqlite`, update the hub to use `Arc<dyn HubStore>`, add `wavvon-store-postgres` as a community contribution. This decision records the intent and the design; implementation starts when prioritized.

---

Older entries (everything from "Discovery v2" back to the founding
"No proof-of-work yet" entry) are relocated verbatim to
[decisions-archive.md](decisions-archive.md).
