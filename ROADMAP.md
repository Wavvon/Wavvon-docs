# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
The full history of shipped work lives in
[`docs/shipped-log.md`](docs/shipped-log.md).

## 🔨 Next up

- [x] **Remove games feature** — replaced by bots; iframe/session infrastructure
  is dead weight. Individual tasks below:
  - [x] **S1** — Delete `hub/src/routes/games/` (admin, session_v1, session_v2,
    helpers, models, mod); deregister all `/games/*` and `/admin/games/*` routes
    from the axum router. Run `cargo check`.
  - [x] **S2** — Delete `hub/src/routes/ws/handlers/game.rs`; remove all game
    variants from `WsClientMessage`/`WsServerMessage` enums. Run `cargo check`.
  - [x] **S3** — Delete `farm/src/routes/games.rs`; deregister farm game routes.
    Run `cargo check`.
  - [x] **S4** — Remove `GameStore` trait from `wavvon-store` and its SQLite
    implementation from `wavvon-store-sqlite`. Run `cargo check`.
  - [x] **S5** — Drop the 6 game tables from `db/migrations.rs` (`hub_games`,
    `enabled_games`, `channel_games`, `game_sessions`, `game_shared_kv`,
    `game_channel_kv`); remove `HubGameRow`/`GameSessionRow` from `row_types.rs`;
    drop `active_game_sessions`, `GameSessionState`, and `GamePlayer` from
    `state.rs`. Run `cargo test`.
  - [x] **D1** — Delete `src-tauri/src/games.rs`; remove its `register()` call
    from `lib.rs`. Run `cargo check`.
  - [x] **D2** — Delete `GameModal.tsx`, `GamePicker.tsx`, `GamesAdminSection.tsx`;
    remove the Activities button and all game state from `ContentArea`/`App.tsx`.
  - [x] **D3** — Remove game types (`InstalledGame`, `GameAdminInfo`,
    `GameSession`, `GameSessionPlayer`, `GameSessionDetail`) from `types.ts`.
    Run `tsc --noEmit`.
  - [x] **W1** — Delete `apps/web/src/components/GameSessionPanel.tsx` and
    `GameModal.tsx`; remove game wiring from `App.tsx`. Run `tsc --noEmit`.
  - [x] **A1** — Delete `apps/android/.../GameSessionView.tsx`; remove game
    wiring from the Android app. Run `tsc --noEmit`.
  - [x] **Docs** — Delete `docs/gaming.md` and `docs/games-sdk.md`; remove all
    `/games/*` paths from `openapi.yaml`; remove game message types from
    `ws-protocol.md`; remove "bot-launched game modals" from the bot
    deferred-scope known issue.

- [x] **Bot mini-apps + bot media** — generic mechanism for bots to embed
  interactive web experiences and inject audio/video into channels.
  Design: [`bot-mini-apps.md`](bot-mini-apps.md), [`bot-media.md`](bot-media.md).
  Individual tasks below:
  - [x] **M1** — Add `mini_app_url` field to bot registration (`POST /bots`);
    store in DB; return in `GET /bots/{id}`. Run `cargo check`.
  - [x] **M2** — Add `bot_app_launch`, `bot_app_join`, `bot_app_open`,
    `bot_app_close` variants to `WsServerMessage`/`WsClientMessage`. Implement
    `bot_app_join` handler: verify bot is registered, mint scoped session token
    (channel-bound, TTL 4h), send `bot_app_open` back to the joining client.
    Run `cargo test`.
  - [x] **M3** — Hub: `POST /bots/{id}/voice/join` — verify bot, mint voice
    token, register bot as voice participant; `DELETE /bots/{id}/voice/leave`.
    Bot appears in `GET /voice/participants` with `is_bot: true`. Run `cargo test`.
  - [x] **M4** — Hub: `POST /bots/{id}/screenshare/start` — register bot stream
    in `hub_streams`; `DELETE /bots/{id}/screenshare/stop`. Run `cargo test`.
  - [x] **M5** — Desktop client: open a second sandboxed `WebviewWindow` on
    `bot_app_open`; inject `__WAVVON_HUB__`, `__WAVVON_TOKEN__`,
    `__WAVVON_CHANNEL__`, `__WAVVON_BOT_ID__`. Render launch card in channel
    on `bot_app_launch`. Run `cargo check` + `tsc --noEmit`.
  - [x] **M6** — Web client: render launch card on `bot_app_launch`; open
    sandboxed `<iframe>` on join; deliver token via `postMessage`. Run `tsc --noEmit`.
  - [x] **M7** — Android client: mirror desktop `WebviewWindow` approach.
    Run `tsc --noEmit`.
  - [x] **M8** — Add `requires_camera` to bot registration; add
    `bots.allow_camera` gate to `hub.toml`/settings; plumb camera permission
    into webview CSP on all three clients. Run `cargo check` + `tsc --noEmit`.
  - [x] **Docs** — Add `bot_app_*` WS messages to `ws-protocol.md`; add
    `/bots/{id}/voice/join`, `/bots/{id}/screenshare/start` to `openapi.yaml`;
    update bot operator guide with mini-app and media sections.

