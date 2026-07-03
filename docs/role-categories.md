# Role Categories & Role Appearance

Native grouping for roles, plus cosmetic identity (color, icon) for
both roles and their categories. Kills the "fake divider role" hack
(`─── Staff ───`) that communities on centralized platforms use to
visually split their role lists — a hack that pollutes the permission
system, role pickers, and mention search with permissionless roles.

**Status: server + web client shipped 2026-07-04** (hub `31c291b`,
clients `a6b2d24`). Desktop/Android parity (§4, §6) not started.

---

## 1. Scope and decided rules

Decided 2026-07-03 (see [decisions.md](decisions.md)):

- **Categories are display-only containers. They carry no
  permissions.** Permission resolution (`permissions.rs`, including the
  channel-overwrite cascade) never reads categories. Same
  container-vs-leaf sharpness as channel categories.
- **Two display surfaces**:
  1. **Role-settings UI** — the hub-admin "Roles" tab lists roles
     grouped under category headers instead of one flat list.
  2. **User profile card** — the member popover groups that user's
     role badges under category headers.
- **Member sidebar is out of scope.** Sidebar hoisting stays driven by
  `display_separately` on individual roles (`UserListGrouped.tsx`),
  unchanged.
- **Roles gain color and icon in the same pass.** Today the `roles`
  table has no cosmetic columns at all (`name`, `priority`,
  `display_separately`, `talk_power`, `created_at`). A category color
  with colorless roles under it is half a feature.

## 2. Data model

Additive-only, per repo convention. `role_categories` must be created
before the `roles.category_id` column that references it.

```sql
CREATE TABLE IF NOT EXISTS role_categories (
    id         TEXT   PRIMARY KEY,
    name       TEXT   NOT NULL,
    color      TEXT,             -- "#RRGGBB" or NULL
    icon       TEXT,             -- emoji grapheme or NULL (see §5)
    position   BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
);

ALTER TABLE roles ADD COLUMN color TEXT;        -- "#RRGGBB" or NULL
ALTER TABLE roles ADD COLUMN icon  TEXT;        -- emoji grapheme or NULL
ALTER TABLE roles ADD COLUMN category_id TEXT
    REFERENCES role_categories(id) ON DELETE SET NULL;
```

(`ALTER TABLE ADD COLUMN` wrapped to ignore "already exists" errors,
matching the existing migration pattern.)

- `NULL` color/icon = no cosmetic styling (today's rendering).
- `NULL` category_id = uncategorized; renders in a trailing unnamed
  group after all categories.
- `ON DELETE SET NULL`: deleting a category never deletes roles — they
  fall back to uncategorized.
- Ordering: categories by `position` ASC, roles inside a category by
  the existing `priority` DESC.

## 3. Server API

All mutations require `MANAGE_ROLES` (hub-wide — categories have no
channel dimension) and write `hub_audit_log` entries
(`role_category.created` / `.updated` / `.deleted`,
`role.appearance_updated`).

### Category CRUD (new, `hub/src/routes/roles.rs` or a sibling module)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/role-categories` | List, ordered by `position`. Any member may read (same visibility as `GET /roles`). |
| `POST` | `/role-categories` | `{ name, color?, icon?, position? }` |
| `PATCH` | `/role-categories/:id` | Any subset of `{ name, color, icon, position }` |
| `DELETE` | `/role-categories/:id` | Roles fall back to uncategorized (FK `SET NULL`). |

### Extensions to existing role routes

- Role list/detail responses gain `color`, `icon`, `category_id`
  (nullable — old clients ignore unknown fields).
- Role create/update requests accept the same three fields.
- Validation, server-side: `color` matches `^#[0-9a-fA-F]{6}$`; `icon`
  is a single emoji grapheme, max 16 bytes; `category_id` must exist.
  400 otherwise.

No new WS events in v1: role/category edits are admin-panel operations;
clients refetch on panel open exactly as the roles tab does today. (If
live propagation is wanted later, piggyback the existing role-updated
notification path.)

## 4. Client

Web is the delivery target; desktop/Android parity is a follow-up (they
have their own `RoleEditor.tsx`/`RoleCreator.tsx` copies).

- **Types** (`apps/web/src/types.ts`): `RoleInfo` gains
  `color: string | null`, `icon: string | null`,
  `category_id: string | null`; new `RoleCategory` interface.
- **Platform adapter** (`apps/web/src/platform/`): four new route
  functions for category CRUD + extended role create/update payloads,
  per the adapter contract.
- **Hub admin, Roles tab** (`HubAdminPage.tsx`): render roles grouped
  under category headers (header shows category icon + name, tinted
  with its color). A category manager above the list: create, rename,
  recolor, reorder (position up/down is enough — no drag-drop in v1),
  delete. Each role row gains a category dropdown, a color swatch
  picker, and an emoji icon picker (reuse `EmojiPicker.tsx`).
- **User profile card** (`UserProfileCard.tsx`): group
  `profile.roles` by `category_id` — category header line (icon +
  name), then that user's role badges beneath it; uncategorized badges
  in a trailing unnamed group. A role badge with a `color` renders
  tinted (border/text tint on the existing `role-badge` class — keep
  contrast accessible in both themes); with an `icon`, the emoji leads
  the badge text. Categories the user has no roles in don't render.
- **Member sidebar** (`UserListGrouped.tsx`): no change. (Role `color`
  MAY tint names in the member list later — deferred, see §6.)

## 5. Why emoji icons, not image uploads

v1 icons are a single emoji grapheme stored as text. Image uploads
would need upload routes, storage quotas, moderation, and cache
invalidation — for a decoration. Emoji cover the actual use cases
(🛡️ Staff, 🎮 Games, 🏆 Achievements), render identically on all
clients with zero infrastructure, and the column upgrades cleanly to an
asset-id scheme later if ever justified.

## 6. Deferred

- **Member-sidebar sectioning by category** — explicitly out of scope
  (decided); `display_separately` stays the only hoisting mechanism.
- **Role color in member list / message author names** — visual-noise
  tradeoff; decide after the badge tinting ships.
- **Icon image uploads** — see §5.
- **Desktop/Android parity** — after the web ship, port to the per-app
  role editors.
- **Category-scoped bulk actions** ("give everyone in these roles…") —
  categories stay display-only; any bulk tooling operates on roles.

---

## Decisions

- **Display-only categories, no permissions.** A category that carried
  permissions would be a second grouping axis competing with roles and
  the channel-overwrite cascade. Grouping is cosmetic; the permission
  model keeps exactly one unit (the role).
- **Two surfaces (role-settings UI + profile card), sidebar excluded.**
  The profile card is where flat role chips hurt most; the sidebar
  already has a working hoisting mechanism and re-sectioning it would
  change every member list on day one of a cosmetic feature.
- **Color/icon on roles ships in the same pass as categories.** Roles
  have no cosmetic columns today; category headers over colorless
  badges would look unfinished, and both surfaces need role-level
  styling to pay off.
- **Emoji icons in v1, not uploads.** Zero infrastructure, full
  coverage of real use cases, forward-compatible column.
- **`ON DELETE SET NULL` for category deletion.** Deleting a grouping
  must never delete or alter the roles inside it — they return to the
  uncategorized group.
