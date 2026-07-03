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

## 🔨 Nested channels — UX gaps — [nested-channels-ux.md](docs/nested-channels-ux.md)

Three independent gaps; §1 and §2 are client-only, §3 is net-new server + UI.

Channel permalinks (§1):
- [ ] Extend `parseHubInput` (`packages/core`) to parse a `channel`/`message` `target` from the path
- [ ] App-level consumer: navigate to `target` after hub connect (also fixes message-permalink resolution)
- [ ] `channelPath()` breadcrumb helper in `packages/core/src/channels.ts`
- [ ] "Copy channel link" affordance (context menu + channel-header) and breadcrumb header

Deep-nesting sidebar (§2):
- [ ] Cap indent (`INDENT_CAP`/`STEP` + overflow marker) in `ChannelSidebar.tsx`
- [ ] Drill-in (focus-scoped subtree + back-crumb) with `aria-level`/`aria-live` accessibility

Channel permission overwrites (§3):
- [ ] DB migration: `channel_permission_overwrites` table (additive)
- [ ] `channel_permissions()` resolver in `hub/src/permissions.rs` (cascade, allow-wins, admin-immune)
- [ ] Switch channel-scoped call sites (`messages.rs`, `posts.rs`, `channels.rs`, voice join)
- [ ] Channel-list read-gating (server-side filter; empty-container suppression client-side)
- [ ] Admin routes: GET/PUT/DELETE `/channels/:id/permissions[/:role_id]` + audit-log entries
- [ ] Channel-settings "Permissions" tab (tri-state grid) + web platform-adapter route functions

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
- **Cross-farm hub-certification relay** — let certifications propagate
  across the hubs a single farm operator manages instead of each hub
  verifying independently. No design work started. See
  [`future-features.md`](docs/future-features.md).
- **Forum post federation across alliances** — v1 forums are hub-local
  only; posts/replies don't federate over alliance-shared channels. No
  design work started. See [`forum.md`](docs/forum.md).
- **Discord server import** — reproduce a Discord server's channel tree,
  roles, and pins on a fresh hub; biggest single adoption lever. See
  [`future-features.md`](docs/future-features.md).
- **Event / calendar channel type** — scheduled events with role-slot
  sign-ups (tank/healer/DPS), timezone-aware, reminders. See
  [`future-features.md`](docs/future-features.md).
- **Join-to-create temporary voice channels** — spawner channel creates
  a personal room, GC'd when empty. See [`future-features.md`](docs/future-features.md).
- **Soundboard** — client-side clip injection into the outgoing voice
  stream; shares a mechanism with deferred bot audio injection. See
  [`future-features.md`](docs/future-features.md).
- **Role categories + role color/icon** — native role grouping (kills
  Discord's fake-divider-role hack); display-only, no permissions.
  Roles currently have no color/icon at all. See
  [`future-features.md`](docs/future-features.md).
- **LAN / offline mode** — mDNS discovery + no-public-TLS join story;
  "works at a LAN party" differentiator. See
  [`future-features.md`](docs/future-features.md).
- **Personal data export (full archive)** — extend identity backup to
  all personal-axis state. See [`future-features.md`](docs/future-features.md).
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).

## 🚀 Recently shipped

Full log: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **Windows installer unsigned** — SmartScreen warning on first run; workaround
  "More info → Run anyway". See the code-signing blocker above.
- **Bot deferred scope** — voice/screen-share injection, bot DMs,
  bot-launched game modals: no timeline. See
  [`future-features.md`](docs/future-features.md).

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
