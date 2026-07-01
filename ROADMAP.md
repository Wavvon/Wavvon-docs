# Wavvon Roadmap

Tracks **what's next, what's broken, and what we'd like to build but
haven't designed yet**. Everything else — architecture, design rationale,
design questions — lives in the wiki at [`docs/`](docs/README.md).
The full history of shipped work lives in
[`docs/shipped-log.md`](docs/shipped-log.md).

## 🔨 Next up

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

- **`cargo test` does not work locally on Windows — FIXED 2026-07-01**: two
  blockers resolved: (1) `openssl-sys` could not compile because `webauthn-rs-core`
  depends on it directly — fixed by adding `openssl = { version = "0.10", features =
  ["vendored"] }` to `hub/Cargo.toml` (forces a source build via cmake + Strawberry
  Perl; both are now installed as dev tools) and switching `wavvon-seed`'s `reqwest`
  to `default-features = false, features = ["json", "rustls-tls"]` to eliminate the
  residual `native-tls` dep. (2) `create_test_db()` requires a live PostgreSQL —
  fixed by `docker-compose.dev.yml` at the repo root; run
  `docker compose -f docker-compose.dev.yml up -d` before `cargo test --workspace`.

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