- [ ] **Networked voice — Phase 1, cross-internet test** — server + desktop
  shipped 2026-06-12/13; Android Tauri shell ported 2026-06-13; web voice
  shipped 2026-06-13 via WebSocket audio relay. All four clients complete.
  First cross-internet voice test pending (pilot hub). Phase 2 (voice
  encryption) is separate.
- [ ] **First external operator pilot (videogamezone.eu)** — hub v0.2.3 LIVE
  at `https://wavvon.videogamezone.eu`. Remaining: first cross-internet voice
  test (everything shipped, just needs two humans), friend onboards +
  ownership transfer, doc-test feedback, two-operator federation test.
- [ ] **Fix macOS desktop build: xcap 0.9.6 now compiles** — bumped from
  0.0.14 to 0.9.6 to resolve upstream E0282 error; call sites in
  `screen_share.rs` updated for new API. Verify in CI before removing from
  Known issues.
- [x] **Fix the aarch64 hub binary build** — replaced `aarch64-linux-gnu-gcc`
  (GNU ABI, incompatible with musl) with `cargo-zigbuild` (Zig provides its
  own musl headers; handles aws-lc-sys/ring C objects cleanly). x86_64 and
  Docker builds unchanged.
## 🤔 Design questions

- **Farm agent WS token in URL query string** — registration tokens appear in
  `/ws/agent?token=…` and therefore in access logs. Moving to a header or a
  first-message auth frame requires a coordinated server/agent protocol change.

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).
- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

## 📌 Wishlist (undesigned)

- **WebAuthn / Passkey authentication + "Trust this device"** — replace
  seed-phrase identity storage with device-native authenticators (Face ID,
  Windows Hello, YubiKey) across all three clients. No passphrase, no plaintext
  key on disk, survives hub identity rotation. "Trust this device" issues a
  long-lived device token in platform-secure storage so repeated opens skip the
  biometric tap. Additive — existing seed flow stays as fallback.
  Design: [`webauthn-auth.md`](docs/webauthn-auth.md). Estimate ~9 days.

- **Project visibility push** — remaining: a hosted demo hub, directory listings, launch post.
  Needed both for adoption and for the code-signing re-application.
  *(2026-06-10: all six READMEs rewritten as landing pages with badges,
  cross-links, and a `docker compose` quick-start.
  2026-06-11: demo-seed tool added; real screenshots + join-flow GIF added to READMEs.)*
- **E2E v2 — Double Ratchet** — forward secrecy upgrade from the shipped
  static-ECDH and sender-key schemes. See
  [`e2e-encryption.md`](docs/e2e-encryption.md).

## 🚀 Recently shipped

- **Full PostgreSQL backend (2026-06-27)** — SQLite removed from the server
  entirely; `wavvon-store-sqlite` crate deleted and replaced by
  `wavvon-store-postgres`. sqlx features trimmed to `postgres + runtime-tokio
  + macros + chrono + uuid`; hub, seed, and farm all use `PgPool`/`PgPoolOptions`.
  New `wavvon-store-postgres` crate (19 impl files) covers every `HubStore`
  sub-trait with PostgreSQL DDL: `BOOLEAN` columns, `BIGINT` timestamps,
  `BIGSERIAL` for audit-log, `GREATEST()` instead of `MAX()`, `EXTRACT(EPOCH
  FROM NOW())` instead of strftime, `(created_at, id)` tuple pagination
  replacing rowid-based pagination, and a TODO placeholder where SQLite FTS5
  was. All 18 hub integration test files updated to create a fresh isolated
  PostgreSQL database per test (UUID-named, migrations pre-applied) via
  `create_test_db()` in `tests/common.rs`. CI gains a `postgres:16-alpine`
  service container with health checks and `TEST_DATABASE_URL` wired to
  `cargo test`.

