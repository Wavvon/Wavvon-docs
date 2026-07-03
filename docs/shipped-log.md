# Shipped log

Full historical record of shipped work, moved out of [ROADMAP.md](../ROADMAP.md)
to keep the roadmap slim. Newest entries first. Forward-looking work lives in
the roadmap; design rationale lives in [decisions.md](decisions.md).

## Entries

- **Channel permission overwrites (2026-07-04)** — the §3 "cascade like a
  file system" mechanism from [`nested-channels-ux.md`](nested-channels-ux.md).
  Server (hub `5912459`): `channel_permission_overwrites` table;
  `channel_permissions()` resolver (root→target fold, allow-wins at same
  level, child-over-parent, `admin` immune); channel-scoped checks in
  messages/posts/channels, WS auto-subscribe, and voice join (gated on
  channel-scoped `read_messages` — no voice-specific constant exists);
  nested channel creation checks `MANAGE_CHANNELS` on the parent;
  channel-list read-gating server-side; GET/PUT/DELETE
  `/channels/:id/permissions[/:role_id]` with audit-log entries; 7
  integration tests in `hub/tests/channel_permissions_flow.rs`. Client,
  web only (clients `a4e1366`): tri-state Permissions tab
  (`ChannelPermissionsTab.tsx`, ghost inherited values, override dots,
  Save/Reset per role) in `ChannelSettingsModal.tsx`, three
  `platform/commands/channelPermissions.ts` adapter functions,
  empty-category suppression in the sidebar for non-admins, i18n ×4
  locales, 7 unit tests. Not yet visually verified in a running client;
  desktop/Android UI parity deferred per delivery-target decision. — admin registers external HTTPS URLs;
  hub POSTs HMAC-SHA256-signed `hub_event` envelopes on matching events
  (fire-and-forget, no bot identity/WS session needed). New
  `hub/src/outgoing_webhooks/` module: 9 admin routes (added a `GET
  .../subscriptions` read-back beyond the original 8-route spec so the UI
  can pre-fill the subscription editor instead of blind-overwriting it),
  delivery worker with 4-attempt retry (5s/30s/5min), auto-disable after 5
  consecutive failures, last-200 delivery log per webhook. Dispatch hooks
  directly into `publish_hub_event` (`bots/events.rs`) — the design doc
  originally described a broadcast channel that doesn't exist in this
  codebase; doc corrected to match. Web admin UI only (desktop deferred
  per delivery-target decision): `OutgoingWebhooksSection.tsx` +
  `EventSubscriptionEditor.tsx` (new, reusable — bots don't have an event
  subscription UI yet) + `platform/commands/outgoingWebhooks.ts`. 13
  integration tests in `hub/tests/outgoing_webhooks_flow.rs`. See
  [`outgoing-webhooks.md`](outgoing-webhooks.md).

- **Moderation enhancements ME1/ME2/ME3 (2026-07-02)** — ME1: `federated_ban_sources`
  + `federated_ban_overrides` tables; admin CRUD routes at `/admin/banlist/sources|entries|overrides`
  and `/admin/settings/banlist`; banlist_worker reads per-source policy; auth layer
  applies whitelist/blacklist overrides. ME2: `WebhookCircuit` in `AppState`; circuit
  breaker on 3× 5xx in 60s → 10-min backoff; `GET /admin/settings/moderation` exposes
  state. ME3: server was already shipped; web client adds report button on messages +
  admin Reports queue. Web admin Moderation tab covers all three features.

- **Code audit — all 46 findings resolved (2026-06-27)** — H9 CORS warn, H11
  get_messages N+1 → 3 bulk queries, H14 list_members N+M+1 → 3 queries + LIMIT
  1000, H15 farm-token auth 5 reads → 1 query, H16 federated DM delivery
  background tokio::spawn, H17 tantivy Mutex unwrap, H20 chat broadcast capacity
  256→4096, H21 handle_typing ban check, H22 badge-offer rate-limit + duplicate
  guard, H23 preview SSRF proxy-aware + redirect IP guard. DB indexes H12/H13
  verified present. W25/W27 already fixed by monorepo consolidation + identity
  refactor. Full finding list: [`code-audit-2026-06-11.md`](code-audit-2026-06-11.md).

- **Per-hub subkey revocation propagation (2026-06-30)** — background worker polls
  each master key's home hub every 6 hours, verifies Ed25519 signatures, and inserts
  new revocations into the local `subkey_revocations` table. See
  `subkey_revocation_worker.rs`.

- **First user silently becomes hub owner — fixed (2026-06-27)** — removed
  auto-grant from `assign_initial_roles`; hub now starts ownerless and warns on
  startup when `WAVVON_OWNER_PUBKEY` is unset. Found live on videogamezone pilot.

- **Design review + pilot feedback resolved (2026-06-27)** — all 10 web client
  design-review items and all desktop pilot-feedback items (D1–D9) fixed: composer
  layout, poll fetch on channel switch, i18n wiring, display-name prompt, message
  anatomy, voice control bar, emoji picker, chat column max-width, channel hash
  glyph, WelcomeScreen browse wiring, whisper portal, camera picker, leave-voice
  button, screen-share picker thumbnails, role submenu, banner channel editing.
  Details: [`design-review-2026-06-13.md`](design-review-2026-06-13.md) and
  [`pilot-feedback-2026-06-12.md`](pilot-feedback-2026-06-12.md).

- **Forum reactions + attachments (2026-07-01)** — `post_reactions` and
  `reply_reactions` tables added; `attachments` JSON column on `posts` and
  `post_replies`; four new endpoints (`POST/DELETE /posts/:pid/reactions`,
  `POST/DELETE /replies/:rid/reactions`); reactions and attachments included in
  `PostDetail` and `ReplyView`; 6 integration tests in `forum_flow.rs`. Web client:
  `ReactionBar` component on posts and replies, attachment list + file picker shell
  in `ForumComposer`, Playwright E2E test suite (5 tests, mocked API).

- **`cargo test --workspace` works on Windows (2026-07-01)** — two blockers
  fixed: (1) `webauthn-rs-core` depends directly on `openssl-sys`; resolved by
  adding `openssl = { version = "0.10", features = ["vendored"] }` to
  `hub/Cargo.toml` (forces a source build; requires cmake and Strawberry Perl, both
  now installed as dev tools) and switching `wavvon-seed`'s `reqwest` to
  `default-features = false, features = ["json", "rustls-tls"]`. (2)
  `create_test_db()` needs a live PostgreSQL; `server/docker-compose.dev.yml` added
  (`docker compose -f docker-compose.dev.yml up -d` before running tests).

- **Remove games feature (2026-07-01)** — replaced by bots; iframe/session
  infrastructure dead weight. All 11 sub-tasks (S1–S5, D1–D3, W1, A1, Docs)
  completed: hub routes/WS/farm game handling removed; `GameStore` trait and
  database tables dropped; desktop/web/android client game modals and state removed;
  docs updated (`gaming.md` and `games-sdk.md` deleted; `/games/*` removed from
  openapi.yaml and ws-protocol.md; bot deferred-scope known issue updated).

