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
  claim/unclaim). **Web create path was broken until the 2026-07-04 e2e
  pass** — the composer never sent `channel_id` (create 400'd) and the
  bare create-response crashed the card; both fixed (see Recently
  shipped). Desktop/Android UI queued next (parallel
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

- **Multi-device pairing + home-hub write (web, 2026-07-04)** — ported the
  identity envelopes that were Rust-only into `packages/core`
  (`master`/`wire`/`ecies`, byte-for-byte pinned by the `wavvon-identity` hex
  vectors), then built the two features it unblocked: publishing a
  master-signed home-hub list, and full device pairing (offer → claim →
  approve → cert), device list + revoke. Auth now presents the subkey cert and
  records the canonical pubkey, so a paired device is recognised as the same
  user. `e2e/live/27` (home hubs) + `28` (pairing). Closes the last two web
  parity gaps — see [`client-parity.md`](docs/client-parity.md).
- **Web e2e live-test suite + 2026-07-04 batch live pass** — new
  `apps/web/e2e/live/` Playwright suite runs against a real hub (owner
  seeded via `WAVVON_OWNER_PUBKEY`; see `e2e/live/README.md`). Covers
  smoke (onboard/join/send), nested-channel permalinks + drill-in +
  breadcrumbs, channel permission overwrites, role categories +
  color/icon, event slots + reminders, temp-voice spawner (1fc5aa6
  regression), soundboard upload/delete, and full-archive export. Bugs
  found + fixed during the pass:
  - **W (web): channel live-push broken for newly-created channels** —
    the web client never sent the WS `subscribe` frame (the platform
    `subscribeChannel` hit a non-existent HTTP route), so messages in a
    channel created after connect never pushed live. Now sends the WS
    frame and subscribes on channel select.
  - **W (web): event creation fully broken** — composer never sent
    `channel_id` (hub 400), and the bare create-response (no
    `rsvp_counts`/`slots`) crashed `EventCard`; threaded `channel_id`
    through and refetch after create.
  - **W (web): modal clipped tall content** — `.modal` had no
    `max-height`, so the channel Permissions tab's Save/actions row was
    pushed off-screen. Added `max-height`/`overflow-y`.
- **Web e2e round 2 — profile / member list / channel CRUD / roles** —
  added `e2e/live/09..12`: profile-edit propagation, member presence,
  channel/category/forum/banner CRUD, and role-assignment. Bug found +
  fixed:
  - **W (web): i18n placeholders shown literally** — 11 catalog entries
    used i18next double-brace `{{name}}` syntax, but the client uses
    **i18next-icu** (single-brace `{name}`), so they rendered the raw
    `{{name}}` to users. Most visible on the channel/category right-click
    menu (`Edit "{{name}}"` / `Delete "{{name}}"`); also user profile
    "Joined", archive strength/progress, invite/discovery hints. Converted
    all to single-brace in `packages/i18n/en.json`.
- **Web: assign/remove roles from the member right-click menu (2026-07-04)**
  — closed the biggest client discrepancy found in round 2. The web
  `UserContextMenu` now has a "Roles" section (gated on `manage_roles`,
  hides `@everyone` and roles at/above the viewer's priority) that toggles
  `PUT`/`DELETE /users/{pubkey}/roles/{role_id}`; member list regroups on
  change. New platform commands `assignRoleToUser`/`removeRoleFromUser`/
  `listUserRoles`; covered by `12-role-assignment.spec.ts`. Cross-client
  parity is now tracked in [`client-parity.md`](docs/client-parity.md)
  (**android still lacks it**; desktop has a near-identical version to
  align).

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
- **Role assignment — client parity** (web FIXED 2026-07-04; see Recently
  shipped). Remaining, tracked in [`client-parity.md`](docs/client-parity.md):
  **android** still has no role-assignment control in its user context menu;
  **desktop** has one to align with web's filtering. Separately, **no client
  has a create/delete-role UI** on web/android (`createRole`/`deleteRole`
  platform commands exist but are unused) — desktop only.
- **Web profile changes don't propagate live to other clients** — found
  2026-07-04 (e2e round 2). `PATCH /me` updates the DB but broadcasts no
  WebSocket event, and the client has no `user_updated`/`profile_updated`
  handler (only `member_online`/`member_offline`, which flip a boolean).
  So a display-name/avatar change updates the *acting* client (it refetches
  `/users`) but other connected clients keep the stale name in the member
  list AND on all messages (author names resolve from the live `users` map)
  until they reconnect/reload. Fix: broadcast a member-updated event and
  handle it client-side. Same-client propagation is fine (tested).
- **Web has no presence status (away/DND/custom)** — presence is a binary
  online/offline dot driven by `member_online`/`member_offline`; there is
  no status picker. Also, a brand-new member does not appear in an
  already-loaded client's member list until that client refetches `/users`
  (`onMemberOnline` only flips `online` on users already in the array).
  Documented by `10-member-presence.spec.ts` (which reloads to pick up the
  join; offline transitions of known members ARE live).
- **Banner channels aren't manageable from the web sidebar** — a banner
  channel renders as a bare `<li>` (just the image, or empty when no image
  is set) with no name, no context menu, and no settings gear, so there's
  no affordance to rename or delete it once created. Create-only on web.
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
- **2026-07-04 batch: live pass DONE for web** (via the new
  `e2e/live/` suite — see Recently shipped) for the Permissions tab,
  channel permalinks/breadcrumbs, sidebar drill-in, role categories,
  event slots, temp voice, soundboard, and data export. Still needs a
  live run: the Discord importer (`export` with a real bot token,
  `apply` against a running hub). Also still open: the channel-settings
  gear is `isAdmin`-gated (pre-existing), so a member with only
  `manage_roles` can't reach the Permissions tab the server would allow
  them to use.
- **Web mock-API e2e (`forum.spec.ts`) is broken** — found 2026-07-04.
  Its `injectSession` helper seeds only localStorage (saved hub +
  token), but the app now shows the identity-setup screen unless an
  IndexedDB identity exists, so all 5 forum specs time out on the setup
  screen. Pre-existing, unrelated to the live suite. Fix: have
  `injectSession` also seed the IDB `wavvon/identity/main` record (the
  live suite's saved storageState already does this correctly).
- **Web role appearance controls shown on built-in roles** — found
  2026-07-04. `RolesSection` renders the color/icon/category controls
  for `@everyone`/`Owner`, but the hub rejects appearance PATCHes on
  built-in roles ("Cannot modify built-in roles"), so the controls
  silently error. Either hide them for built-in roles or allow the
  appearance fields server-side. (The e2e role test uses a custom role
  to sidestep this.)
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
- **Paired-device DMs attribute to the subkey, not the canonical identity** —
  found 2026-07-04 building pairing. The community experience (messages,
  membership, roles, bans) is token-based and already resolves to the shared
  canonical identity, but DM envelopes and the published DH key are signed with
  the device's own subkey seed, so a DM sent from a paired device shows its
  subkey as sender. Fix: sign/attribute DMs + DH key against the canonical
  identity (or have the hub map subkey→canonical on the DM path).
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
