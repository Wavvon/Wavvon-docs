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
- **Event role-slot sign-ups + reminders** — *server SHIPPED 2026-07-04*
  (hub `825b0da`, [`events.md`](docs/events.md) §2-§3); *web UI SHIPPED
  2026-07-04* (clients `dea0df0`, `EventComposer.tsx` slot editor +
  reminder picker, `EventCard.tsx`/new `EventSlotList.tsx`
  claim/unclaim). Desktop/Android UI queued next (parallel
  `EventCard.tsx`/`EventComposer.tsx` copies in those apps still show
  baseline RSVP-only). Calendar view (§4) still undesigned-priority,
  client-only. The events read-gating fix (H3) already landed in the
  security pass.
- **Join-to-create temporary voice channels** — *server SHIPPED*
  (hub `3005fc5`) + *web UI SHIPPED* (clients `fb607de`) +
  *`voice_ws.rs` spawner gap FIXED 2026-07-04* (hub `1fc5aa6`, see Known
  issues below), [`temp-voice-channels.md`](docs/temp-voice-channels.md).
  Remaining: owner-rename UI (a non-admin temp-room owner has no rename
  path — the context menu is `isAdmin`-gated).
- **Soundboard + bot audio injection** — *SHIPPED 2026-07-04* (server
  hub `ef9beed`, web clients `eed7c04`, [`soundboard.md`](docs/soundboard.md)).
  Clip library + `use_soundboard`/`manage_soundboard` perms +
  `soundboard_played` event; real client-side PCM mix into the outgoing
  stream; bot audio injection via `can_speak_voice` gate on `/voice/ws`.
  Needs the live pass; play-gate uses hub-role perms (see channel-perms
  endpoint follow-up).
- **LAN / offline mode** — **designed, ready to implement**:
  [`lan-mode.md`](docs/lan-mode.md). mDNS discovery + self-signed/
  fingerprint or gated-plaintext trust; `WAVVON_LAN_MODE` flag with a
  hard private-address guard (can't be exposed publicly). Server-first;
  native discovery UX deferred to client era.
- **Personal data export (full archive)** — *export half SHIPPED
  2026-07-04* (clients `542891e`, [`data-export.md`](docs/data-export.md)).
  Two follow-ups: (1) **prefs-blob decrypt** — web has no decrypt path
  for the hub-synced E2E prefs blob, so v1 exports a local snapshot with
  a `gap_note`; (2) **import/restore** (§5) not built. Cross-client
  archive compat (desktop↔web envelope) also deferred.
- **Live captions in voice** — local STT, desktop-era (too heavy for
  web). See [`future-features.md`](docs/future-features.md).

## 🚀 Recently shipped

Full log: [`docs/shipped-log.md`](docs/shipped-log.md).

## ⚠️ Known issues

- **✅ SECURITY — 2026-07-04 audit findings ALL FIXED** — full audit in
  [`security-audit-2026-07-04.md`](docs/security-audit-2026-07-04.md).
  Server fixes hub `efbf17b`, web fix clients `62792cb`. Verified by
  hand + regression tests; no longer blocks push.
  - **H1** (WS Subscribe read-gate) — fixed: `handle_subscribe` requires
    channel-scoped `READ_MESSAGES` before subscribing; 2 WS integration
    tests over real TCP.
  - **H2** (channel-perm escalation) — fixed: priority guard +
    unconditional `admin`-grant block + self-grant guard on PUT/DELETE;
    `manager_cannot_grant_admin_via_overwrite` asserts 403.
  - **H3** (events) / **H4** (pins) — fixed: read paths channel-gated
    (`get_event` 404s to avoid existence leak); pin writes channel-scoped.
  - **D1/D2/D3** (importer) — fixed: TLS-bypass now loopback-only behind
    `--insecure`, non-`https` hub rejected unless loopback, `Retry-After`
    clamped; same TLS line scrubbed from `demo-seed`.
  - **W1** (color beacon) — fixed: `safeRoleColor` validator on both
    swatch sinks. **W2** (LOW, not exploitable): pre-existing
    `channel.color` raw-into-CSS in `SortableItems.tsx` — harden via
    `safeRoleColor` when convenient (open).
- **✅ Temp voice spawners on web — FIXED 2026-07-04** (hub `1fc5aa6`)
  — the spawn-on-join logic (hub `3005fc5`) had only been added to
  `routes/ws/handlers/voice.rs` (the main-hub-WS / UDP path used by
  desktop/Android); web's separate `/voice/ws` transport
  (`routes/voice_ws.rs`) never detected `channel_type = 'spawner'`, so a
  web user clicking a spawner joined the spawner row itself.
  `voice_ws_task` now reuses the same `spawn_temp_channel()` helper,
  gates on channel-scoped `read_messages` against the spawner first, and
  echoes the resolved `channel_id` in `voice_ws_ready` (the web client
  already preferred a reply-supplied id when present). Broadcasts
  `channels_updated` on spawn, matching the main-hub-WS path. Two new
  integration tests in `temp_voice_channels_flow.rs`.
- **No member-facing "my effective channel permissions" endpoint** —
  recurring gap surfaced by the Permissions tab, the soundboard
  play-gate, and channel-scoped `use_soundboard`. The only endpoint that
  folds channel overwrites (`GET /channels/:id/permissions`) itself
  requires `manage_roles`, so a plain member's client can't cheaply
  learn its own channel-scoped effective perms — client UIs fall back to
  hub-wide role checks for gating (servers still enforce the real
  channel-scoped check, so it's a UX/visibility gap, not a security
  one). Fix: a lightweight `GET /channels/:id/my-permissions` returning
  the caller's own effective set.
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
- **Test harness DB leak — FIXED 2026-07-04** (hub `e203106`):
  `create_test_db()` returns a `TestDbGuard` whose `Drop` issues
  `DROP DATABASE … WITH (FORCE)` (via a dedicated OS thread so it fires
  on panic too); verified 0→0 leaked DBs across back-to-back full-suite
  runs, `/dev/shm` flat. A `db_sweep` `#[ignore]`d test clears any
  backlog. **Follow-up (LOW)**: `crates/farm/tests` (`wavvon_farm_test_*`)
  and `crates/seed/tests` (`seed_test_*`) still have the same unguarded
  leak with different prefixes — same guard pattern applies.
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