- **Web client stabilisation pass (2026-06-22/23)** —
  Welcome screen: gated on `hubs.length === 0` (removed stale
  `seenWelcome` localStorage gate); "Hosted by [url]" link added to
  both `WelcomeScreen` and `AddHubModal` hub preview cards.
  Channel creation: `CreateChannelModal` wired from all three entry
  points (hub dropdown, category "+" button, right-click menu); added
  Banner and Category types alongside Text and Forum.
  Channel management: `ChannelSettingsModal` created — pre-filled
  name/description edit, two-step delete confirmation; accessible via
  gear icon (`onOpenChannelSettings`) and right-click context menu.
  WS event audit: `forum_event`, all screen-share signalling
  (`screen_share_offer_in/answer_in/ice_in`,
  `screen_share_viewer_joined/left`, `stream_subscribed/ended/hub_streams`),
  and video/whisper events (`voice_whisper_started/stopped`,
  `video_participant_enabled/disabled/participants`,
  `video_offer_in/answer_in/ice_in`) wired into `ws.ts` dispatch.
  Profile: `SettingsPage` calls `onProfileSaved` after `PATCH /me`;
  `App.tsx` re-fetches `/me` and `/users` so display name updates in
  the member list immediately. Hub server CI: `moderation_flow` tests
  fixed — `ws_voice_join_and_recv` helper now skips `member_online`/
  `member_offline` frames before matching the expected event.

- **Web client audit remainder (W5–W24) — 13 findings fixed (2026-06-14)** —
  W5: reactions broadcast preserves `me` flag. W7: `voice_participant_speaking`
  wired; speaking ring lights. W9: `dm_member_changed` WS event handled. W11:
  poll event names fixed; `onPin`/`onPoll` wired. W14: events types corrected
  (`starts_at`, `rsvp_counts`); RSVP uses POST/cancel. W15: farm unsuspend
  uses correct endpoint. W17: pending-approval hub shows landing screen. W18:
  alliance shared channels fetched on hub connect. W19: mention pings play audio
  + OS notification on permission. W20: `pingHub` called on interval. W21:
  `UserContextMenu` wired; right-click on members works. W22: group-DM
  `group_encrypted_envelope` handled (placeholder for encrypted-only clients).
  W23: scroll position tracked; "N new messages" pill wired. W24: unmounted
  components cleanup — DiscoverPage, IdentityBackupSection, PollComposer,
  EventsPanel, GameSessionPanel, ExternalBotSection. Web client is now a
  credible public demo.

- **CI build fixes (2026-06-14)** — Android: `@noble/curves` and
  `@noble/hashes` added as direct deps, resolving Rollup import failure.
  Desktop macOS: `xcap` bumped 0.0.14 → 0.9.6 (E0282 fixed); call sites in
  `screen_share.rs` updated for new API. Auto-tag correctly dispatches release
  workflows via `gh workflow run` (stale "never triggers" known issue removed).

- **App.tsx decomposition — channel-message, alliance, WS hooks (2026-06-14)** —
  desktop App.tsx 3,259 → ~1,450 lines; android App.tsx 993 → ~560 lines.
  Desktop: `useChannelMessages` owns all message/search/notification state and
  chat event listeners (message, message_edited, message_deleted,
  chat-reactions-updated, post-created, reply-created); `useAlliances` owns
  alliance state + `loadAlliances()`; `useWsHandlers` registers hub-ws-status,
  voice, DM, hub-error, and hub-session-lost Tauri listeners. Ref ordering fixed
  (myDisplayNameRef/selectedChannelIdRef hoisted; stable clearInputRef pattern
  breaks useDms forward-reference). Android: same three hooks; stableHandlers
  wired via stable setter refs to avoid useMemo staleness. pnpm typecheck clean
  across all three apps.

- **Desktop voice/composer UI pass + web screen-share viewing (2026-06-13)** —
  D5b: attach+poll collapsed into a "+" menu in desktop `ChannelComposer`;
  D3/D9: voice control bar buttons (mic, deafen, screen-share, camera) replaced
  with SVG icons in `ChannelSidebar`; D6: joining a new voice channel now
  implicitly leaves the current one (`useVoice.handleVoiceJoin`);
  D2: camera button enumerates devices on first enable — shows a selector when
  multiple cameras are available (`useVideo.enableVideo`/`switchCamera`);
  D4: screen-share source grid gains `max-height: 300px; overflow-y: auto`.
  W8: web screen-share VIEWING now works — `HubWebSocket` gains binary frame
  support (`binaryType = arraybuffer`, `pendingChunkEnvelope` pattern), and
  `App.tsx` wires `activeScreenShares` state + `onScreenShareChunk` handler
  through to the existing `ScreenShareViewer` component. tsc clean.