- **Bot mini-apps + bot media (2026-07-01)** — generic mechanism for bots to
  embed interactive web experiences and inject audio/video into channels.
  All 9 sub-tasks (M1–M8, Docs) completed: `mini_app_url` field added to bot
  registration; `bot_app_launch`/`join`/`open`/`close` WS messages implemented;
  hub endpoints for bot voice and screen-share (`POST/DELETE /bots/{id}/voice/*`,
  `POST/DELETE /bots/{id}/screenshare/*`); desktop/web/android clients open
  sandboxed webviews/iframes with injected token and hub context; camera
  permission CSP plumbed; docs updated with WS protocol and operator guide.

- **Fix the aarch64 hub binary build (2026-07-01)** — replaced
  `aarch64-linux-gnu-gcc` (GNU ABI, incompatible with musl) with
  `cargo-zigbuild` (Zig provides its own musl headers; handles aws-lc-sys/ring
  C objects cleanly). x86_64 and Docker builds unchanged.

- **Voice enhancements V1–V4 (2026-07-01)** — four sequenced improvements to
  the voice pipeline. All four phases completed:
  - **V1 — Per-participant volume control** — hub and desktop already fully done;
    web and Android wired: per-sender `GainNode` in `voice.ts`, `ChannelSidebar`
    gain slider, `App.tsx` wiring, Android `set_voice_gain` Tauri command +
    `StoredVoiceSettings`. Vitest 4/4.
  - **V2 — Voice audio quality profiles** — `AudioProfileSection` moved to
    `packages/ui`; desktop re-exports as shim; web `SettingsPage` Voice tab
    wired; Android `StoredVoiceSettings` extended. Workspace typecheck clean.
  - **V3 — Proximity voice** — hub side pre-existing; server integration tests
    (`proximity_voice_flow.rs`, 4 tests) + web client attenuation shipped:
    `computeAttenuation()` (4 models), zone lifecycle handlers,
    `recomputeAllProximityGains` on every position update; WS dispatch in
    `ws.ts`. 18 vitest tests.
  - **V4 — Voice encryption (Phase 2)** — AES-256-GCM per-packet on Opus stream;
    hub relays ciphertext transparently; `VoiceKeyOffer`/`VoiceKeyReceived`/
    `VoiceKeyRequest` WS key distribution with X25519 ECDH; `ws_key_senders`
    map in AppState for targeted delivery. 4 integration tests.

- **Hub creation wizard (2026-07-01)** — zero-to-live path for new operators.
  All three pieces shipped:
  - **HW1 — Template catalog on discovery** — `POST/DELETE /api/templates/register`
    (Ed25519-signed, ownership-checked); 8 vitest tests.
  - **HW2 — First-run bootstrap in hub** — `maybe_bootstrap()` fetches template
    URL, applies channels/roles/settings/welcome message; 4 integration tests.
  - **HW3 — Creation wizard on discovery** — `/new` web flow generates
    `docker-compose.yml` download.

- **E2E v2 — Double Ratchet (2026-06-30)** — 1:1 DMs upgraded from static ECDH
  to Signal Double Ratchet: per-message forward secrecy and post-compromise
  recovery. Session init via 2DH (static × static seeds root key; ephemeral ×
  static seeds first sending chain). KDF_RK / KDF_CK / derive_nonce via
  HKDF-SHA256 with `wavvon/dr-*` domain strings. v2 envelope adds `v`,
  `message_index`, `prev_count`; no `nonce_hex` (nonce derived from msg key).
  Skipped-key cache (cap 1000) handles out-of-order delivery. Implemented in:
  identity crate (`dr_envelope_signing_bytes`), hub models + signing dispatch,
  Tauri `dm.rs` (`init_dr_session`, `encrypt_dm_dr`, `decrypt_dm_dr` commands),
  TypeScript `core/crypto.ts` (`initDrSession`, `encryptDmDr`, `decryptDmDr`).
  Group DMs keep the sender-key scheme; X3DH one-time prekeys are v3.

- **Passkey login in AddHubModal (2026-06-30)** — "Sign in with passkey" button
  appears in the modal when the hub is reachable, WebAuthn is supported, and the
  user has a public key. Runs the assertion ceremony via `authenticateWithPasskey()`,
  then passes the session token to `addHub({ sessionToken })` to skip the Ed25519
  challenge flow. Error handling and loading state shared with the standard Connect
  path.

