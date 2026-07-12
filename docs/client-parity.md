# Client feature parity

**Principle:** the three clients — **web** (`apps/web`), **desktop**
(`apps/desktop`, Tauri) and **android** (`apps/android`, Tauri mobile
wrapping the web platform layer) — should offer the same features. A
capability landing in one client but not the others is a bug to track, not
an accepted difference.

**Priority:** the **web client is the first product users will touch**, so
web leads: a feature ships on web first, and desktop/android are brought to
parity from there. This doc tracks the known gaps.

The three clients each keep their own copy of the UI components and platform
commands (only `packages/{core,ui,platform,i18n}` are shared, and
`UserContextMenu.tsx` is **not** in `packages/ui` — each app has its own).
So parity work usually means porting a change into each app's copy.

---

## Parity matrix

Legend: ✅ present · ❌ missing · ➖ n/a or native-only · `?` not audited.

### Desktop features missing from web (audited 2026-07-04)

Everything here is **portable** (no native API) unless marked native-only.

| Feature | Web | Desktop | Android |
|---|:--:|:--:|:--:|
| **Real-time media** | | | |
| Start a screen share (outbound) | ✅ (2026-07-04) | ✅ | ? |
| View someone's screen share | ✅ | ✅ | ? |
| Camera / webcam video (`VideoGrid`) | ✅ (2026-07-04) | ✅ | ? |
| Whisper (targeted voice) | ✅ (2026-07-04) | ✅ | ? |
| Hub-streams panel (cross-channel) | ✅ (2026-07-04) | ✅ | ? |
| Mic level meter | ✅ (2026-07-04) | ✅ | ? |
| In-app push-to-talk | ✅ (2026-07-04) | ✅ | ? |
| Global (unfocused) PTT hotkey | ➖ native | ✅ | ➖ |
| Audio-profile applied to live session | ✅ (2026-07-04) | ✅ | ? |
| **Identity / profile / social** | | | |
| Avatar image upload + crop | ✅ (2026-07-04) | ✅ | ? |
| Friends (requests/list/remove) | ✅ (2026-07-04) | ✅ | ? |
| Multi-profile + per-hub assignment | ✅ (2026-07-04) | ✅ | ? |
| "My certifications" viewer (member) | ✅ (2026-07-04) | ✅ | ? |
| Home-hub list management | ✅ (2026-07-04) | ✅ | ? |
| Multi-device pairing + device list/revoke | ✅ (2026-07-04) | ✅ | ? |
| **Hub admin** | | | |
| Assign/remove roles — right-click menu | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Create / delete roles + edit permissions | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Role appearance (color/icon) + categories | ✅ | partial | ❌ |
| Alliances (create/leave) + invite inbox | ✅ (2026-07-04) | ✅ | ? |
| Alliance channel-sharing | ✅ (2026-07-04) | ✅ | ? |
| Onboarding: approval queue + lobby/challenge settings | ✅ (2026-07-04) | ✅ | ? |
| Onboarding survey builder + member survey | ✅ (2026-07-04) | ✅ | ? |
| Hub audit log | ✅ (2026-07-04) | ✅ | ? |
| Hub icon library | ✅ (2026-07-04) | ✅ | ? |
| Native bot admin / create | ✅ (2026-07-04) | ✅ | ? |
| Channel bans | ✅ (2026-07-04) | ✅ | ? |
| Channel appearance (color/icon) | ✅ (2026-07-04) | ✅ | ? |
| Kick / Ban / Mute — right-click menu | ✅ | ✅ | ❌ |
| Presence status (away / DND / custom) | ✅ (2026-07-05) | ✅ (2026-07-11) | ❌ |
| Banner-channel rename/delete from sidebar | ❌ | ? | ? |

### Where web is ahead of desktop (parity is bidirectional)

Web should not regress these; desktop/android should catch up:
events with role slots + reminders, soundboard, full encrypted
data-export archive, channel permission-overwrite tab, role categories +
per-role color/icon, the quiet-hours schedule (deferred everywhere; DND
itself is on web + desktop now), the moderation suite (content reports,
automod webhook, outgoing webhooks, federated ban lists), link previews,
and passkeys + hub trusted-devices.

### Present under a different name (NOT gaps)

Badges/tags → `ServerTagsSection`; cert admin → `CertificationsSection`;
invites → inlined in `HubAdminPage`; hub browse → `DiscoverPage`;
screen-share **viewing**, theme picker, and recovery-phrase import all
exist on web.

---

## Tracked items

### 1. Role assignment via the member right-click menu

