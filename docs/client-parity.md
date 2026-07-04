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

| Feature | Web | Desktop | Android |
|---|:--:|:--:|:--:|
| Assign/remove roles to a member — right-click menu | ✅ (2026-07-04) | ✅ | ❌ **TODO** |
| Create / delete hub roles (admin UI) | ❌ | ✅ | ❌ |
| Role appearance (color/icon) + categories (admin UI) | ✅ | partial | ❌ |
| Kick / Ban / Mute — right-click menu | ✅ | ✅ | ❌ |
| Presence status (away / DND / custom) | ❌ | ❌ | ❌ |
| Banner-channel rename/delete from sidebar | ❌ | ? | ? |

`?` = not yet audited. Extend this table as gaps are found.

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

---

## Related (not client-parity, but adjacent)

- **Profile changes don't propagate live** to other connected clients —
  `PATCH /me` broadcasts no WebSocket event, so this affects all three
  clients equally. It's a **hub** change (add a member-updated broadcast +
  client handlers), tracked in `ROADMAP.md` Known issues, not here.
