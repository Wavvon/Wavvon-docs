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

Channel permalinks (§1): **shipped 2026-07-04** (clients `bed7fe3`) —
see [`shipped-log.md`](docs/shipped-log.md). Web only; first-run
(zero-hub) permalink carry-through deliberately not wired.

Deep-nesting sidebar (§2) — *in progress 2026-07-04*:
- [ ] Cap indent (`INDENT_CAP`/`STEP` + overflow marker) in `ChannelSidebar.tsx`
- [ ] Drill-in (focus-scoped subtree + back-crumb) with `aria-level`/`aria-live` accessibility

Channel permission overwrites (§3): **shipped 2026-07-04** (hub `5912459`,
clients `a4e1366`) — see [`shipped-log.md`](docs/shipped-log.md). Needs a
visual pass (Known issues).

## 🚧 Blocked

- **Windows code-signing** — blocked until the project reaches meaningful
  popularity (the free OSS signing route requires it; paying for signing
  before there are users isn't worth it). Ship unsigned with the documented
  SmartScreen workaround meanwhile; all signing-service steps removed from CI.
  Options and design in [`code-signing.md`](docs/code-signing.md).
- **Android client icons** — placeholder solid-color PNGs in place. Waiting on
  the final logo asset. Run `cargo tauri icon <1024x1024.png>` once the brand
  logo is ready. See [`brand.md`](docs/brand.md).

- [ ] **Role categories + role color/icon** — *in progress 2026-07-04*,
  implementing [`role-categories.md`](docs/role-categories.md) (server
  first, then web UI).

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
- **Discord server import** — **designed, ready to implement**:
  [`discord-import.md`](docs/discord-import.md). Two-stage CLI (bot
  export → reviewable manifest → apply on fresh hub); structure only;
  biggest single adoption lever.
- **Event role-slot sign-ups + reminders** — **designed, ready to
  implement**: [`events.md`](docs/events.md). Slot claims with enforced
  capacity, reminder worker posting channel event-cards at T−N,
  calendar view; includes the events read-gating fix below.
- **Join-to-create temporary voice channels** — spawner channel creates
  a personal room, GC'd when empty. See [`future-features.md`](docs/future-features.md).
- **Soundboard** — client-side clip injection into the outgoing voice
  stream; shares a mechanism with deferred bot audio injection. See
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

- **`packages/core` crypto test vectors are stale** — found 2026-07-04
  when `packages/core` got its first `test` script:
  `src/identity/crypto.test.ts` still asserts pre-rename `"voxply/…"`
  wire tags; the implementation and `wire-format.md` correctly use
  `"wavvon/…"`. Excluded in `vitest.config.ts` with a comment.
  Fix = regenerate the vectors against `wire-format.md`, then re-enable.
- **Hub switch leaves the message pane empty** — `handleSwitchHub`
  (web) never fetches history for the auto-selected default channel;
  only `handleSelectChannel` does. Pre-existing, unrelated to
  permalinks (deep links are unaffected).
- **Events routes bypass channel-scoped permissions** — found 2026-07-04
  while designing event slots: `create_event` checks hub-wide
  `CREATE_EVENTS` only and `list_events` is not read-gated, so event
  titles in channels hidden by permission overwrites leak into the
  event list. Fix: resolve via `channel_permissions`, filter the list
  by effective `read_messages`. Rides with the event-slots work
  ([`events.md`](docs/events.md)) or sooner.
- **Channel Permissions tab: no visual pass yet** — logic tested
  (7 unit + 7 integration tests) but not exercised in a running client.
  Also: the channel-settings gear is `isAdmin`-gated (pre-existing), so a
  member with only `manage_roles` can't reach the tab the server would
  allow them to use.
- **Test harness leaks ephemeral databases** — `hub/tests` creates a
  `wavvon_test_*` Postgres DB per test and never drops it; ~700 had
  accumulated locally by 2026-07-04 (and the test container crashed
  once under the load). CI is unaffected (fresh service container per
  run). Worth a teardown or a `DROP DATABASE` sweep in
  `common::create_test_db()`.
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