- **Web — DONE (2026-07-04).** `apps/web/src/components/UserContextMenu.tsx`
  gained a "Roles" section, gated on `manage_roles`, that toggles the hub
  endpoints `PUT`/`DELETE /users/{public_key}/roles/{role_id}` via the new
  `assignRoleToUser` / `removeRoleFromUser` / `listUserRoles` platform
  commands. It hides `everyone` and any role whose priority is ≥ the
  viewer's own (mirroring the hub guard), and refetches `/users` on change
  so the member list regroups. Covered by
  `apps/web/e2e/live/12-role-assignment.spec.ts`.
- **Desktop — already present.** `apps/desktop/src/components/UserContextMenu.tsx`
  has a "Roles" submenu (`allRoles` + `onToggleRole`) backed by
  `useHubAdmin.ts` (`invoke("assign_role"/"unassign_role")`). Behavior is
  close but not identical to web — desktop filters only `builtin-owner`;
  web also filters `builtin-everyone` and by priority. **Align the two.**
- **Android — TODO.** `apps/android/src/components/UserContextMenu.tsx` has
  Send DM / Add friend / Copy key / block but **no role controls** (and no
  Kick/Ban/Mute). Port the web section: add
  `assignRoleToUser`/`removeRoleFromUser`/`listUserRoles` to
  `apps/android/src/platform/commands/roles.ts` (HTTP adapter, same as web),
  then add the Roles section to the android context menu.

### 2. Create / delete hub roles + edit permissions (admin UI)

- **Web — DONE (2026-07-04).** `apps/web/src/components/RolesSection.tsx`
  gained a "New role" creator (name + priority + permission checkboxes +
  hoist), a per-role expandable **Permissions** editor, and a **Delete**
  button (non-builtin only; `builtin-owner` permissions stay locked). Uses
  the existing `createRole`/`updateRole`/`deleteRole` commands. Covered by
  `apps/web/e2e/live/13-role-admin.spec.ts`. *(New controls use plain
  English, not i18n, to match desktop and avoid a 4-locale coverage gap —
  a follow-up is to add `hub.admin.roles.*` keys across all locales.)*
- **Android — TODO.** Port the same into `apps/android`'s `RolesSection`.

### 3. Presence status

- **Web — DONE (2026-07-05, gates + global broadcast 2026-07-10).**
  **Desktop — DONE (2026-07-11,** clients `81de52c`): hub-synced picker
  with custom text, DND notification gating, global broadcast +
  re-apply on reconnect, member-list status dots.
- **Android — TODO.** No picker, no `member_status` handling, no DND
  gating. It wraps the web platform adapter, so much of web's plumbing
  may apply; audit first.
- **Fixed 2026-07-04:** newly-joined members now appear in an already-loaded
  web client's member list live (`onMemberOnline` refetches `/users` for an
  unknown pubkey) — previously they only showed after a reload.
- **New known limit:** the hub's `GET /users` caps at 50 rows, so large
  communities' member lists truncate — needs pagination/search (hub work).

### 4. Banner-channel management

- On web a bannerless banner channel renders as an empty sidebar row with no
  context menu or settings gear, so it can't be renamed/deleted after
  creation. Audit desktop/android and decide the intended management surface
  (e.g. always expose the settings gear regardless of channel type).

### 5. Half-wired / dead on web

- **Audio profile now applied (FIXED 2026-07-04).** `handleVoiceJoin`
  reads the saved `AudioProfileConfig` from `localStorage` and passes it as
  the 5th `VoiceWsSession` arg, so the settings choice takes effect on the
  live session.
- **Friends built (DONE 2026-07-04).** `components/FriendsModal.tsx` +
  `platform/commands/friends.ts` (`listFriends`, `listPendingFriendRequests`,
  `sendFriendRequest`, `acceptFriendRequest`, `removeFriend`) against the hub
  `/friends` endpoints. The 👥 DM-sidebar button now opens it: add a friend by
  public key, accept pending requests, list + remove friends. Covered by
  `e2e/live/16-friends.spec.ts` (two-client send → accept → remove).
  *Follow-up:* a "Message" action to open a DM directly from a friend row
  (needs a start-DM-by-pubkey path).
- **Dead code:** `web/src/platform/webrtc.ts` `WebRtcSharerSession` is
  defined but never instantiated — the intended outbound-screen-share path
  was never wired (see the media gaps above).

### 6. Client-side error handling for unreachable services (2026-07-04)

- **Problem:** external network calls had no timeout, so an unreachable
  host (mistyped hub address, down discovery service, offline skin gallery)
  left the UI stuck on a spinner with no error.
