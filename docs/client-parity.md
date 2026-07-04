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
| Camera / webcam video (`VideoGrid`) | ❌ | ✅ | ? |
| Whisper (targeted voice) | ❌ | ✅ | ? |
| Hub-streams panel (cross-channel) | ❌ | ✅ | ? |
| Mic level meter | ❌ | ✅ | ? |
| In-app push-to-talk | ❌ | ✅ | ? |
| Global (unfocused) PTT hotkey | ➖ native | ✅ | ➖ |
| Audio-profile applied to live session | ✅ (2026-07-04) | ✅ | ? |
| **Identity / profile / social** | | | |
| Avatar image upload + crop | ✅ (2026-07-04) | ✅ | ? |
| Friends (requests/list/DM) | ❌ (button now hidden) | ✅ | ? |
| Multi-profile + per-hub assignment | ❌ | ✅ | ? |
| "My certifications" viewer (member) | ❌ | ✅ | ? |
| Home-hub list management | ❌ (read-only) | ✅ | ? |
| Multi-device pairing + device list/revoke | ❌ | ✅ | ? |
| **Hub admin** | | | |
| Assign/remove roles — right-click menu | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Create / delete roles + edit permissions | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Role appearance (color/icon) + categories | ✅ | partial | ❌ |
| Alliances (create/join/share) + invite inbox | ❌ | ✅ | ? |
| Onboarding lobby + survey (admin & member) | ❌ | ✅ | ? |
| Anti-spam challenge settings + member challenge | ❌ | ✅ | ? |
| Hub audit log | ❌ | ✅ | ? |
| Hub icon library | ❌ | ✅ | ? |
| Native bot admin / create / wizard | ❌ | ✅ | ? |
| Channel bans / appearance / icon picker | ❌ | ✅ | ? |
| Kick / Ban / Mute — right-click menu | ✅ | ✅ | ❌ |
| Presence status (away / DND / custom) | ❌ | ❌ | ❌ |
| Banner-channel rename/delete from sidebar | ❌ | ? | ? |

### Where web is ahead of desktop (parity is bidirectional)

Web should not regress these; desktop/android should catch up:
events with role slots + reminders, soundboard, full encrypted
data-export archive, channel permission-overwrite tab, role categories +
per-role color/icon, DND / quiet-hours, the moderation suite (content
reports, automod webhook, outgoing webhooks, federated ban lists), link
previews, and passkeys + hub trusted-devices.

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
  commands. It hides `@everyone` and any role whose priority is ≥ the
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

- No client has an away/DND/custom-status picker; presence is a binary
  online/offline dot (`member_online`/`member_offline`). If we want status,
  it's a new cross-client feature (server event + picker in all three).

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
- **Friends button now hidden (2026-07-04).** The 👥 entry point only
  renders when an `onOpenFriends` handler is wired; web passes none, so the
  dead button is gone. **Still TODO:** actually build the friends feature on
  web (modal + requests + `useFriends` + platform commands) to reach
  desktop parity — see the social gaps above.
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
- **Camera video / whisper / hub-streams panel** remain web gaps (media
  audit) — separate follow-ups.

### 8. Avatar image upload (web) — DONE (2026-07-04)

- New `components/ImagePicker.tsx` (ported from desktop) — file picker +
  drag-drop, center-crops to a 128px JPEG data URL — added to the Settings
  profile tab alongside the existing URL field. Saves through the existing
  `PATCH /me` avatar. Covered by `e2e/live/14-avatar-upload.spec.ts`.

---

## Related (not client-parity, but adjacent)

- **Profile changes don't propagate live** to other connected clients —
  `PATCH /me` broadcasts no WebSocket event, so this affects all three
  clients equally. It's a **hub** change (add a member-updated broadcast +
  client handlers), tracked in `ROADMAP.md` Known issues, not here.
