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

- [ ] **Voice enhancements** — four sequenced improvements to the voice
  pipeline. Design docs: [`voice-volume.md`](docs/voice-volume.md),
  [`voice-advanced-settings.md`](docs/voice-advanced-settings.md),
  [`proximity-voice.md`](docs/proximity-voice.md),
  [`voice-networking-design.md`](docs/voice-networking-design.md).
  Individual tasks below:
  - [x] **V1 — Per-participant volume control** — hub and desktop already
    fully done. Web and Android wired 2026-07-01: per-sender `GainNode` in
    `voice.ts`, `ChannelSidebar` gain slider, `App.tsx` wiring, Android
    `set_voice_gain` Tauri command + `StoredVoiceSettings`. Vitest 4/4.
    - [x] **V1-W1** — `voice.ts`: per-sender `GainNode`, `handleRosterUpdate`,
      `setSenderGain`, `localStorage wavvon.voice_gains`.
    - [x] **V1-W2** — `ChannelSidebar.tsx`: gain badge + popover slider props.
    - [x] **V1-W3** — `App.tsx`: `voiceGains` state, `voice_roster_update` handling.
    - [x] **V1-A1** — Android `voice_cmd.rs`: `set_voice_gain` Tauri command.
    - [x] **V1-A2** — Android `ChannelSidebar.tsx` + `App.tsx` gain UI.
  - [x] **V2 — Voice audio quality profiles** — `AudioProfileSection` moved to
    `packages/ui` 2026-07-01; desktop re-exports as shim; web `SettingsPage`
    Voice tab wired; Android `StoredVoiceSettings` extended. Workspace
    typecheck clean.
    - [x] **V2-S1** — `packages/ui/src/components/AudioProfileSection.tsx`; desktop shim.
    - [x] **V2-W1** — `voice.ts`: `AudioProfileConfig` accepted in constructor.
    - [x] **V2-W2** — `SettingsPage.tsx` Voice tab; `localStorage wavvon.audio_profile`.
    - [x] **V2-A1** — Android `voice_cmd.rs`: `audio_profile` + `custom_*` fields.
    - [x] **V2-A2** — Android `SettingsPage` Voice tab.
  - [x] **V3 — Proximity voice** — hub side pre-existing (VoiceZoneCreate/Destroy/
    PositionUpdate handlers, voice_zone_state snapshot on join). Server integration
    tests (`proximity_voice_flow.rs`, 4 tests) + web client attenuation shipped
    2026-07-01: `computeAttenuation()` (linear/inverse_square/step/exponential),
    zone lifecycle handlers, recomputeAllProximityGains on every position update,
    WS dispatch wired in `ws.ts`. 18 vitest tests.
  - [x] **V4 — Voice encryption (Phase 2)** — AES-256-GCM per-packet on Opus
    stream; hub relays ciphertext transparently. Key distribution via
    `VoiceKeyOffer`/`VoiceKeyReceived`/`VoiceKeyRequest` WS messages +
    X25519 ECDH. `ws_key_senders` map in AppState for targeted delivery.
    4 integration tests in `hub/tests/voice_encryption_flow.rs`. Shipped 2026-07-01.

- [x] **Hub creation wizard** — zero-to-live path for new operators. All three
  pieces shipped 2026-07-01. Design: [`hub-creation-wizard.md`](docs/hub-creation-wizard.md).
  - [x] **HW1 — Template catalog on discovery** — `POST /api/templates/register`
    (Ed25519-signed, ownership-checked update/create) + `DELETE` on discovery.
    `src/lib/templates-db.ts` extracted; 8 vitest tests.
  - [x] **HW2 — First-run bootstrap in hub** — `maybe_bootstrap()` in
    `bootstrap.rs`: fetches template URL, applies channels/roles/settings/welcome
    message; `bootstrapped_at` marker prevents re-run. 4 integration tests in
    `hub/tests/bootstrap_flow.rs`.
  - [x] **HW3 — Creation wizard on discovery** — `/new` web flow generates
    `docker compose` YAML (not `docker run`); `docker-compose.yml` download.
    Existing vitest suite covers wizard logic.