- **Done:** added `fetchWithTimeout` (`platform/http.ts`, 10s default,
  respects a caller signal) that turns a timeout/network failure into a
  clear "Could not reach {host}" / "Timed out reaching {host}" error.
  `rawFetch` and `hubFetch` now use it (covers hub add/submit + `/info`
  preview + health), and `DiscoverPage` (`/api/hubs`) and `SkinsGallery`
  (`/api/skins`) call it directly. Error messages surface via each screen's
  existing error UI.
- **Follow-up:** apply the same timeout treatment in desktop/android
  network paths (their fetches live in the Tauri Rust layer / their own
  platform adapters); audit for other bare `fetch`/`invoke` calls that can
  hang.

### 7. Outbound screen share (web) — DONE (2026-07-04)

- Web could previously only *view* shares. New `WebScreenShareSession`
  (`platform/screenShare.ts`) captures via `getDisplayMedia` + `MediaRecorder`
  and speaks the hub's **chunk-transport** protocol byte-for-byte with the
  desktop sharer: `screen_share_start` (`transport:"chunks"`), then per blob
  a `screen_share_chunk` JSON envelope followed by a raw binary frame, then
  `screen_share_stop`. Added `HubWebSocket.sendBinary` (`platform/ws.ts`).
  A "🖥 Share screen" header button + the existing "You're sharing" bar drive
  it (`ChannelHeader`), with `sharing`/`shareKbps` state in `App.tsx`. The
  existing web viewer renders it unchanged. Covered by
  `e2e/live/15-screen-share.spec.ts` (sharer bar + second client sees the
  panel, both on fake media). *NOT ported to WebRTC — `webrtc.ts`'s unused
  `WebRtcSharerSession` (the `transport:"webrtc"` v2 path) still doesn't
  interoperate with the current viewer; a follow-up could adopt it.*
- **Camera video / whisper / hub-streams panel** — all DONE (2026-07-04);
  see items 11–12 below.

### 8. Avatar image upload (web) — DONE (2026-07-04)

- New `components/ImagePicker.tsx` (ported from desktop) — file picker +
  drag-drop, center-crops to a 128px JPEG data URL — added to the Settings
  profile tab alongside the existing URL field. Saves through the existing
  `PATCH /me` avatar. Covered by `e2e/live/14-avatar-upload.spec.ts`.

### 9. Admin cluster (web) — DONE (2026-07-04)

- **Hub audit log** (`AuditLogSection`, `GET /admin/audit-log`),
  **native bots** (`NativeBotsSection`, `/admin/bots` create/list/delete +
  one-time token), **hub SVG icon library** (`HubIconsSection`,
  `/hub/icons` CRUD), **alliances** (`AlliancesSection`, list/create/leave +
  invite inbox), **onboarding** (`OnboardingAdminSection`: approval queue
  `/hub/pending`, lobby settings, anti-spam challenge settings), and
  **per-channel bans** (`ChannelBansTab` in Channel Settings,
  `/channels/{id}/bans` v2). New platform commands: `audit`, `channelBans`,
  `hubIcons`, `nativeBots`, `alliances`, `onboardingAdmin`. Covered by
  `e2e/live/18-admin-cluster.spec.ts`. New role-admin/section strings are
  plain English (same i18n follow-up noted in item 2).

### 10. Mic meter + my-certs (web) — DONE (2026-07-04)

- **Mic level meter** — `MicLevelMeter` in Settings → Voice (client-only
  getUserMedia + AnalyserNode). `e2e/live/17`.
- **My certifications viewer** — `MyCertificationsSection` in Settings →
  Account, read-only fan-out over `GET /identity/{pubkey}/certs`.
  `e2e/live/19`.

---

## Remaining after the 2026-07-04 porting pass

Definitive status for everything still not at parity:

- **Camera video — DONE (2026-07-04).** `WebVideoSession`
  (`platform/video.ts`) does full-mesh WebRTC over the main WS
  (video_offer/answer/ice, STUN-only, smaller-pubkey-initiates). Created at
  voice-join (to catch the `video_participants` roster), camera captured on
  toggle; `VideoGrid` + a header camera button. `e2e/live/20` verifies two
  clients exchange remote tracks. *Follow-ups: background blur, device
  picker, active-speaker gating — desktop extras not ported.*
