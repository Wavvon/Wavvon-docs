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

> **Big future pillars** (full writeups in
> [future-features.md](docs/future-features.md)): **1. Farm layer** — the
> major architectural next step (multi-hub control plane;
> [farm-model.md](docs/farm-model.md); farm-ready invites already landed).
> **2. Cross-farm certification relay** — follows the farm layer.
> **3. Gaming + rich bots** — one theme: give bots a Telegram-class runtime
> (interactive UI, audio, video) and games fall out ([gaming.md](docs/gaming.md)).

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
  verifying independently. No design work started; **follows the farm
  layer** (pillar 1 above). See [`future-features.md`](docs/future-features.md).
- **Alliance space-sharing — any space + sub-spaces** — sharing is
  limited to text + forum channels today; expand to any space type
  (banner/channel/category/forum) and share a container's sub-tree
  recursively. See [`alliances.md`](docs/alliances.md) "What's not done".
- **Forum post federation across alliances** — v1 forums are hub-local
  only; posts/replies don't federate over alliance-shared channels. No
  design work started; overlaps the alliance space-sharing work above.
  See [`forum.md`](docs/forum.md).
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

- **Manual-test bug pass (2026-07-05) — batch 5 (features + polish)**. All with
  2+ Playwright tests each; full live suite 62 green.
  - **Farm-ready invites** (`237eb59`): `wavvon://<host>/i/<hubSerial>/<code>`
    (serial = hub public key) so a farm can route the same domain to different
    hubs by serial. `parseHubInput` extracts the serial (path or `?hub=`,
    backward-compatible), `buildInviteLink` generates it, and the Invites admin
    tab shows a full copyable link. 5 core unit tests + `e2e/live/42`.
  - **Soundboard popover** no longer overflows the viewport (`0ea4404`,
    `e2e/live/39`); **channel-header buttons** spaced out.
  - **Voice join/leave sound cues** wired (`playVoiceTone`) with a toggle
    (`37db681`, `e2e/live/41`); mention ping already covered notifications.
  - **Incoming + outgoing webhooks** merged into one Integrations tab
    (`756e7f3`, `e2e/live/40`).
  - **Camera device picker + live preview** in Settings (`9edb456`,
    `e2e/live/43`).
  - **Webcam background effects — blur / image / video** (`8b1d489`,
    `e2e/live/45`). Ported + extended the desktop `BackgroundProcessor`
    (MediaPipe selfie segmentation); no device gating (opt-in, user decides);
    model + WASM served **self-hosted** from `/mediapipe/*` via a Vite plugin
    (no CDN, offline-friendly, nothing committed), lazy-loaded on first use,
    graceful fallback to raw video if it can't load.
  - **Hub-admin nav grouped** into labeled sections + made scrollable
    (`e803326`, `e2e/live/44`).
  - **#7** (redundant join-voice button): investigated — the channel header is
    the only join-voice control; nothing redundant found to remove.

- **Manual-test bug pass (2026-07-05) — batch 1** (server `4d38025`, clients
  `33c4485`). From hands-on testing of the running hub:
  - **Ban/kick/mute from the member right-click menu were broken** — the client
    hit `/admin/bans`, `DELETE /admin/members/{pk}`, `/admin/members/{pk}/mute`,
    none of which exist. Pointed them at `POST /moderation/{bans,kick,mutes}`.
    `e2e/live/33`.
  - **Integrations tab 405'd** — listing used `GET /admin/webhooks` and
    regenerate used `PATCH /admin/webhooks/{id}`, but only POST/DELETE existed.
    Added both handlers. Also fixed a pre-existing **create 500** (the INSERT
    passed integer `1` for the BOOLEAN `active` column). `e2e/live/34`.
  - **Theme-picker buttons unreadable in calm/light** — inherited the base
    button's `var(--accent-text)` (dark in calm, white in light) on a surface
    background. Set an explicit `color: var(--text)`.
  - **"Identity backup" label shown twice** in the account tab — deduped.