- [ ] **Moderation enhancements** — three additions to hub moderation. Design:
  [`moderation-enhancements.md`](docs/moderation-enhancements.md).
  - [ ] **ME1 — Federated ban list subscription UI** — enforcement is already
    shipped; this adds the admin surface: add/remove ban-list sources, set
    per-source policy (hard-reject vs. soft-flag), view synced entries, apply
    local overrides, and toggle publishing the hub's own `/federation/banlist`.
    Run `cargo test` + `tsc --noEmit`.
  - [ ] **ME2 — Auto-moderation webhook** — pre-store allow/block gate:
    `PATCH /admin/settings` fields for webhook URL + HMAC secret; message-create
    path POSTs to the operator URL (500ms timeout, fail-open, circuit breaker
    on 3× 5xx in 60s → 10-min backoff). Admin UI shows circuit-breaker state.
    Run `cargo test` + `tsc --noEmit`.
  - [ ] **ME3 — Content reporting queue** — `POST /messages/:id/report`
    (deduplicated per reporter); admin queue at `GET /admin/reports?status=pending`;
    `POST /admin/reports/:id/review` with `dismiss | delete_message | ban_user`
    actions. Reporter identity visible to admins only. Run `cargo test` +
    `tsc --noEmit`.

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

- **Project visibility push** — remaining: a hosted demo hub, directory listings, launch post.
  Needed both for adoption and for the code-signing re-application.
  *(2026-06-10: all six READMEs rewritten as landing pages with badges,
  cross-links, and a `docker compose` quick-start.
  2026-06-11: demo-seed tool added; real screenshots + join-flow GIF added to READMEs.)*
- **Passkey registration from desktop** — blocked by Tauri webview RP ID mismatch; requires either a native OS WebAuthn plugin (tauri-plugin-passkey) or a hybrid approach where the desktop opens the hub URL in the system browser for the ceremony.

## 🚀 Recently shipped

Full log: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **`cargo test` does not work locally on Windows (2026-07-01)** — two blockers:
  (1) `openssl-sys` fails to compile without OpenSSL development headers; `reqwest`
  pulls this in transitively. Fix: switch `reqwest` to `features = ["rustls-tls"]`
  across the workspace and remove any `openssl` feature flags — no system libraries
  needed. (2) Even after compilation, every integration test calls `create_test_db()`
  which expects a live PostgreSQL instance at `localhost:5432`. Fix: add a
  `docker-compose.dev.yml` at the repo root with a `postgres:16-alpine` service so
  developers can `docker compose -f docker-compose.dev.yml up -d` before running
  tests. Both fixes together make `cargo test --workspace` work on Windows without
  any manual system-library setup.

- **2026-06-13 design review: web client top-10** — item 1 fixed 2026-06-27:
  desktop ChannelComposer rebuilt to D5b spec (composer-shell wraps input +
  actions; "+" menu and emoji button right-aligned inside the box; send stays
  outside — web already had this layout); item 2 fixed 2026-06-27: polls now fetched from server
  on channel switch (PollCard/PollComposer were wired but channelPolls was
  never populated); item 3 fixed 2026-06-27: all web client screens now
  wired for i18n (HubAdminPage last to land); item 4 fixed 2026-06-27
  (display-name prompt after first hub join);
  item 5 fixed 2026-06-27: message-row anatomy unified — --msg-gutter variable
  introduced; reply-preview and reactions widths fixed to prevent overflow; S-path
  CSS connector (::before L-shape) replaces unicode ↪ arrow;
  item 6 fixed 2026-06-27: web voice control bar — dead screen-share button
  (no-op in web) hidden by making onScreenShare optional; emoji mic/deafen
  icons replaced with matching SVGs from desktop for visual consistency.
  item 7 fixed 2026-06-27: emoji picker rebuilt — 4-column grid (was 8),
  20px emoji (was 16px), clipped bottom row at 148px (shows scroll hint),
  mint/accent hover tint.
  Most apply to desktop too.
  Items 8+9 fixed 2026-06-27: `.chat-column` max-width 1300px wrapper caps line
  length on wide screens; `#` hash glyph for text channels with no custom icon;
  DRAFT badge color fixed on selected channels.
  Item 10 fixed 2026-06-27: "Browse public hubs" in WelcomeScreen now wired
  (`onBrowse` prop propagated through WelcomeScreenContainer → App.tsx sets
  `showDiscover`); first non-banner channel auto-selected on hub load when none
  is selected; DM empty state copy updated to reference member list (not a
  non-existent friends page).
  See [design-review-2026-06-13.md](design-review-2026-06-13.md).