- **Whisper — DONE (2026-07-04).** Web `WhisperBar` + `voice_whisper_*`
  control, `voice.ts` now accepts 0x01 frames, and the **hub** gained
  pubkey-based whisper routing (`whisper_target_pubkeys` +
  `voice_ws.rs` `only_to` filter) so a web whisper actually reaches only its
  targets. `e2e/live/21` verifies the control plane. *Follow-ups: (1)
  **desktop→web** whisper audio still won't reach a web target (the UDP
  relay in `main.rs` routes by SocketAddr, and web targets have a sentinel
  addr) — needs the UDP `0x01` branch to also deliver to `voice_ws_senders`;
  (2) role-type whisper targets route only via the UDP addr set, not the
  pubkey set; (3) whisper-list save/load (named lists) not ported.*
- **Hub-streams panel — DONE (2026-07-04).** `HubStreamsPanel` behind a 📡
  header button lists screen shares in other channels
  (`requestStreamList`/`subscribeStream`/`unsubscribeStream` over the WS
  control plane); a subscribed stream is pushed into `activeScreenShares` so
  the shared `ScreenShareViewer` renders it. `e2e/live/26` has a member watch
  a share from another channel without joining it.
- **In-app (focused) push-to-talk — DONE (2026-07-04).** `PushToTalkSection`
  (Settings → Voice) + an App effect that gates `VoiceWsSession.setMuted()`
  on the bound key while in voice; isolated so non-PTT users are unaffected.
  `e2e/live/23`. Global/unfocused PTT stays native-only.
- **Alliance channel-sharing — DONE (2026-07-04)** (`e2e/live/18`).
- **Channel appearance (color/icon) — DONE (2026-07-04)** (`e2e/live/22`).
- **Multi-profile + per-hub assignment — DONE (2026-07-04).** Client-only
  (`utils/profiles.ts` localStorage store); `ProfilesSection` in Settings →
  Profile does CRUD + set-default + apply-to-hub (applying does `PATCH /me`
  display-name/avatar), with per-hub assignment persisted locally.
  `e2e/live/24`.
- **Onboarding survey builder + member survey — DONE (2026-07-04).**
  `SurveyAdminSection` (add text/choice questions, choices, enable, save via
  `PUT /admin/survey`) + `SurveyModal` shown to members on join
  (`GET /survey/current`, `POST /survey/submit`; the public shape has no
  `enabled` field, so App gates on `questions.length` + a dismissed set).
  `e2e/live/25`.
- **Identity crypto port — DONE (2026-07-04).** The blocker for both items
  below. `packages/core/src/identity/` now has `master.ts` (HKDF master-key
  derivation from the device seed), `wire.ts` (length-prefixed signing-bytes +
  signed-struct builders for HomeHubList, SubkeyCert, RevocationEntry,
  PairingOffer, PairingClaim), and `ecies.ts` (X25519 wrap/unwrap for the
  prefs-blob key). `wire.test.ts` asserts every envelope against the canonical
  hex vectors in `wavvon-identity`, so the port is byte-for-byte identical; a
  new `MASTER_FROM_ENTROPY_PUB` vector pins the HKDF derivation cross-language.
- **Home-hub list management — DONE (2026-07-04).** `HomeHubsSection`
  (Settings → Account) reads `GET /identity/{master}/designation`, edits the
  ordered hub list, and publishes a master-signed `HomeHubList` via
  `POST …/designation`. `e2e/live/27`.
- **Multi-device pairing + device list/revoke — DONE (2026-07-04).**
  `DevicesSection` (existing device): enable multi-device (self-issue a
  subkey-0 cert + re-auth so the hub records the master), create a signed
  pairing offer, show a paste code, approve the new device's claim by issuing
  a master-signed `SubkeyCert`; plus device list + revoke. Identity setup (new
  device): paste the code, mint a fresh subkey, claim, and on approval store
  the cert and join. Auth (`platform/commands/hubs.ts`) now presents the stored
  cert and records the `canonical_pubkey` the hub returns, so a paired device
  self-identifies as the shared user. `e2e/live/28` pairs a second browser
  context and asserts the hub resolves it to the owner's canonical identity.
  *Follow-up: DM sender attribution and the DH key are still signed with the
  device subkey rather than mapped to the canonical identity, so DMs from a
  paired device attribute to its subkey. The community experience (messages,
  membership, roles, bans) is token-based and already canonical. Tracked.*

**Feature parity with desktop is complete** for the web client's scope. The
remaining refinement is canonical-identity mapping for a paired device's DMs
and DH key (see the pairing follow-up above) — an enhancement, not a gap.

---

## Related (not client-parity, but adjacent)

- **Profile changes don't propagate live** to other connected clients —
  `PATCH /me` broadcasts no WebSocket event, so this affects all three
  clients equally. It's a **hub** change (add a member-updated broadcast +
  client handlers), tracked in `ROADMAP.md` Known issues, not here.