- **Hub: first-user-becomes-owner bug fixed (2026-06-13)** — `assign_initial_roles`
  now skips the auto-owner grant when `WAVVON_OWNER_PUBKEY` is configured
  (startup seeding already creates the correct owner row before traffic starts).
  `AppState` gains `owner_pubkey: Option<String>`; all test files updated.

- **H4 federated-DM sender spoofing fixed (2026-06-13)** — Ed25519
  signature verification is enforced on all three receive-federated-DM
  paths (encrypted, group-encrypted, plaintext) in
  `hub/src/routes/dms/messages.rs`. All hub audit findings from the
  [2026-06-11 audit](code-audit-2026-06-11.md) are now resolved: H2/H3
  (presence refcount + bot_sessions per-session), H4 (federated-DM
  spoofing), H5/H6 (rate-limiter trusted-proxy + IPv6 canonicalization).

- **Web voice via WebSocket audio relay (2026-06-13)** — browsers cannot send
  raw UDP, so a second voice path was added: hub gains a `/voice/ws` WebSocket
  endpoint; web clients authenticate with the session token + channel_id, receive
  a `voice_ws_ready` JSON frame with `sender_id` and current participants, then
  exchange binary Opus frames in the same wire format as UDP clients (`[seq:u16
  BE][ts:u32 BE][opus...]` upload; `[sender_id:u16 BE][packet_type:u8][seq:u16
  BE][ts:u32 BE][opus...]` download). Hub fan-out in `main.rs` now routes to both
  UDP (desktop/android) and WS (web) participants in the same channel.
  `voice_ws_senders` and `voice_udp_socket` added to `AppState`; `leave_voice`
  and `get_voice_participants` made pub for use by the new `routes/voice_ws.rs`
  handler. Web client gains `opusscript` (WASM Opus encoder/decoder) and a new
  `VoiceWsSession` class in `apps/web/src/platform/voice.ts` that captures
  microphone audio via `getUserMedia`, encodes with a `ScriptProcessorNode`
  (960-sample / 20ms frames at 48 kHz), and decodes/plays incoming frames.
  `App.tsx` voice handlers replace `showVoiceNotAvailable()`. All four clients
  (desktop UDP, android UDP, web WS, hub) now participate in shared voice
  channels. Hub: 245/245 tests passing. Web: tsc clean.

- **Client monorepo consolidation — all 5 stages complete (2026-06-13)** —
  Wavvon-desktop, Wavvon-web, and Wavvon-android collapsed into the single
  Wavvon-client pnpm + Cargo monorepo across 5 commits:
  Stage 0 (scaffold), Stage 1 (`packages/core` + unified invite parser
  `parseHubInput`), Stage 2 (fold `@wavvon/utils` + noble crypto into core),
  Stage 3 (`packages/ui` + 10 shared components + single `styles.css`),
  Stage 4 (`packages/platform` interface + android fork collapse into
  `apps/android/android`), Stage 5 (CI consolidated — `build.yml` with
  path-gated per-app jobs and real vite builds; `release-desktop.yml`
  with dual-checkout removed; `release-web.yml` and `release-android.yml`
  added). Double-React `file:` hazard eliminated, cross-repo Vite alias
  eliminated, dual-checkout release eliminated.

- **Hub optionally self-serves the web client (2026-06-13)** — new
  `WAVVON_WEB_CLIENT_DIR` setting (env var + hub.toml). When set, the hub
  serves a pre-built SPA at `/` via tower-http `ServeDir` with a custom
  fallback handler: unmatched paths with `Accept: text/html` get `index.html`
  (SPA deep links work); unmatched paths without `Accept: text/html` get a
  plain 404 (API error semantics preserved). index.html is cached at startup
  with `<script>window.__WAVVON_HOME_HUB__=window.location.origin;</script>`
  injected before `</head>` so the client defaults to its serving hub.
  --doctor and startup banner extended. The official Docker image gains a
  `node:22-slim` web-builder stage (Wavvon-web checked out to `web-client-src/`
  in CI via the release workflow; a `web-client-src*` wildcard COPY tolerates
  absence for local builds); `WAVVON_WEB_CLIENT_DIR=/web-client` is the default
  in the image. Release workflow checks out Wavvon-web before `docker build`.
  7 integration tests in `hub/tests/web_client_flow.rs`; full workspace green.
  Decision + rationale in [decisions.md](docs/decisions.md).