- **2026-06-12 pilot feedback: desktop issues remaining (D10)** — D1 fixed 2026-06-27 (whisper panel portal). D2 fixed 2026-06-27 (camera picker in voice settings: useVideo enumerates videoinput devices, SettingsPage gains camera selector, preference persisted to localStorage). D3 fixed 2026-06-27 (leave-voice button: PhoneOffIcon replaces bare red emoji). D5a fixed 2026-06-27 (`.input-area button` scoped to `[type="submit"]` so icon buttons in the composer no longer render as accent CTAs). D6: handleVoiceJoin already auto-leaves the active channel before joining another; no code change needed. D7 fixed 2026-06-27 (roles submenu in user context menu for admins). D8 fixed 2026-06-27 (banner channels: right-click → Edit banner/Delete for admins; drag-to-reorder via SortableBannerItem; BannerEditModal with URL input + live preview). D10: no Activity view (wishlist). D4 fixed 2026-06-27 (screen-share picker: added .screen-share-source-thumb CSS so thumbnails render; .selected shows accent border; picker max-height 85vh). D9 fixed 2026-06-27 (voice control bar consolidated from 7 to 4 controls: mic/deafen/camera primary, rest in "···" popover). All D items resolved. Details: [pilot-feedback-2026-06-12.md](pilot-feedback-2026-06-12.md).
- **First user to join a fresh hub silently becomes owner** — **FIXED 2026-06-27**:
  removed the auto-grant from `assign_initial_roles`; `configured_owner` param
  dropped; startup `tracing::warn!` emitted when no `WAVVON_OWNER_PUBKEY` is set.
  Hub now starts ownerless and requires the operator to set `WAVVON_OWNER_PUBKEY`
  (or assign the role manually). Found live on the videogamezone pilot (2026-06-12).
- Full audit with all 46 findings (file:line and effort): [`code-audit-2026-06-11.md`](code-audit-2026-06-11.md).
  All 46 findings resolved. H12: `idx_messages_channel_created`, `idx_messages_reply_to`, and `idx_dm_messages_conversation_created` present in hub migrations (verified 2026-06-27). H13: `idx_federated_bans_target` present in hub migrations (verified 2026-06-27). W25 (orphaned CSS) and W27 (recovery phrase) were already fixed by the monorepo consolidation and identity refactor respectively.
  Fixed: H9 (CORS warn — 2026-06-27), H11 (get_messages N+1 → 3 bulk queries — **FIXED 2026-06-27**), H14 (list_members N+M+1 → 3 queries, LIMIT 1000 — **FIXED 2026-06-27**), H15 (farm-token auth 5 reads → 1 combined query — **FIXED 2026-06-27**), H16 (federated DM delivery background tokio::spawn — **FIXED 2026-06-27**), H17 (tantivy Mutex unwrap — **FIXED 2026-06-27**), H20 (chat broadcast capacity 256→4096, lagged WS frame — **FIXED 2026-06-27**), H21 (handle_typing ban check — 2026-06-27), H22 (badge-offer rate-limit + duplicate guard — **FIXED 2026-06-27**), H23 (preview SSRF proxy-aware + redirect IP guard — **FIXED 2026-06-27**).
- **Windows installer unsigned** — SmartScreen warning; workaround "More info →
  Run anyway". See the code-signing blocker above.
- **Per-hub subkey revocation propagation** — **FIXED 2026-06-30**: background
  worker polls each master key's home hub every 6 hours, verifies Ed25519
  signatures, and inserts new revocations into the local `subkey_revocations`
  table. See `subkey_revocation_worker.rs`.
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