- **Client-side passkey flows (2026-06-30)** — web client: `platform/webauthn.ts`
  with full passkey registration + assertion ceremony (manual base64url/ArrayBuffer
  conversion, no external dependency), plus management API calls (list/delete/rename
  passkeys, list/revoke trusted devices) via hubFetch; PasskeySection and
  TrustedDevicesSection added to the Account tab; `addHub()` accepts `sessionToken`
  to allow passkey-obtained tokens to bypass Ed25519 auth. Desktop: five new Tauri
  commands (`passkey_list/delete/rename`, `trusted_device_list/revoke`) using the
  shared http_client + stored session token; PasskeySection + TrustedDevicesSection
  wired into the Security tab (view/rename/remove only — desktop cannot register
  passkeys due to Tauri webview RP ID mismatch with the hub's domain).

- **WebAuthn/passkey auth — hub server layer (2026-06-30)** — hub now supports
  passkey registration and login via webauthn-rs 0.5 as a parallel auth path
  alongside the existing Ed25519 challenge/verify flow. New endpoints:
  `POST /auth/webauthn/begin` + `/finish` (register a passkey),
  `POST /auth/webauthn/assert/begin` + `/finish` (authenticate),
  `POST /auth/device-token/create` (mint a 30-day "Trust this device" token),
  `POST /auth/device-token/redeem` (exchange for session token; rotates on use).
  Credential management at `GET/PATCH/DELETE /me/credentials`; trusted device
  management at `GET/DELETE /me/devices`. `rp_id` derived from
  `WAVVON_PUBLIC_URL` hostname; override via `WAVVON_WEBAUTHN_RP_ID`. Device
  token TTL configurable via `WAVVON_DEVICE_TOKEN_TTL_DAYS` (default 30).
  New DB tables: `webauthn_credentials`, `device_tokens`. Eight integration
  tests in `hub/tests/webauthn_flow.rs`.

- **Per-hub subkey revocation propagation (2026-06-30)** — background worker
  (`subkey_revocation_worker`) discovers all distinct `(master_pubkey,
  home_hub_url)` pairs from `subkey_certs`, polls
  `GET /identity/{master}/revocations?since={cursor}` on each home hub every
  6 hours, verifies the Ed25519 signature on each entry, inserts valid
  revocations into `subkey_revocations` with `ON CONFLICT DO NOTHING`, and
  advances the cursor with `GREATEST()`. `GET /identity/{master}/revocations`
  endpoint gained a `?since=` query param. New `subkey_revocation_sync`
  migration table tracks per-`(master, hub)` cursor. Five integration tests
  in `hub/tests/subkey_revocation_relay_flow.rs`.

- **Cross-farm cert revocation relay (2026-06-29)** — hub now polls every
  remote cert issuer it knows about for revocations. A new
  `cert_revocation_sync` table tracks the per-issuer cursor; a background
  worker (`cert_revocation_worker`) fires 2 min after startup then every 6
  hours: discovers all distinct `(issuer_pubkey, issuer_url)` pairs in
  `user_certs`, calls `GET {issuer_url}/certs/revocations?since={cursor}`
  on each, deletes the matching `user_certs` rows, and advances the cursor
  with `GREATEST()` so it never goes backwards. Unreachable issuers are
  silently skipped (certs retained). Five integration tests in
  `hub/tests/cert_revocation_relay_flow.rs`.

- **Farm agent WS token moved to first message frame (2026-06-29)** — token no
  longer appears in the `/ws/agent` URL and therefore in access logs. Agent now
  connects to `/ws/agent` (no query param) and sends
  `{"type":"hello","version":"...","token":"<hex>"}` as its first frame; server
  validates token there before registering the connection. Invalid or missing
  token receives `{"type":"error","code":"auth_failed"}` and the socket closes.

- **Timestamp hygiene complete (2026-06-29)** — five farm route files each
  had a private copy of `unix_now()`; consolidated into a single `pub fn
  unix_now()` in `wavvon-farm/src/lib.rs`. Seven hub test-migration columns
  (`channel_voice_mutes.muted_at`, `raise_hand_requests.requested_at`,
  `badge_offers.created_at`, `hub_badges.accepted_at`,
  `issued_badges.issued_at/expires_at/revoked_at`) changed TEXT → BIGINT;
  handlers and response models updated to use `i64`. `"chrono"` sqlx feature
  removed from workspace `Cargo.toml`. `iso_from_unix` unified into a single
  `pub fn` in `auth/handlers.rs`; `badges.rs` local copy deleted.

- **Full PostgreSQL backend (2026-06-27)** — SQLite removed from the server
  entirely; `wavvon-store-sqlite` crate deleted and replaced by
  `wavvon-store-postgres`. sqlx features trimmed to `postgres + runtime-tokio
  + macros + chrono + uuid`; hub, seed, and farm all use `PgPool`/`PgPoolOptions`.
  New `wavvon-store-postgres` crate (19 impl files) covers every `HubStore`
  sub-trait with PostgreSQL DDL. All 18 hub integration test files updated to
  create a fresh isolated PostgreSQL database per test (UUID-named, migrations
  pre-applied) via `create_test_db()` in `tests/common.rs`. CI gains a
  `postgres:16-alpine` service container with health checks and `TEST_DATABASE_URL`
  wired to `cargo test`.

- **Web client stabilisation pass (2026-06-22/23)** —
  Welcome screen gated on `hubs.length === 0`; "Hosted by [url]" link added to
  `WelcomeScreen` and `AddHubModal` hub preview cards.
  `CreateChannelModal` wired from all three entry points; added Banner and
  Category types alongside Text and Forum. `ChannelSettingsModal` created —
  pre-filled name/description edit, two-step delete confirmation; accessible via
  gear icon and right-click context menu. WS event audit: `forum_event`, all
  screen-share signalling, and video/whisper events wired into `ws.ts` dispatch.
  Profile: `SettingsPage` calls `onProfileSaved` after `PATCH /me`; `App.tsx`
  re-fetches `/me` and `/users` so display name updates immediately.

- **Web client audit remainder (W5–W24) — 13 findings fixed (2026-06-14)** —
  W5: reactions broadcast preserves `me` flag. W7: `voice_participant_speaking`
  wired; speaking ring lights. W9: `dm_member_changed` WS event handled. W11:
  poll event names fixed; `onPin`/`onPoll` wired. W14: events types corrected
  (`starts_at`, `rsvp_counts`); RSVP uses POST/cancel. W15: farm unsuspend
  uses correct endpoint. W17: pending-approval hub shows landing screen. W18:
  alliance shared channels fetched on hub connect. W19: mention pings play audio
  + OS notification on permission. W20: `pingHub` called on interval. W21:
  `UserContextMenu` wired; right-click on members works. W22: group-DM
  `group_encrypted_envelope` handled. W23: scroll position tracked; "N new
  messages" pill wired. W24: unmounted components cleanup.

- **CI build fixes (2026-06-14)** — Android: `@noble/curves` and
  `@noble/hashes` added as direct deps, resolving Rollup import failure.
  Desktop macOS: `xcap` bumped 0.0.14 → 0.9.6 (E0282 fixed); call sites in
  `screen_share.rs` updated for new API. Auto-tag correctly dispatches release
  workflows via `gh workflow run`.

- **App.tsx decomposition — channel-message, alliance, WS hooks (2026-06-14)** —
  desktop App.tsx 3,259 → ~1,450 lines; android App.tsx 993 → ~560 lines.
  Desktop: `useChannelMessages`, `useAlliances`, `useWsHandlers` extracted.
  Android: same three hooks; stableHandlers wired via stable setter refs.
  pnpm typecheck clean across all three apps.

- **Desktop voice/composer UI pass + web screen-share viewing (2026-06-13)** —
  attach+poll collapsed into a "+" menu in desktop `ChannelComposer`; voice
  control bar buttons replaced with SVG icons; joining a new voice channel now
  implicitly leaves the current one; camera button enumerates devices on first
  enable; screen-share source grid gains `max-height`. Web screen-share VIEWING
  now works — `HubWebSocket` gains binary frame support and `App.tsx` wires
  `activeScreenShares` state through to the existing `ScreenShareViewer`.

- **Hub: first-user-becomes-owner bug fixed (2026-06-13)** — `assign_initial_roles`
  now skips the auto-owner grant when `WAVVON_OWNER_PUBKEY` is configured.
  `AppState` gains `owner_pubkey: Option<String>`.

- **H4 federated-DM sender spoofing fixed (2026-06-13)** — Ed25519
  signature verification is enforced on all three receive-federated-DM
  paths (encrypted, group-encrypted, plaintext) in
  `hub/src/routes/dms/messages.rs`. All hub audit findings from the
  2026-06-11 audit are now resolved.

- **Web voice via WebSocket audio relay (2026-06-13)** — browsers cannot send
  raw UDP, so hub gains a `/voice/ws` WebSocket endpoint; web clients
  authenticate with the session token + channel_id, receive a `voice_ws_ready`
  JSON frame, then exchange binary Opus frames. Hub fan-out routes to both UDP
  (desktop/android) and WS (web) participants. Web client gains `opusscript`
  (WASM Opus encoder/decoder) and a new `VoiceWsSession` class. All four clients
  now participate in shared voice channels.

- **Client monorepo consolidation — all 5 stages complete (2026-06-13)** —
  Wavvon-desktop, Wavvon-web, and Wavvon-android collapsed into the single
  Wavvon-client pnpm + Cargo monorepo. Stage 0 (scaffold), Stage 1
  (`packages/core`), Stage 2 (`@wavvon/utils` + noble crypto), Stage 3
  (`packages/ui` + 10 shared components), Stage 4 (`packages/platform` +
  android collapse), Stage 5 (CI consolidated — path-gated per-app jobs).
  Double-React hazard eliminated, cross-repo Vite alias eliminated,
  dual-checkout release eliminated.

- **Hub optionally self-serves the web client (2026-06-13)** — new
  `WAVVON_WEB_CLIENT_DIR` setting. When set, hub serves a pre-built SPA at
  `/` via tower-http `ServeDir` with SPA deep-link fallback. `index.html`
  cached at startup with `window.__WAVVON_HOME_HUB__` injected. Official Docker
  image gains a `node:22-slim` web-builder stage. 7 integration tests in
  `hub/tests/web_client_flow.rs`.

- **Networked voice Phase 1 — token-gated source-address learning (2026-06-12)**
  — hub relay no longer registers clients as 127.0.0.1. On `voice_join` the hub
  mints a 32-byte single-use UDP register token delivered in the `voice_joined`
  WS reply. The client sends a VXRG packet; the hub binds the real source address
  into `voice_addr_map` and replies VXRA. Fan-out gated on `voice_addr_map`
  membership. Five new integration tests in `hub/tests/voice_relay_flow.rs`.

- **H5/H6 rate-limiter trusted-proxy + IPv6 canonicalization (2026-06-12)** —
  `rate_limit.rs` gains `WAVVON_TRUSTED_PROXY` setting. When enabled, real
  client IP derived from last `X-Forwarded-For` entry. All IPs canonicalized:
  IPv4-mapped IPv6 collapses to plain IPv4; genuine IPv6 bucketed at /64 prefix.
  6 new unit tests.

- **H2/H3 presence refcount + bot_sessions per-session (2026-06-12)** —
  `online_users` changed from `HashSet` to `HashMap<String, usize>` (refcounted).
  `bot_sessions` changed from `HashMap<pubkey, Sender>` to
  `HashMap<pubkey, HashMap<session_id, Sender>>`; each WS session registers
  under its own UUID. 4 new tests in `hub/tests/presence_multi_session_flow.rs`.

- **Hub CORS layer + self-describing CLI (2026-06-11)** — `WAVVON_CORS_ORIGINS`
  env-var wires a tower-http `CorsLayer`; `--help` prints a generated env-var
  table, `--version` prints version, `--doctor` runs pre-flight checks. Startup
  banner logs effective port, scheme, UDP port, TLS state, CORS origins, and
  data-file paths. Four CORS integration tests added.

- **Real screenshots + join-flow GIF in READMEs; web client fixes; demo-seed tool (2026-06-11)** —
  screenshots and join-flow GIFs added to main/desktop/web/hub READMEs; web
  client desktop layout CSS fix, message ordering fix, onboarding improvements,
  voice roster bootstrap via `GET /voice/participants`; demo-seed tool added.

- **Web onboarding styling + voice roster bootstrap (2026-06-11)** — web
  client onboarding screens now match the app's visual style; missing `button`,
  `input`/`textarea`/`select` base CSS rules and utility classes added.
  Voice roster now populated on connect via `GET /voice/participants`;
  `voice_roster_update`, `voice_participant_joined`, and `voice_participant_left`
  WS events handled individually.

- **demo-seed tool (2026-06-11)** — new `tools/demo-seed` binary; populates a
  fresh running hub with 8 identities, 5 channels under 4 categories, ~30
  realistic messages, a poll, a pinned welcome message, and emoji reactions.
  Reads `HUB_URL`; writes credentials to `demo-credentials.json`.

- **ContentArea.tsx ports to all forks (2026-06-11)** — web (1,157 → ~320-line
  composition root), android/wavvon-desktop (979 → ~290), android/wavvon-web
  (881 → ~280) now mirror desktop's `components/content/` shape. tsc clean in
  all three apps; vitest web 6/6, android 14/14.

- **ws/connection.rs dispatch refactor (2026-06-11)** — introduced `ConnState`
  and a `DispatchResult` enum; extracted all match-arm logic into per-domain
  handlers under `routes/ws/handlers/`: `voice.rs`, `screen.rs`, `game.rs`,
  `chat.rs`, `bot.rs`. `connection.rs` is now 605 lines (was 1,910). All 250+
  tests green.

- **ContentArea.tsx desktop split (2026-06-11)** — 1,383-line `ContentArea.tsx`
  split into 9 files under `components/content/`. `ContentArea.tsx` is now 688
  lines. Props interface and export signature unchanged. tsc clean, vitest
  71/71, vite build succeeds.

- **Signing-service removal + spec CI gate (2026-06-11)** — all signing-service
  steps removed from desktop CI; hub CI now fails when a registered route is
  missing from `openapi.yaml` (currently 201/201 documented).

- **Desktop lib.rs module split (2026-06-11)** — 9,844-line desktop
  `src-tauri/src/lib.rs` split into 28 domain modules; `lib.rs` is now ~350
  lines. Zero TS-side changes required. `cargo clippy -D warnings`, `cargo fmt
  --check`, and all 38 tests green.

- **Hub route module splits wave 2 (2026-06-11)** — directory-module conversions
  for `dms.rs` (1,305 → 4 files), `bots.rs` (1,236 → 5 files), `alliances.rs`
  (1,119 → 5 files), `moderation.rs` (1,016 → 5 files). Zero route-path or
  public-API changes.

- **Big-file refactor wave 1 + complete API spec (2026-06-11)** — hub
  `routes/ws.rs` (2,101 → 4 files) and `routes/games.rs` (1,617 → 6 files),
  android Tauri `lib.rs` (5,332 → 559 + 14 domain modules), web `App.tsx`
  (1,402 → 1,255 via extracted hooks). `openapi.yaml` now documents all 201 hub
  routes (103 were missing), verified by `docs/scripts/check-openapi-coverage.mjs`.

- **App.tsx decomposition batch 3 (2026-06-11)** — DM cluster extracted into
  `desktop/src/hooks/useDms.ts`. App.tsx: 3,461 → 3,259 lines.

- **App.tsx decomposition batch 2 (2026-06-11)** — `useHubAdmin`, `useFriends`,
  and `useSettingsProfile` extracted into `desktop/src/hooks/`. App.tsx:
  3,937 → 3,461 lines.

- **UDP voice relay tied to WS session (2026-06-10)** — added `voice_relay_active`
  set to `AppState`; `VoiceJoin` inserts, `leave_voice` removes; UDP receive loop
  rejects packets from pubkeys absent from the set. Five integration tests in
  `hub/tests/voice_relay_flow.rs`.

- **Farm/seed/server/voice security sweep (2026-06-10)** — WS agent channel made
  bounded; DB error during token lookup now closes the socket; heartbeat endpoint
  rejects unknown hub pubkeys on DB error; proxy body capped at 32 MiB;
  `public_key` added to `/farm/public-info`; `agent::run` survives malformed JSON;
  voice pipeline tasks no longer panic on Opus init failure. Eight new integration
  tests added.

- **Hub wishlist quick wins (2026-06-10)** — `GET /preview` rate-limited (10/min),
  `POST /admin/search/reindex` for operator-driven index rebuilds, `federated_bans`
  enforced on outbound messages and DMs, dead `game_session_left` WS variant removed.

- **Full CI test coverage across all repos (2026-06-10)** — vitest suites gated in
  CI for web (6 tests), android/wavvon-web (14 tests), desktop (71 tests), and
  discovery (28 tests); web gains i18n coverage check; android gains `cargo fmt
  --check` and `cargo clippy -D warnings` gates.

- **WebSocket protocol documented (2026-06-10)** — complete message-by-message
  wire reference in `docs/ws-protocol.md` (34 client→server, 55 server→client
  messages, verified against hub source).

- **Workspace hardening batch (2026-06-10)** — hub security fixes (WS session
  validation, atomic invites, SSRF DNS-rebinding, federated-ban check on farm
  tokens, upload headers), client race/cleanup fixes + error boundaries, android
  parity restored, shared `@wavvon/utils` package, wire-format spec with
  cross-client byte-level vector tests, CI gains fmt/clippy gates and SHA-pinned
  actions.

- **Forum per-post read cursors (all 4 clients)** — `post_reads` table, `INSERT OR REPLACE` mark-read endpoint (`POST /channels/:cid/posts/:id/read`), `unread_reply_count` subquery on list/get; unread dot + count shown per thread row in all 4 clients. Design in [`forum.md`](forum.md).

- **Custom skins discovery gallery (all 4 clients)** — `skins` table in Wavvon-discovery with Ed25519 signature verification and SHA-256 content-addressed IDs; `GET /api/skins` (search/paginate) + `POST` (publish) + `DELETE` (author-signed removal); `SkinsGallery` component with search, base filter, and "Load more" in the Appearance tab of all 4 clients. Design in [`custom-themes.md`](custom-themes.md).

- **Database abstraction layer** — `wavvon-store` supertrait crate + `wavvon-store-sqlite` impl; `StoreError` enum mapping to HTTP codes; `AppState` gains `store: Arc<dyn HubStore>` alongside existing `db: SqlitePool` for incremental migration. Design in [`store-trait-design.md`](store-trait-design.md).

- **Custom user skins (all 4 clients)** — Fifth "Custom" slot in the theme picker. `skinValidation.ts` (token allow-list, forbidden-substring guard, `validateSkin`, `applySkinTokens/clearSkinTokens`, export/import helpers) shared across all clients. `SkinEditor` component: name field, base-theme selector, token groups (Surfaces / Text / Accent / Status / Border & Effects / Shadows / Radius), live preview via `setProperty`, per-token reset, Reset all, Export `.wavvonskin`, Import with validation. Desktop and android/wavvon-desktop persist via `load_appearance`/`save_appearance` Tauri commands (`~/.wavvon/appearance.json`); web and android/wavvon-web via `localStorage` key `wavvon:appearance`. Design in [`custom-themes.md`](custom-themes.md).

- **Block/ignore settings panel + DM-block server sync** — `BlockIgnoreSection` wired into all 4 clients (desktop, web, android/wavvon-web, android/wavvon-desktop); `toggleBlockUser` calls `PUT /identity/dm-blocks` on the active hub in all 4 clients so the server enforces DM blocking. Design in [`block-mute-ignore.md`](block-mute-ignore.md).

- **android/wavvon-desktop recovery contacts parity** — six Tauri commands (`list_recovery_contacts`, `set_recovery_contacts`, `remove_recovery_contact`, `list_admin_recovery_requests`, `approve_recovery_request`, `deny_recovery_request`) added to lib.rs with proper bearer auth; `RecoveryContactsSection.tsx` rewritten to use `invoke()` with correct field names (`pubkey`/`added_at`); workspace Cargo.toml fixed (added `wavvon-desktop/src-tauri` member, missing deps); `VoiceSettings` initializers updated for new audio profile fields.

- **android/wavvon-web recovery contacts parity** — `platform/commands/hubAdmin.ts` (recovery contact CRUD + admin queue commands), `RecoveryContactsSection.tsx` (contact list editor, K-of-N threshold, collapsible how-it-works guide, admin rotation-request queue with approve/deny), wired into `SettingsPage.tsx` Account tab alongside `IdentityBackupSection`. Types match actual server field names (`pubkey`/`added_at`).

- **E2E group DM member management** — hub `POST /conversations/:id/members` (add) and `DELETE /conversations/:id/members/:pubkey` (self-leave) routes; `DmEvent::MemberChanged` and `WsServerMessage::DmMemberChanged` wire the event to WS subscribers; `rotate_group_sender_key` Tauri command generates a fresh chain key (bumped version) for the remaining membership set; App.tsx handles `dm-member-changed` by refreshing conversations, deselecting if removed, and triggering key rotation.

- **Identity backup for android/wavvon-web** — `IdentityBackupSection` component (PBKDF2-SHA256 100k iterations + AES-256-GCM via `crypto.subtle`, same format as the web client) added to the Account tab of `SettingsPage`. Reads/writes the IndexedDB `IdentityRecord`; cross-client backup files are interchangeable between the web and android/wavvon-web clients.

- **Gaming Tier 1 capabilities enforcement** — hub `PUT /admin/games/:id/permissions` stores capability grants; `GET /admin/games` returns them; desktop `list_admin_games` and `set_game_permissions` Tauri commands wired end-to-end; admin UI in all four clients shows live capability toggles and explains their effect; `GameModal` enforces grants via `hasCapability()` before calling `game_post_message`, `game_get_recent_messages`, or `game_list_channel_users`.

- **Android multi-device pairing UI** — full device-pairing flow for android/wavvon-web: `identity/master.ts` (HKDF-SHA256 master key derivation matching the Rust crate), `identity/wire.ts` (wire format helpers byte-identical to Rust signing_bytes), `platform/commands/pairing.ts` (all eight pairing commands — getPairedIdentity, startPairingOffer, pollPairingStatus, completePairing, fingerprintPubkey, parsePairingOffer, claimPairingOffer, savePairedIdentity), `PairingSection.tsx` (E-side and N-side flows), `SettingsPage.tsx` full-screen overlay (Profile / Account / Appearance / Devices tabs). Gear button in ChannelSidebar now opens settings.

- **Unified screen-share modal (desktop)** — `ScreenSharePicker` replaced by `ScreenShareModal`; new `list_capture_sources` Tauri command (xcap + image + base64) enumerates monitors and application windows with 160×90 PNG thumbnails; modal shows Screens/Windows tab strip, thumbnail grid with selection ring, and audio/webcam settings section; `useScreenShare` passes `chromeMediaSourceId` to `getDisplayMedia` to bypass the OS picker entirely. Design in [`screen-share-modal.md`](screen-share-modal.md).

- **Banner channel upload seamless flow** — `POST /channels/:channel_id/upload` now returns `{"id": ...}` in the response; new `patch_channel_banner_file` Tauri command PATCHes `banner_file_id` onto the channel; `CreateChannelModal` accepts a `File` prop and `App.tsx` orchestrates the 3-step flow (create channel → upload file → patch banner_file_id) without any extra steps from the user.

- **Farm hub_spawned tracking fix** — farm's `handle_agent_socket` now parses `hub_spawned` messages from connected server agents and writes `process_port` + `server_id` to the `hubs` table; clears both on `hub_stopped`. `ServerEntry` includes `running_hub_count` so the fleet console shows live hub counts per server.

- **Android client QoL — global search, drafts, thread view, custom emoji picker** — `SearchBar` component (Ctrl+K shortcut) wired into android/wavvon-web `App.tsx`; `drafts.ts` utility ported and connected (load on channel switch, save on input change, clear on send); `EmojiPicker` loads hub custom emojis via `hubFetch("/emojis")`; `ContentArea` gains `expandedThreads`/`threadReplies` with localStorage persistence and inline reply rendering; `SortableChannelItem` renders draft badge; `reply_count` added to `Message` type.

- **Web client: message drafts, thread view, custom emoji picker** — `drafts.ts` utility ported verbatim from desktop; web `App.tsx` loads draft on channel switch, saves on input change, clears on send; `SortableChannelItem` gains `activeHubId` prop and renders the `channel-draft-badge`; `ContentArea` gains `expandedThreads`/`threadReplies` state with per-channel localStorage persistence, `toggleThread` fetches replies via `hubFetch`; `EmojiPicker` component created loading hub emojis from `hubFetch("/emojis")`, wired into the channel composer toolbar; `reply_count` added to `Message` type.

- **Admin panel auth — desktop + farm complete** — Farm crate now has
  `POST /farm/admin/totp/setup`, `/confirm`, `/disable` endpoints plus TOTP
  verification on admin login. Server agent binary (wavvon-server crate)
  reverse-connects via WebSocket to farm, manages hub processes on remote nodes.
  Farm hub routing delegates `create_hub` to connected agent if available,
  else local spawn. Desktop FarmSettingsPage gains two tabs: Servers (register
  form, one-time token display, agent list with status/last-seen) and Security
  (TOTP setup/confirm/disable). Hub server side (from prior session) already had
  8 endpoints, 3 new DB tables, session cookies, role-gating, and login HTML.
  Design in [`admin-panel-auth.md`](admin-panel-auth.md).
  *Superseded: hub web admin panel removed — see [decisions.md](decisions.md)
  ("Hub admin panel removed"). The farm-side pieces (server agent, TOTP on the
  farm console) remain.*

- **TOML config files for hub and farm** — `hub.toml` / `farm.toml` next to the binary replace scattered env vars. Load order: defaults → config file → `WAVVON_*` env vars (highest priority). `hub.toml.example` and `farm.toml.example` document every option. Hub operator guide updated.

- **Predictable hub ownership** — removed "first user to connect becomes admin" behaviour. Server operators now set the owner explicitly via `wavvon-hub admin users set-owner <pubkey>` (CLI) or through the web admin panel at `/admin/panel` → Ownership tab. The web panel gained a new Ownership section with a pubkey form. `GET/POST /admin/owner` endpoints added, protected by the existing web admin token.
  *Superseded: the `/admin/panel` web panel was removed — see [decisions.md](decisions.md). Ownership is now set at hub-creation time through the client wizard, or via the CLI.*

- **Android CI fully fixed** — workflow had been failing on every push since the repo was created; root causes: `tags:` indentation error (YAML treated it as an event, not a push filter), stale lockfiles in wavvon-desktop + wavvon-web, npm version mismatch requiring `npm install` over `npm ci`, missing `@tauri-apps/cli` + `tauri` script, `gen/android/` never initialised (`tauri android init` added to CI), and `intl-messageformat` peer dep not being installed. All fixed; CI now builds signed APKs on every push to main.

- **InvitesSection create-invite controls (desktop + android/desktop)** — Max-uses number input and expiry select had no labels; added `aria-label` to both.

- **IdentityBackupSection passphrase/label inputs (all 3 clients with this component)** — Export passphrase, confirm passphrase, backup label, and import passphrase inputs gained `htmlFor`/`id` (desktop) or `aria-label` (web + android/desktop) so screen readers announce the purpose of each credential field.

- **PairingSection device label (desktop)** — "Device label" input lacked `htmlFor`/`id`; fixed to match the android/desktop fix applied earlier.

- **Stable attachment keys (all 4 clients)** — `PendingAttachments` and `MessageAttachments` replaced `key={i}` with `key={a.name}` so removing an attachment doesn't cause React to reuse the wrong DOM node for remaining items.

- **Label/control sweeps — AudioProfileSection, ExternalBotSection (desktop), ForumComposer/HubAdminPage/RecoveryContacts (web), RecoveryContacts/PairingSection (android/desktop), ScreenShareViewer volume (android/web)** — All remaining unlinked form labels gained `htmlFor`/`id` or `aria-label` associations.

- **Label/control association — HubBotsSection, ChannelBansModal, LobbySettingsSection (desktop + android/desktop)** — "Create bot" name input, "Ban a user" user select (+ aria-label on reason input), and "Welcome message" textarea all gained proper `htmlFor`/`id` or `aria-label` associations.

- **Label/control association — FarmSettingsPage (desktop) + ChannelSettingsModal Talk power (desktop + android/desktop)** — Desktop FarmSettingsPage was missing the same `htmlFor`/`id` pairs already fixed on the web; ChannelSettingsModal Talk power number input was unlinked in both desktop and android/desktop.

- **maxLength on form inputs** — Channel name (64), channel description (280), role name (64), poll question (200), and poll options (100) gained `maxLength` constraints in desktop, web, and android/desktop so unbounded input can't reach the server.

- **Label/control association sweep — BotAdminSection, ForumComposer, BotWizard, FarmSettingsPage, AlliancesSection** — Webhook URL input in BotAdminSection (desktop + android/desktop), Title/Body in ForumComposer (desktop + android/desktop), bot display name in BotWizard (desktop + android/desktop), farm name/description/max-per-user/max-total/suspend-reason in FarmSettingsPage (web), and push-target-URL/join-code inputs in AlliancesSection invite tab (desktop + android/desktop) all gained matching `htmlFor`/`id` pairs.

- **Fix identity key no-op after hub add (desktop + android/desktop)** — `if (!publicKey) setPublicKey(null)` was a dead statement that left `publicKey` unset for first-time users who added a hub before identity initialized; replaced with an actual `get_my_public_key` invoke.

- **Remove localhost default from Add Hub URL inputs (web + android/web)** — `hubUrl` state in `App.tsx` and `WelcomeScreen` was initialized to `"http://localhost:3000"`, pre-filling the add-hub form with a development address invisible to end users. Changed to empty string.

- **Admin form label/control association sweep (desktop + android/desktop)** — HubAdminPage (hub name, description, antispam, max depth, discovery fields) and WebhooksSection (channel select, display name, avatar URL) gained `htmlFor`/`id` pairs in both clients.

- **Web form label/control association sweep** — EventComposer (title, description, location, start, end), DndSettingsSection (quiet-hours start/end), and SettingsPage (display name, avatar URL) all gained `htmlFor`/`id` pairs so screen readers announce labels when controls are focused.

- **Settings selects and DND time inputs label association** — Language, microphone, speaker, and media-output `<select>` elements in desktop and android/desktop SettingsPage, plus DND quiet-hours `<input type="time">` in android/desktop DndSection, all gained `id`/`htmlFor` pairs for proper screen-reader label announcement.

- **CertificationsSection label/input linkage + DiscoverPage badge keys** — Number inputs for cert min-age and validity now have `htmlFor`/`id` pairs (web + android/desktop) so screen readers announce the label on focus; DiscoverPage badge list replaced `key={i}` with a stable composite key.

- **Icon-only button accessibility sweep (all clients)** — WhisperPanel close/delete-list, AllianceInvitesSection/AlliancesSection dismiss-error, SortableItems volume-close, ForumPostDetail clear-reply, and GameModal permissions-dismiss buttons all gained `aria-label` + `title`.

- **PollComposer stable option keys (desktop + web)** — `options` state changed from `string[]` to `{id,value}[]` with a `useRef` counter; `key={i}` → `key={opt.id}`, preventing React from clobbering input values when an option is removed from the middle of the list.

- **Stable DM message keys (all 4 clients)** — `id?: string` added to `DmMessage`; all `getDmMessages` mapping sites now pass through the server UUID; `ContentArea` DM renders use `key={m.id ?? \`${m.timestamp}-${m.sender}\`}` instead of the array index, preventing React from reusing stale DOM nodes when messages are deleted.

- **android/wavvon-web nav semantics + message list ARIA** — `ChannelSidebar` `<div className="sidebar">` promoted to `<nav aria-label="Channels">`; Settings gear button gains `aria-label`; `ContentArea` messages container gains `role="list" aria-label="Messages"`; each message `<div>` gains `role="listitem"`.

- **GameModal dialog semantics + android/web ContentArea aria-labels** — `GameModal` gains `role="dialog" aria-modal` + `aria-label={game.name}` + `aria-label="Close"` on close button in desktop, web, and android/desktop; android/wavvon-web `ContentArea` message-action buttons (Reply, Copy link, Edit, Delete), search button, member-toggle button, and reply-banner close all gain `aria-label` to match their `title` text.

- **Icon-only button aria-label + ScreenSharePicker/GamePicker dialog semantics** — `Attachments` remove button gains `aria-label="Remove"` in all four clients; `Lightbox` close button gains `aria-label="Close"` in desktop and android/desktop; `GamePicker` gains `role="dialog"` + `aria-labelledby` in desktop/web/android-desktop; `ScreenSharePicker` gains `FocusTrap`, Escape handler, `role="dialog"`, and `aria-label="Camera"` on the device select in desktop; android/desktop `ScreenSharePicker` gets the same role and select label.

- **role="dialog" + aria-modal parity across all four clients** — `AddHubModal`, `CreateChannelModal`, `EditDescriptionModal`, `BotWizard`, and `FarmSettingsPage` sub-dialogs across desktop, web, android/desktop, and android/web all gain `role="dialog" aria-modal="true" aria-labelledby`; `BotWizard` also gains `FocusTrap` + Escape handler in both clients that were missing it; `FarmSettingsPage` `SuspendDialog` and `DeleteHubDialog` gain `FocusTrap` in both clients.

- **android/wavvon-web full accessibility parity** — `FocusTrap` component created; `AddHubModal` and `ReactionPicker` now trap keyboard focus and close on Escape; `ScreenShareViewer` migrated from single-stream find() to sharerMap grouping by `sharer_pubkey` (multi-sharer support); four focus-ring `box-shadow` gaps fixed (`.recovery-input`, `.user-list-filter input`, `.palette-input`, `.reaction-picker-search`); `App.tsx` gains `assertive` (hub connect/disconnect) and `polite` (voice join/leave) `aria-live` regions.

- **FocusTrap on Android ScreenSharePicker/GameModal/GamePicker + web ReactionPicker; voice announcements wired** — four overlay components were trapping no keyboard focus and ignoring Escape; all now wrap in FocusTrap with Escape handlers. Android `voicePoliteAnnouncement` state (added previous turn) is now populated by `voice-participant-joined` and `voice-participant-left` events so screen readers hear participant changes.

- **Multi-sharer ScreenShareViewer parity + Android aria-live + web PinnedMessagesModal FocusTrap** — web and Android ScreenShareViewer were only rendering the first screen/webcam stream globally; both now group by sharer_pubkey matching desktop. Android App.tsx was missing aria-live regions entirely; added assertive (disconnect/reconnect) and polite (voice) regions. Web PinnedMessagesModal had role="dialog" but no FocusTrap or Escape handler; both added.

- **Accessibility parity sweep (web + Android) + ChannelSidebar landmark fix** — focus-ring `box-shadow` added to `.recovery-input`, `.user-list-filter input`, `.reaction-picker-search`, and `.palette-input:focus-visible` in both web and Android clients (same fix previously applied to desktop); `channel.sidebar.label` i18n key added to all four locales; desktop `ChannelSidebar` `<nav>` was using `member.list.title` ("Members") — now correctly uses `channel.sidebar.label` ("Channels").

- **Per-sharer independent overlay windows + accessibility focus rings** — `ScreenShareOverlay` now renders one independently draggable/resizable floating window per concurrent sharer (composite ref routes `appendChunk`/`stopStream`/`attachStream` by stream_id→pubkey); five input variants (global search, recovery, palette, reaction picker, member filter) that overrode the global `:focus-visible` rule now carry the consistent `box-shadow: 0 0 0 3px var(--ring)` ring on keyboard focus.

- **Markdown rendering, link previews, keyboard shortcuts, code quality** — `MessageContent` migrated to `marked` + `DOMPurify`; `LinkPreviewCard` + `fetch_link_preview` Tauri command + hub `GET /link-preview` endpoint; `@` mention autocomplete, `Alt+↑/↓` unread channel navigation, `Escape` dismiss shortcuts; `useMessages` and `useChannels` extracted from App.tsx (composition root pattern); `tests/common.rs` shared hub test helper; all remaining `unwrap()` in `hub/src` replaced with `?`/`ok_or`; remaining Tauri commands migrated to `Result<T, AppError>`. Ships in hub, desktop, and web.

- **Markdown rendering, link previews, keyboard shortcuts, hook extraction, typed errors** — `MessageContent` migrated to `marked` + `DOMPurify` (allow-listed tags, `rel=noopener noreferrer` on all links); `LinkPreviewCard` + lazy `fetch_link_preview` Tauri command; `@` mention autocomplete in channel composer; `Alt+↑/↓` jumps to next/prev unread channel; `Escape` dismisses context menu / palette / reply target; `useNotificationPrefs`, `useUnreadCounts`, `useTypingIndicators`, `useHubConnections` extracted from App.tsx (tsc clean after each); `AppError` enum added to lib.rs, `send_message`, `edit_message`, `delete_message`, `add_reaction`, `remove_reaction`, `get_messages` migrated to `Result<T, AppError>`.

- **File uploads, message pinning, user profiles, polls, events, notification prefs** — full stack: `POST /channels/:id/upload` multipart endpoint + `RemoteAttachment` wire type; `POST/DELETE /channels/:id/pins` + pinned-message broadcast; `GET /users/:pubkey/profile` server route; poll and event REST endpoints (`polls`, `poll_votes`, `hub_events`, `event_rsvps` tables); per-hub notification preference storage. Desktop and web clients wired end-to-end: `uploadFile` Tauri command, `PinnedMessagesModal`, `UserProfileCard`, `PollCard`/`PollComposer`, `EventCard`/`EventsPanel`/`EventComposer`, `getNotifPref`/`setNotifPref`. WS handler extended for `message_pinned`, `message_unpinned`, `poll_created`, `poll_updated`, `poll_deleted`.

- **Web client feature batch** — file/image upload (`uploadFile` platform call, `RemoteAttachment` type, multipart POST), message pinning (`PinnedMessagesModal`, pin/unpin in message toolbar for admins, 📌 button in channel header), user profile cards (`UserProfileCard` opens on sender name click), native polls (`PollCard` with animated vote bars, `PollComposer` modal), events/calendar (`EventCard`, `EventsPanel`, `EventComposer` modal), per-hub browser notification preferences (`getNotifPref`/`setNotifPref` helpers, settings UI in Notifications tab). WS handler extended for `message_pinned`, `message_unpinned`, `poll_created`, `poll_updated`, `poll_deleted`.

- **Web client chat feature parity** — typing indicators (`typing_start`/`typing_stop` WS events, debounced send, per-channel "X is typing…" display), unread counts (`GET /channels/unread` seeded on hub load, `POST /channels/:id/read` on channel select), and `reactions_updated` WS event handling now wired in the web client. All 7 chat features (WS auto-reconnect, message edit/delete, unread+read, typing, reply-to, invite links, emoji reactions) are now live in the web client.
- **Rate limiting + RateLimiters refactor** — per-user 30 msg/60 s guard on `POST /messages` and DMs; all AppState rate-limit fields consolidated into a `RateLimiters` struct, fixing all 34+ test setups.
- **Admin audit log in desktop React settings** — `HubAuditLogSection` React component added to the desktop settings panel.
- **Web client parity** — SearchBar, WelcomeScreen, SettingsPage (hub settings + user profile), UserContextMenu, and MobileShell added to the web client, closing the highest-priority component gaps.
- **Pre-launch hardening** — server panic fixes (games.rs), `GET /health`, auth
  rate limiting, `GET /federation/listing` hub directory + HubBrowser client UI +
  listing toggle in admin, WelcomeScreen first-run experience, friendlier hub-join
  errors, discovery dead-end notice, game permissions notice, Windows signing CI
  wired, three new docs (getting-started, hub-operator-guide, games-sdk).
- **Cert/badge, game management, discovery Tauri commands** — all remaining
  missing commands wired: `get_cert_settings`, `list_issued_certs`, `save_cert_settings`,
  `issue_cert`, `revoke_cert`, `fetch_my_certs`, `list_badges`, `list_pending_badges`,
  `accept_badge`, `decline_badge`, `remove_badge`, `grant_badge`, `list_admin_games`,
  `fetch_game_manifest`, `install_game`, `uninstall_game`, `set_game_permissions`,
  `set_game_channels`, `game_list_channel_users`, `game_post_message`,
  `game_get_recent_messages`, `game_kv_get`, `game_kv_set`, `get_discovery_settings`,
  `set_discovery_tags`. Hub also gained `GET /admin/settings/certs` and nsfw support
  on `GET/PATCH /admin/settings/tags`.
- **Forum channels** — `forum_list_posts`, `forum_get_post`, `forum_create_post`,
  `forum_create_reply`, `forum_get_post_replies`, `forum_pin_post`, `forum_lock_post`
  Tauri commands wired; hub routes and UI components (`ForumPostList`, `ForumPostDetail`,
  `ForumComposer`) were already complete. Design in [`forum.md`](forum.md).
- **Block / ignore / DND persistence** — `load_ignored_users` / `save_ignored_users` and
  `load_dnd_settings` / `save_dnd_settings` Tauri commands added; App.tsx seeds both
  states from disk on startup. Phase 1+2 client-side block/ignore is now fully persistent.
  Design in [`block-mute-ignore.md`](block-mute-ignore.md).
- **Multi-stream screen share overlay** — floating, draggable, resizable `ScreenShareOverlay`
  replaces the inline viewer; multiple co-op streams tile in a CSS grid. Hub cap removed —
  unlimited concurrent sharers per channel. Design in [`decisions.md`](decisions.md).
- **E2E group DMs** — sender-key scheme; hub endpoints + Tauri commands +
  desktop client all complete. Design in [`e2e-encryption.md`](e2e-encryption.md).

- **Whisper UI** — `useWhisper` hook with inbound event tracking and
  list persistence. `WhisperPanel` in the voice bar with User/Channel/Saved
  Lists tabs, target checkboxes, one-click activate, save-as-list form.
  Inbound whisper badge on participant rows in the channel sidebar.
  Design in [`whisper.md`](whisper.md).
- **Hub server operations** — backup/restore CLI, data retention sweep,
  Prometheus `/metrics`, hub key rotation (`wavvon-hub rotate-key` +
  `GET /key-rotation`). Design in [`hub-operations.md`](hub-operations.md).
- **Hub admin tooling** — web admin panel at `/admin/panel` (token-gated,
  embedded HTML), `wavvon-hub admin` CLI subcommands, farm heartbeat +
  fleet console. Design in [`hub-admin-panel.md`](hub-admin-panel.md).
  *Superseded: the `/admin/panel` web panel was removed — see [decisions.md](decisions.md)
  ("Hub admin panel removed"). The admin CLI and farm console remain.*
- **Hub moderation enhancements** — federated ban lists (`GET /federation/banlist`,
  6h background sync), auto-mod webhook (500ms, fail-open, HMAC-SHA256),
  content reporting (`POST /messages/:id/report`, admin review queue).
  Design in [`moderation-enhancements.md`](moderation-enhancements.md).
- **Discovery: full suite** — hub uptime tracking, global search, farm
  browsing catalog, anonymous aggregate analytics, hub config template
  catalog, hub creation wizard (`/new`). Design in
  [`discovery-v2.md`](discovery-v2.md) and
  [`hub-creation-wizard.md`](hub-creation-wizard.md).
- **Hub first-run bootstrap** — `WAVVON_TEMPLATE_URL` / `WAVVON_BOOTSTRAP_TOKEN`
  on empty-DB first launch; applies channels, roles, hub name from template.
  Design in [`hub-creation-wizard.md`](hub-creation-wizard.md).
- **Client quality-of-life** — global message search (FTS5), message drafts,
  custom emojis per hub, events/calendar (`EventCard`, `EventsPanel`),
  native polls (`PollCard`, live bars), thread collapse/expand, notification
  grouping (3s per-hub debounce). Design in [`client-qol.md`](client-qol.md).
- **Events / calendar** — `hub_events` + `event_rsvps` tables, full REST,
  `EventCard`, `EventsPanel`, Tauri commands. Design in [`client-qol.md`](client-qol.md).
- **Native polls** — `polls` + `poll_votes`, live broadcast, `PollCard`,
  Tauri command. Design in [`client-qol.md`](client-qol.md).
- **Video in voice channels** — WebRTC mesh, active-speaker management
  (top-3, 3s linger), `VideoGrid` (equal grid ≤4, active-speaker+thumbnails
  5+, self-view overlay), `BackgroundProcessor` (MediaPipe none/blur/image),
  camera toggle + background picker in voice bar, hub signaling envelopes.
  Scale: mesh works up to ~20; SFU hook designed-in for large events.
  Design in [`video-voice.md`](video-voice.md).
- **Voice advanced settings** — Standard / Music / Custom audio quality
  profiles. `EffectiveVoiceConfig` resolved at pipeline start; Denoiser
  bypass; VAD gate per-profile; custom Opus bitrate, app mode, channels,
  frame size, complexity. Settings persisted to `voice.json`.
  Design in [`voice-advanced-settings.md`](voice-advanced-settings.md).
- **Windows Authenticode signing** — CI signing wired in `release.yml`;
  activates once `WINDOWS_CERT_THUMBPRINT` secret is set (cert procurement
  never completed; signing has since been deferred — see code-signing.md).
- **Per-participant voice volume** — `sender_id` in UDP fan-out,
  per-sender gain pipeline, volume slider in channel sidebar, persistence
  to `voice_gains.json`. Design in [`voice-volume.md`](voice-volume.md).
- **Proximity voice** — voice zones in hub (WS protocol, in-memory state,
  `manage_voice` permission), client-side attenuation (4 models), game SDK
  calls (`wavvon:createVoiceZone`, `wavvon:setVoicePosition`). Design in
  [`proximity-voice.md`](proximity-voice.md).
- **Gaming Tier 2 client SDK** — `wavvon:game:ready/start/send/end/
  snapshot/sharedKvGet|Set/setJoinPolicy` postMessage calls, incoming
  event delivery to iframe, Activities live-session badge, session
  create/join/leave Tauri commands. Full Tier 2 now complete.