- **Networked voice Phase 1 — token-gated source-address learning (2026-06-12)**
  — hub relay no longer registers clients as 127.0.0.1. On `voice_join` the hub
  mints a 32-byte single-use UDP register token (delivered in the `voice_joined`
  WS reply as `udp_register_token`). The client sends a VXRG packet
  (`b"VXRG"` + 64-char hex token) to the hub's voice UDP port; the hub binds the
  packet's **real** source address into `voice_addr_map` and replies VXRA. The
  relay's fan-out is now gated on `voice_addr_map` membership, enforcing the
  hard invariant that audio is never sent to an unregistered address. Pending
  binds expire after 30 s and are purged opportunistically. Consumed tokens are
  stored per address for idempotent re-ack on UDP retry. leave_voice removes
  both pending and consumed records. Five new integration tests (7a–7e) in
  `hub/tests/voice_relay_flow.rs`; full workspace green.
  Desktop/web/android client changes needed next (see Next up above).

- **H5/H6 rate-limiter trusted-proxy + IPv6 canonicalization (2026-06-12)** —
  `rate_limit.rs` gains a `WAVVON_TRUSTED_PROXY` setting (default false). When
  enabled, the limiter derives the real client IP from the last
  `X-Forwarded-For` entry (the hop the proxy observed) instead of the raw socket
  address, fixing accidental hub-wide login lockout behind Caddy/nginx (H5).
  All IPs are canonicalized before keying: IPv4-mapped IPv6 (`::ffff:a.b.c.d`)
  collapses to the plain IPv4 address; genuine IPv6 is bucketed at the /64
  prefix (high 64 bits, low 64 zeroed), closing the unlimited-bucket-mint attack
  vector from a single /64 (H6). Effective mode logged in the startup banner.
  6 new unit tests + existing 3 integration tests all pass.

- **H2/H3 presence refcount + bot_sessions per-session (2026-06-12)** —
  `online_users` changed from `HashSet<String>` to `HashMap<String, usize>`;
  connect increments, disconnect decrements and only removes the key at zero,
  so multi-device / reconnect-overlap no longer falsely marks a user offline.
  `bot_sessions` changed from `HashMap<pubkey, Sender>` to
  `HashMap<pubkey, HashMap<session_id, Sender>>`; each WS session registers
  under its own UUID and removes only its own entry on disconnect, so the
  older session's sender survives. `ScreenStreamMeta` gained a `session_id`
  field and disconnect cleanup now retains streams from other sessions.
  4 new tests in `hub/tests/presence_multi_session_flow.rs`; all 44 test
  suites green.

- **Hub CORS layer + self-describing CLI (2026-06-11)** — `WAVVON_CORS_ORIGINS`
  env-var (default `*`) wires a tower-http `CorsLayer` onto the main axum
  router; `--help` prints a generated env-var table, `--version` prints the
  version, `--doctor` runs pre-flight checks (port bind, TLS PEM validity,
  working-dir write), and the startup banner logs effective port, scheme,
  UDP port, TLS state, CORS origins, and data-file paths with TLS-disabled
  and voice-UDP firewall warnings. Four CORS integration tests added.
  hosting.md and browser-client.md updated.

- **Real screenshots + join-flow GIF in READMEs; web client fixes; demo-seed tool (2026-06-11)** —
  screenshots and join-flow GIFs added to main/desktop/web/hub READMEs; web client desktop layout CSS fix, message ordering fix, onboarding style improvements, voice roster bootstrap via `GET /voice/participants`; demo-seed tool populates a fresh hub with 8 identities, 5 channels, ~30 messages, a poll, and emoji reactions.

- **Web onboarding styling + voice roster bootstrap (2026-06-11)** — web
  client onboarding screens (identity create/recover, join-hub) now match
  the app's visual style: added missing `button`, `input`/`textarea`/`select`
  base CSS rules plus `btn-primary`, `btn-ghost`, `welcome-settings-link`
  classes to `styles.css`. Voice roster is now populated on connect/hub-switch
  via `GET /voice/participants`; `voice_roster_update`, `voice_participant_joined`,
  and `voice_participant_left` WS events are handled individually so the sidebar
  stays accurate during an active session. tsc clean.

- **demo-seed tool (2026-06-11)** — new `tools/demo-seed` binary in the hub
  workspace; populates a fresh running hub with 8 identities (Nova as owner +
  7 members), 5 channels under 4 categories, ~30 realistic messages, a poll,
  a pinned welcome message, and emoji reactions. Reads `HUB_URL` (default
  `localhost:3000`); writes credentials (tokens + recovery phrases) to
  `demo-credentials.json` (gitignored). `cargo check` and `cargo build --release`
  warning-clean.

