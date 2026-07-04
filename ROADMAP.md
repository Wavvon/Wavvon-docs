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

## 🔨 Nested channels — UX gaps: **all shipped 2026-07-04**

[nested-channels-ux.md](docs/nested-channels-ux.md) is fully
implemented — §1 permalinks (clients `bed7fe3`), §2 deep-nesting
sidebar (clients `2289304`), §3 permission overwrites (hub `5912459` +
clients `a4e1366`). Web only; details in
[`shipped-log.md`](docs/shipped-log.md). Needs a visual pass (Known
issues).

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
- **Role categories + role color/icon — desktop/Android parity** — web
  client shipped 2026-07-04 (clients `a6b2d24`); port the same
  category manager + per-role color/icon controls into desktop's and
  Android's own `RoleEditor.tsx`/`RoleCreator.tsx` copies. See
  [`role-categories.md`](docs/role-categories.md) §4, §6.
- **Cross-farm hub-certification relay** — let certifications propagate
  across the hubs a single farm operator manages instead of each hub
  verifying independently. No design work started. See
  [`future-features.md`](docs/future-features.md).
- **Forum post federation across alliances** — v1 forums are hub-local
  only; posts/replies don't federate over alliance-shared channels. No
  design work started. See [`forum.md`](docs/forum.md).
- **Event role-slot sign-ups + reminders** — **designed, ready to
  implement**: [`events.md`](docs/events.md). Slot claims with enforced
  capacity, reminder worker posting channel event-cards at T−N,
  calendar view; includes the events read-gating fix below.
- **Join-to-create temporary voice channels** — **designed, ready to
  implement**: [`temp-voice-channels.md`](docs/temp-voice-channels.md).
  Spawner type + sibling temp rooms, 60s-grace GC worker, and the new
  `channel_list_changed` WS event (fixes stale sidebars generally).
- **Soundboard + bot audio injection** — **designed, ready to
  implement**: [`soundboard.md`](docs/soundboard.md). Clips mix
  client-side (zero relay changes); bots join the WS voice relay as
  real participants. Two new permissions, Opus-in-Ogg clip library.
- **LAN / offline mode** — mDNS discovery + no-public-TLS join story;
  "works at a LAN party" differentiator. See
  [`future-features.md`](docs/future-features.md).
- **Personal data export (full archive)** — **designed, ready to
  implement**: [`data-export.md`](docs/data-export.md). Client-assembled
  passphrase-encrypted JSON of the whole personal axis; reuses the
  identity-backup envelope; no new hub surface.
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).

## 🚀 Recently shipped

Full log: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **🔴 SECURITY — two HIGH findings, should block push** — full audit in
  [`security-audit-2026-07-04.md`](docs/security-audit-2026-07-04.md).
  - **H1**: WS explicit `Subscribe` (`ws/handlers/screen.rs:25`) has no
    read-gate — any member can subscribe to a private channel id and
    receive its live messages/edits/typing/reactions/pins.
  - **H2**: `put_channel_permissions` (`channel_permissions.rs:166`) has
    no priority/self-grant guard and `admin` is in `ALL_PERMISSIONS`, so
    a `MANAGE_ROLES`-on-channel delegate can `PUT {"allow":["admin"]}`
    and escalate to full subtree admin.
  - **D1** (importer, HIGH but tool-only): `discord-import` disables TLS
    cert verification on the owner-token-bearing hub client
    (`main.rs:154`); MITM → owner token capture. Same line to scrub from
    `demo-seed`. Plus **D2**: `--hub` allows cleartext `http`.
  - Medium: **H3** events + **H4** pins read paths not channel-gated
    (private content/ids leak); **W1** unvalidated hub `color` →
    `background: url()` beacon in admin swatches. See the audit doc for
    the rest and the fixes.
  - **Fixed 2026-07-04**: W1 (clients `62792cb` — `safeRoleColor`
    validator on both swatch sinks). Server-side H1–H4 + importer
    D1–D3 fixes in progress. **W2** (LOW, not exploitable): pre-existing
    `channel.color` raw-into-CSS in `SortableItems.tsx` — safe by
    formatting luck, harden via `safeRoleColor` when convenient.
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
- **Events routes bypass channel-scoped permissions** — see H3 in the
  security audit above (confirmed + extended to `get_event`/
  `create_event`). Fix rides with event-slots work or sooner.
- **2026-07-04 batch: no live pass yet** — the Permissions tab,
  channel permalinks/breadcrumbs, sidebar drill-in, and role
  categories (admin tab + profile card) are logic-tested but not yet
  exercised in a running client — one click-through session covers all
  of them. The Discord importer likewise needs a live run (`export`
  with a real bot token, `apply` against a running hub). Also: the
  channel-settings gear is `isAdmin`-gated (pre-existing), so a member
  with only `manage_roles` can't reach the Permissions tab the server
  would allow them to use.
- **Role/category icon picker can store non-rendering shortcodes** —
  `EmojiPicker`'s hub-custom-emoji section returns `:name:` shortcode
  strings; server validation accepts them but they render as literal
  text, not an emoji, on badges/headers. Fix: filter the picker to
  unicode emoji for this use, or render shortcodes properly.
- **Test harness leaks ephemeral databases** — `hub/tests` creates a
  `wavvon_test_*` Postgres DB per test and never drops it; grew from
  ~700 to ~1800 leaked DBs across 2026-07-04 alone, twice exhausting
  the container's 64MB `/dev/shm` and crashing Postgres mid-suite. CI
  is unaffected (fresh service container per run), but local full-suite
  runs now reliably hit this. Escalating: fix soon — a `DROP DATABASE`
  sweep in `common::create_test_db()` is a one-liner-ish change. Note
  `dm_retries_when_recipient_hub_comes_online` failed 4/4 attempts in
  the degraded-container state (listed as flaky; may be load-sensitive
  rather than random).
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
