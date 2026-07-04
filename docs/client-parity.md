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
| Start a screen share (outbound) | ❌ | ✅ | ? |
| View someone's screen share | ✅ | ✅ | ? |
| Camera / webcam video (`VideoGrid`) | ❌ | ✅ | ? |
| Whisper (targeted voice) | ❌ | ✅ | ? |
| Hub-streams panel (cross-channel) | ❌ | ✅ | ? |
| Mic level meter | ❌ | ✅ | ? |
| In-app push-to-talk | ❌ | ✅ | ? |
| Global (unfocused) PTT hotkey | ➖ native | ✅ | ➖ |
| Audio-profile applied to live session | ⚠️ half-wired | ✅ | ? |
| **Identity / profile / social** | | | |
| Avatar image upload + crop | ❌ (URL only) | ✅ | ? |
| Friends (requests/list/DM) | ❌ (dead button) | ✅ | ? |
| Multi-profile + per-hub assignment | ❌ | ✅ | ? |
| "My certifications" viewer (member) | ❌ | ✅ | ? |
| Home-hub list management | ❌ (read-only) | ✅ | ? |
| Multi-device pairing + device list/revoke | ❌ | ✅ | ? |
| **Hub admin** | | | |
| Assign/remove roles — right-click menu | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Create / delete roles + edit permissions | ❌ | ✅ | ❌ |
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

### 2. Create / delete hub roles (admin UI)

- Web and android have **no create/delete-role UI**; the platform commands
  `createRole`/`deleteRole` exist but are unused. Desktop has it. Web/android
  admin can only edit role appearance + categories, not add/remove roles.
  Track adding a create/delete-role control to the web (then android) Roles
  admin tab.

### 3. Presence status

- No client has an away/DND/custom-status picker; presence is a binary
  online/offline dot (`member_online`/`member_offline`). If we want status,
  it's a new cross-client feature (server event + picker in all three).

### 4. Banner-channel management

- On web a bannerless banner channel renders as an empty sidebar row with no
  context menu or settings gear, so it can't be renamed/deleted after
  creation. Audit desktop/android and decide the intended management surface
  (e.g. always expose the settings gear regardless of channel type).

### 5. Half-wired / dead on web (quick wins)

- **Friends button is a no-op** — `ChannelSidebar.tsx:635` renders a 👥
  button, but `App.tsx:1827` wires `onOpenFriends={() => {}}`. There is no
  `FriendsModal`/`useFriends`/friend platform commands on web (only an
  unused `Friend` type). Either build the friends feature or hide the button.
- **Audio profile not applied to the live voice session** — the settings
  UI saves an `AudioProfileConfig`, but `handleVoiceJoin` (`App.tsx:~1284`)
  constructs `VoiceWsSession` without passing it, so the saved profile has
  no runtime effect. Thread the config in.
- **Dead code:** `web/src/platform/webrtc.ts` `WebRtcSharerSession` is
  defined but never instantiated — the intended outbound-screen-share path
  was never wired (see the media gaps above).

---

## Related (not client-parity, but adjacent)

- **Profile changes don't propagate live** to other connected clients —
  `PATCH /me` broadcasts no WebSocket event, so this affects all three
  clients equally. It's a **hub** change (add a member-updated broadcast +
  client handlers), tracked in `ROADMAP.md` Known issues, not here.