- **ContentArea.tsx ports to all forks (2026-06-11)** — web (1,157 → ~320-line
  composition root), android/wavvon-desktop (979 → ~290), android/wavvon-web
  (881 → ~280) now mirror desktop's `components/content/` shape; each fork's
  own behavior preserved (web `@platform` adapters and mention pattern,
  android invoke/hubFetch variants, missing-feature gaps kept as-is —
  android/wavvon-web has no forum so no ForumView). tsc clean in all three
  apps; vitest web 6/6, android 14/14.

- **ws/connection.rs dispatch refactor (2026-06-11)** — introduced `ConnState`
  (voice_channel, subscribed, pending_chunk, component_rate_limit,
  my_conversations, replay_buffer, is_replaying, public_key, is_bot) and a
  `DispatchResult` enum; extracted all match-arm logic into per-domain handlers
  under `routes/ws/handlers/`: `voice.rs` (816 lines), `screen.rs` (617),
  `game.rs` (305), `chat.rs` (120), `bot.rs` (84). `connection.rs` is now 605
  lines (was 1,910). Wire behaviour, lock-acquisition order, voice_relay_active
  bookkeeping, and `leave_voice_for_test` preserved exactly. All 250+ tests
  green; cargo check/clippy/fmt clean.

- **ContentArea.tsx desktop split (2026-06-11)** — behavior-preserving split
  of the 1,383-line `ContentArea.tsx` into 9 files under
  `components/content/`: `MessageHelpers`, `ReconnectBanner`, `DmView`,
  `ForumView`, `ChannelHeader`, `MessageRow`, `ChannelMessageList`,
  `ChannelComposer`, `AllianceView`. `ContentArea.tsx` is now 688 lines (a
  thin composition root); largest extracted file is `MessageRow.tsx` at 369
  lines. Props interface and export signature unchanged — callers unaffected.
  tsc clean, vitest 71/71, vite build succeeds.

- **Signing-service removal + spec CI gate (2026-06-11)** — all
  signing-service steps and the policy file removed from the desktop repo
  (code-signing is now a Blocked item until popularity; installers ship
  unsigned with the README workaround); hub CI now fails when a registered
  route is missing from `openapi.yaml` (sparse-checkout of the docs repo +
  `scripts/check-openapi-coverage.mjs`, currently 201/201 documented).

- **Desktop `lib.rs` module split (2026-06-11)** — behavior-preserving split of
  the 9,844-line desktop `src-tauri/src/lib.rs` into 28 domain modules (bots,
  lobby, farm, games, events_polls, discovery, certs, screen_share, updater,
  etc.); `lib.rs` is now ~350 lines. Zero TS-side changes required — Tauri
  command names are unchanged. `cargo clippy -D warnings`, `cargo fmt --check`,
  and all 38 tests green.

- **Hub route module splits wave 2 (2026-06-11)** — behavior-preserving
  directory-module conversions for `dms.rs` (1,305 lines → 4 files),
  `bots.rs` (1,236 → 5 files), `alliances.rs` (1,119 → 5 files), and
  `moderation.rs` (1,016 → 5 files); no file over ~800 lines; zero route-path
  or public-API changes. `cargo check --workspace`, `cargo test -p wavvon-hub`,
  `cargo clippy -D warnings`, and `cargo fmt --check` all clean.

- **Big-file refactor wave 1 + complete API spec (2026-06-11)** — behavior-
  preserving module splits: hub `routes/ws.rs` (2,101 → 4 files) and
  `routes/games.rs` (1,617 → 6 files), android Tauri `lib.rs` (5,332 → 559
  + 14 domain modules), web `App.tsx` (1,402 → 1,255 via `useHubAdmin`/
  `useSettingsProfile`/`useFarmAdmin` hooks); all CI gates green per repo.
  `openapi.yaml` now documents **all 201 hub routes** (103 were missing —
  badges, certs, events, polls, forum, games, recovery, webhooks, etc.),
  verified by the new `docs/scripts/check-openapi-coverage.mjs`.