- **Manual-test bug pass (2026-07-05) — batches 2–4** (server `05b890d`,
  clients `f3ee45e`, `22dcc58`, `c05c544`, `bfb658c`, `fa5bd85`, `1173f94`):
  - **Voice:** switching voice channels now leaves the previous one (repeated
    joins stacked sessions → "in 3 rooms at once" + stale roster entries that
    blocked temp-channel cleanup); the channel tree no longer duplicates the
    voice roster (your name showed twice). `e2e/live/35`.
  - **Channels:** deleting a category/channel cascades to all descendants
    (was 409); long channel names truncate so the settings gear stays reachable.
    Also fixed `tests/common.rs` (the hub integration suite hadn't compiled since
    the whisper AppState field). `e2e/live/36,37`.
  - **Settings surfaces:** language switcher (Settings → Appearance, `e2e/live/38`);
    audio input/output device pickers (Settings → Voice); discovery directory
    shows a greyed "Service not available" state when unreachable; clarified the
    SVG icon-library field.
  - Still queued from the manual test: voice/notification sound cues (#9/#10),
    merge incoming+outgoing webhooks into one Integrations section (#19), webcam
    device/preview + background blur (#6, blur is a large ML add), a full
    settings recategorization (#21), and one redundant join-voice button needing
    a pointer (#7).

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

- **Desktop background effects load the MediaPipe model from a CDN** — found
  2026-07-05 while shipping web background effects. `apps/desktop/src/utils/
  backgroundProcessor.ts` uses `locateFile: (f) => https://cdn.jsdelivr.net/
  npm/@mediapipe/selfie_segmentation/${f}`, so blur/image backgrounds require
  internet and hit jsDelivr — wrong for a desktop app (breaks offline, odd for
  a self-hosted product). The web client now serves the same assets locally
  (the `mediapipeAssets` Vite plugin → `/mediapipe/*`, package
  `@mediapipe/selfie_segmentation` is already a desktop dep). **Fix:** bundle
  the model + WASM as Tauri resources and point `locateFile` at the local path.
  While there, port the web version's **video background** mode (desktop only
  has none/blur/image) for parity.
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
    swatch sinks. **W2** — FIXED 2026-07-05 (clients `46fa57e`):
    `SortableItems.tsx` now validates `channel.color` via `safeRoleColor`
    before the category-header `background` sink.
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
  **desktop** has one to align with web's filtering. (Web has a full
  create / edit-permissions / delete-role UI — Roles admin tab, covered by
  `e2e/live/13`; **android** still lacks it.)
- **✅ Web profile changes now propagate live — FIXED 2026-07-04** (hub
  `a23a7d9`, clients `fb97442`). `PATCH /me` now broadcasts a hub-wide
  `member_updated` WS event carrying the fresh name/avatar; the client updates
  the member in its `users` map in place, so display-name/avatar changes show
  live on other clients (member list + message authors) without a reload.
  `e2e/live/29`.
- **Web has no presence status (away/DND/custom)** — presence is a binary
  online/offline dot driven by `member_online`/`member_offline`; there is
  no status picker. Also, a brand-new member does not appear in an
  already-loaded client's member list until that client refetches `/users`
  (`onMemberOnline` only flips `online` on users already in the array).
  Documented by `10-member-presence.spec.ts` (which reloads to pick up the
  join; offline transitions of known members ARE live).
- **✅ Banner channels manageable from the web sidebar — FIXED 2026-07-05**
  (clients `47ee91f`). Admins get a management row (name + settings gear) plus
  a right-click context menu on banner rows, so they can rename/delete like any
  channel; members still see just the image. `e2e/live/11`.
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
- **✅ `packages/core` crypto test vectors regenerated — FIXED 2026-07-04**
  (clients `fb97442`). `src/identity/crypto.test.ts` asserted pre-rename
  `"voxply/…"` wire tags and was excluded from the suite; regenerated the
  DhKeyRecord + DM-envelope vectors against the canonical `wavvon-identity`
  values and re-enabled it (now runs alongside the new `wire.test.ts`).
- **✅ Hub switch / fresh load left the message pane empty — FIXED
  2026-07-04** (clients `42a3390`). `loadHubData` auto-selected the first
  channel but never fetched its messages (only `handleSelectChannel` did), so
  the pane stayed empty until a manual click. It now fetches + subscribes the
  auto-selected channel (guarded against a racing manual selection).
  `e2e/live/30`.
- **2026-07-04 batch: live pass DONE for web** (via the new
  `e2e/live/` suite — see Recently shipped) for the Permissions tab,
  channel permalinks/breadcrumbs, sidebar drill-in, role categories,
  event slots, temp voice, soundboard, and data export. Still needs a
  live run: the Discord importer (`export` with a real bot token,
  `apply` against a running hub). Also still open: the channel-settings
  gear is `isAdmin`-gated (pre-existing), so a member with only
  `manage_roles` can't reach the Permissions tab the server would allow
  them to use.
- **✅ Web mock-API e2e (`forum.spec.ts`) repaired — FIXED 2026-07-05**
  (clients `46fa57e`). `injectSession` now also seeds the IndexedDB
  `wavvon/identity/main` record (the app requires it or shows the
  identity-setup screen). Also fixed the mock route setup that surfaced once
  the screen was bypassed: the catch-all falls back to the specific mocks
  instead of the network, the list-posts mocks match the query string, and the
  reaction test keys off the POST landing rather than a fetch counter. 5/5
  green.
- **✅ Web role appearance controls on built-in roles — FIXED 2026-07-04**
  (clients `42a3390`). `RolesSection` no longer renders the
  color/icon/category controls for `@everyone`/`Owner` (the hub rejects
  appearance PATCHes on built-in roles). Permissions — a separate endpoint,
  still editable for `@everyone` — remain. `e2e/live/31`.
- **✅ Icon pickers can no longer store non-rendering shortcodes — FIXED
  2026-07-05** (clients `47ee91f`). `EmojiPicker` gained a `unicodeOnly` prop
  that hides the hub-custom-emoji (`:name:`) section; the role, channel,
  category, and soundboard icon pickers pass it (the message composer still
  offers custom emoji). `e2e/live/32`.
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