- **App.tsx decomposition batch 3 (2026-06-11)** — extracted DM cluster
  (view/conversations/selectedConversation/dmMessages/unreadDms/
  encryptionWarning state + loadConversations/selectConversation/startDmWith/
  handleSendDm/dm-WS/dm-member-changed handlers) into
  `desktop/src/hooks/useDms.ts`. App.tsx: 3461 → 3259 lines (−202). Interface:
  narrow ref/getter/callback params; onDmEvent + onDmMemberChanged callbacks
  for the WS useEffect; selectedConversationForTypingRef stays in App as a
  shared seam with useTypingIndicators. tsc clean, vitest 71/71, vite build.
  Android parity pending.

- **App.tsx decomposition batch 2 (2026-06-11)** — extracted `useHubAdmin`,
  `useFriends`, and `useSettingsProfile` from App.tsx into
  `desktop/src/hooks/`. App.tsx: 3937 → 3461 lines (−476). Behavior
  identical; tsc clean, vitest 71/71 green, vite build succeeds. Android
  parity pending (android repo not updated in this pass).

- **UDP voice relay tied to WS session (2026-06-10)** — added
  `voice_relay_active` set to `AppState`; `VoiceJoin` inserts, `leave_voice`
  removes; the UDP receive loop rejects packets whose sender pubkey is absent
  from the set before any fan-out work, closing the gap where a stale source
  address from a closed WS session could still relay traffic. Five integration
  tests in `hub/tests/voice_relay_flow.rs` cover join/leave, WS close without
  explicit leave, and rejoin.

- **Farm/seed/server/voice security sweep (2026-06-10)** — WS agent channel
  made bounded (was unbounded, OOM risk); DB error during token lookup now
  closes the socket instead of silently admitting the agent; heartbeat endpoint
  rejects unknown hub pubkeys even on DB error (was an auth bypass); proxy body
  size capped at 32 MiB; `public_key` added to `/farm/public-info` response
  (seed registration was broken without it); `agent::run` now survives malformed
  JSON from the farm without triggering a reconnect; voice pipeline spawned tasks
  no longer panic on Opus init failure. Eight new integration tests added across
  farm_auth_flow and admin_flow.

- **Hub wishlist quick wins (2026-06-10)** — `GET /preview` rate-limited
  (10/min per user), `POST /admin/search/reindex` for operator-driven index
  rebuilds without restart, `federated_bans` now enforced on outbound messages
  and DMs (not just inbound auth), dead `game_session_left` WS variant removed.
  All with integration tests; openapi.yaml and ws-protocol.md updated to match.

- **Full CI test coverage across all repos (2026-06-10)** — vitest suites now
  gated in CI for web (6 tests), android/wavvon-web (14 tests), desktop
  (71 tests), and discovery (28 tests); web gains i18n coverage check via tsx;
  android gains `cargo fmt --check` and `cargo clippy -D warnings` gates
  (scoped to `wavvon-desktop` crate, which is all that compiles without the
  Android NDK); 5 pre-existing clippy warnings in android/wavvon-desktop fixed
  outright (1 redundant import removed, 2 needless borrows, 1 useless
  conversion, 1 `#[allow(dead_code)]` on a planned-but-unused struct); hub
  cargo test was already present. Discovery vitest suite covers `listHubs`
  (tag filter, pagination, combined filters), `verifySignature`, and
  `buildCanonicalPayload`/`currentNonce`; a bug was fixed in `verify.ts`
  (`ed.verify` → `ed.verifyAsync` for the @noble/ed25519 v3 async API).

- **WebSocket protocol documented (2026-06-10)** — the protocol contract now
  covers the WS side: connect/auth and framing in `openapi.yaml` (plus a `/ws`
  path entry replacing a stale, inaccurate event list), and a complete
  message-by-message wire reference in
  [`docs/ws-protocol.md`](docs/ws-protocol.md) (34 client→server,
  55 server→client messages, verified against the hub source).

- **Workspace hardening batch (2026-06-10)** — hub security fixes (WS session
  validation, atomic invites, SSRF DNS-rebinding, federated-ban check on farm
  tokens, upload headers), client race/cleanup fixes + error boundaries,
  android parity restored (voice events, speaking indicators), shared
  `@wavvon/utils` package consumed by desktop/web/android, wire-format spec
  with cross-client byte-level vector tests (no divergences found), CI gains
  fmt/clippy gates and SHA-pinned actions, pre-commit secret guards in all
  repos, wiki synced with code reality. Follow-up: voice refresh is now
  event-driven (listeners pointed at the events each backend actually emits),
  and the vendored android i18n copy is re-synced with a CI drift check
  (`scripts/check-vendored.sh`) covering both vendored packages. The vector
  suite now also covers DhKeyRecord and all three DM envelopes (1:1, group,
  sender-key distribution), pinned in the spec, both Rust clients, and the
  web clients (no divergences found).

Older entries: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **2026-06-13 design review: web client top-10** — composer rebuilt to D5b
  spec (in progress); polls were dead code in web; mixed-locale UI (item 3:
  ChannelSidebar, App.tsx ctx menu, SearchBar, CreateChannelModal wired
  2026-06-27 — SettingsPage, WelcomeScreen, HubAdminPage, UserProfileCard still
  need wiring); hex-string identity onboarding; message-row anatomy;
  voice-UI contradictions. Most apply to desktop too. Items 8+9 fixed 2026-06-27:
  `.chat-column` max-width 1300px wrapper caps line length on wide screens;
  `#` hash glyph for text channels with no custom icon; DRAFT badge color fixed
  on selected channels.
  See [design-review-2026-06-13.md](design-review-2026-06-13.md).
- **2026-06-12 pilot feedback: desktop issues remaining (D10)** — D1 fixed 2026-06-27 (whisper panel portal). D7 fixed 2026-06-27 (roles submenu in user context menu for admins). D8 fixed 2026-06-27 (banner channels: right-click → Edit banner/Delete for admins; drag-to-reorder via SortableBannerItem; BannerEditModal with URL input + live preview). D10: no Activity view (wishlist). Details: [pilot-feedback-2026-06-12.md](pilot-feedback-2026-06-12.md).
- **First user to join a fresh hub silently becomes owner** —
  `assign_initial_roles` (hub `auth/handlers.rs`) grants `builtin-owner` to the
  first registrant when no owner exists, contradicting the operator guide
  ("fresh hub has no owner until assigned") and undermining
  `WAVVON_OWNER_PUBKEY` deployments where the operator joins later: any
  stranger who joins first takes the hub. Found live on the videogamezone
  pilot hub (2026-06-12). Decide the intended behavior, align code + docs.
- Full audit with all 46 findings (file:line and effort): [`code-audit-2026-06-11.md`](code-audit-2026-06-11.md).
  Remaining open: H12 (missing indexes — partially done in hub migrations), H13 (federated_bans index — done in hub migrations). W25 (orphaned CSS) and W27 (recovery phrase) were already fixed by the monorepo consolidation and identity refactor respectively.
  Fixed: H9 (CORS warn — 2026-06-27), H11 (get_messages N+1 → 3 bulk queries — **FIXED 2026-06-27**), H14 (list_members N+M+1 → 3 queries, LIMIT 1000 — **FIXED 2026-06-27**), H15 (farm-token auth 5 reads → 1 combined query — **FIXED 2026-06-27**), H16 (federated DM delivery background tokio::spawn — **FIXED 2026-06-27**), H17 (tantivy Mutex unwrap — **FIXED 2026-06-27**), H20 (chat broadcast capacity 256→4096, lagged WS frame — **FIXED 2026-06-27**), H21 (handle_typing ban check — 2026-06-27), H22 (badge-offer rate-limit + duplicate guard — **FIXED 2026-06-27**), H23 (preview SSRF proxy-aware + redirect IP guard — **FIXED 2026-06-27**).
- **Windows installer unsigned** — SmartScreen warning; workaround "More info →
  Run anyway". See the code-signing blocker above.
- **Cross-farm cert relay** — certifications work per-hub; revocations don't
  propagate across farms. See [`hub-certifications.md`](docs/hub-certifications.md).
- **Per-hub subkey revocation propagation** — revoking a multi-device subkey on
  one hub isn't known to other hubs. See [`multi-device.md`](docs/multi-device.md).
- **Bot deferred scope** — voice/screen-share injection, bot DMs, outgoing
  webhooks: no timeline. See
  [`future-features.md`](docs/future-features.md).
- **Forum: reactions + attachments on posts** — not yet supported. See
  [`forum.md`](docs/forum.md).

## 💤 Won't do

- **Load-aware DM routing across a user's hubs** — failover only; load-balancing
  needs gossip + cross-hub consistency. See [decisions.md](docs/decisions.md)
- **Concurrent mic test while in voice** — two cpal input streams unreliable
  cross-platform; live meter covers it
- **Central authority of any kind** — no global hub directory, global identity
  service, or DHT; federation is peer-to-peer
- **Subscriptions, premium tiers, or in-chat advertising** — no paywalled
  features; funding is via voluntary donations
- **Telemetry collection or data sales** — no opt-out telemetry; operators run
  their own hubs
- **Global web-of-trust or negative reputation / shared ban lists** — federated
  ban lists are opt-in per hub, not a global negative registry
