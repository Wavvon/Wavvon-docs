# Nested Channels — UX and Permission Overwrites

Nested channels shipped: the `channels` table has `parent_id`/`is_category`,
`hub/src/routes/channels.rs` (Wavvon-server) enforces depth and cycle
detection on create/move, `max_channel_depth` is a wired hub setting, and
`ChannelSidebar.tsx` (Wavvon-client) renders the tree recursively with
drag-drop re-parenting. See the "Nested channels" section of
[future-features.md](future-features.md) for that shipped baseline.

Three gaps remained undesigned. This doc closes all three:

1. **Channel permalinks** (§1) — a shareable link to a specific,
   possibly deeply-nested channel that resolves on open and shows its
   breadcrumb path. Client-only; no new server API.
2. **Deep-nesting sidebar display** (§2) — indentation past ~6 levels is
   unusable today. Client-only; no new server API.
3. **Channel permission overwrites** (§3) — the "permissions cascade like
   a file system" rule from the Nested Channels design was never
   implemented. Permission checking today is purely role-based and
   hub-wide. This is a net-new mechanism: data model, enforcement, admin
   routes, and UI.

The three are independent — §1 and §2 can ship without §3.

---

## 1. Channel permalinks

### 1.1 Scheme

Reuse the existing message-permalink scheme, dropping the message suffix:

```
wavvon://{host}/channel/{channel_id}
```

This mirrors the message permalink already produced by the "Copy link"
button in `MessageRow.tsx` (Wavvon-client, all three apps):
`wavvon://{host}/channel/{channel_id}/message/{message_id}`. A channel
permalink is that same path with no `/message/…` tail. The link carries
**only the channel id** — never the breadcrumb path. The path
(`Games / LoL / Alliance / #raid-planning`) is display-only and is
resolved client-side by walking `parent_id` over the channel tree the
client already holds in memory.

### 1.2 What resolution exists today (and what doesn't)

Verified in Wavvon-client:

- `MessageContent.tsx` (`packages/ui`) renders `wavvon://` links as plain
  `<a target="_blank">` anchors. There is **no** in-app click interceptor
  for `wavvon://` links inside message text.
- The desktop deep-link handler (`get_pending_deep_link` /
  `join-hub-requested` in `apps/desktop/src/App.tsx`) routes every
  incoming `wavvon://` URL through `parseHubInput` (`packages/core`).
- `parseHubInput` extracts **only** `{ hubUrl, inviteCode }`. It ignores
  any `/channel/...` or `/message/...` path segment entirely.

So today's message permalinks resolve to nothing beyond "add/open this
hub" even on desktop. The message-id tail is silently dropped. Channel
permalinks therefore need the **same navigation plumbing** message
permalinks are missing — we build it once, for both.

### 1.3 The plumbing (build once, cover both link kinds)

Extend `parseHubInput` in `packages/core/src/parseHubInput.ts` to also
return an optional deep-link target parsed from the path:

```ts
export interface HubInputResult {
  hubUrl: string;
  inviteCode: string;
  target?:
    | { kind: "channel"; channelId: string }
    | { kind: "message"; channelId: string; messageId: string };
}
```

Path grammar after `wavvon://{host}/`:
`channel/{id}` → channel target; `channel/{id}/message/{id}` → message
target; anything else (an invite code) → `inviteCode` as today. This is
backward-compatible: existing callers that read only `hubUrl`/`inviteCode`
are unaffected.

The App-level consumer (`App.tsx` in each app) gains one branch: when a
parsed input has a `target`, after the hub is present in the hub list and
connected, select `target.channelId`; if `kind === "message"`, additionally
call the existing `onScrollToMessage(messageId)` path already wired for
reply-jump in `MessageRow.tsx`. If the hub isn't in the list yet, fall
through to the current add-hub flow and apply the target once the join
completes.

### 1.4 Breadcrumb path resolution

A new pure helper in `packages/core/src/channels.ts` (Wavvon-client):

```ts
export function channelPath(channels: Channel[], id: string): Channel[];
```

Walk `parent_id` from the target up to the root, reversing to get
root→leaf order. Reuses the same `channels` array `buildChannelTree`
already consumes. Returns `[]` if the id is unknown (link points at a
channel the user can't see or that was deleted — see §1.6).

Two consumers:

- **Copy-link affordance**: a "Copy channel link" item in the channel
  context menu (`onChannelContextMenu` in `ChannelSidebar.tsx`) and in the
  channel-header overflow menu. Same clipboard + toast pattern as the
  message "Copy link" button.
- **Breadcrumb header**: when a channel is open, render `channelPath(...)`
  as a breadcrumb (`Games › LoL › Alliance › #raid-planning`) in the
  channel header. Each crumb that is a category is clickable to
  scroll/expand the sidebar to it; the leaf is the current channel. This
  also directly serves the §2 deep-nesting problem (see §2.4).

### 1.5 Cross-hub links

A permalink can point at a hub the user hasn't joined. Resolution order:

1. Hub already in the user's hub list → switch to it, select the channel.
2. Hub not in the list → open the existing add-hub modal pre-filled with
   the host, carry the `target` forward, apply it after join.

No new server round-trip: channel selection is entirely client-side once
the channel list for that hub is loaded (already fetched on hub connect).

### 1.6 Failure modes

- **Unknown/deleted channel id** → `channelPath` returns `[]`; show a
  toast "That channel no longer exists or isn't visible to you" and land
  the user on the hub's default channel. Do not error the whole navigation.
- **Private channel the user can't read** (once §3 lands) → same toast.
  The client does not leak the channel name; the sidebar simply won't
  contain it.

### 1.7 Desktop parity note

Web is the current delivery target. On web, `wavvon://` links inside
message text won't be clickable by the OS — but the copy-link and
breadcrumb affordances work fully, and pasting a `wavvon://` link into the
add-hub field resolves via §1.3. Desktop parity requires the Tauri
deep-link handling already registered for invite links to forward the full
path (it does — `App.tsx` receives the raw URL; only `parseHubInput`
discarded the tail). No new Tauri command is needed; the §1.3 change to
`parseHubInput` is sufficient for desktop too.

---

## 2. Deep-nesting sidebar display

### 2.1 The problem

`ChannelSidebar.tsx` (Wavvon-client, web + desktop) sets
`paddingLeft: n.depth * CHANNEL_INDENT_PX` with `CHANNEL_INDENT_PX = 16`
and no cap (the lines rendering `SortableCategoryItem` /
`SortableChannelItem`). At depth 8 that is 128px of indent inside a
~240px sidebar, leaving almost no room for the channel name. Hubs with
`max_channel_depth = 0` (unlimited, the default) can go arbitrarily deep.

### 2.2 Decision: capped indent + focus-scoped subtree ("drill-in")

Combine two cheap, non-destructive changes:

- **Cap the indent.** Clamp the per-node indent so it never exceeds a
  ceiling regardless of depth: `min(depth, INDENT_CAP) * STEP` plus a small
  overflow marker when `depth > INDENT_CAP`. With `INDENT_CAP = 5`,
  `STEP = 12px` (reduced from 16), the maximum structural indent is 60px.
  Nodes deeper than the cap get a faint leading marker (a `›` or a subtle
  dotted rail) instead of more indent, so depth is still legible without
  consuming width.
- **Drill-in on deep categories.** A category at or beyond a
  configurable depth (`DRILL_DEPTH = 4`) can be *focused*: clicking its
  header (or a small ⤢ affordance) re-roots the sidebar to that subtree.
  The sidebar then shows a **back-crumb** at the top (the §1.4
  `channelPath` of the focused node) and renders only that subtree from
  indent 0. Clicking a crumb pops back up. This is the same mental model
  as a file manager that lets you double-click into a folder.

Both are client-only, layered over the existing recursive render. Drill-in
is a new piece of local component state (`focusedSubtreeId: string | null`)
plus a filter on `flatVisible`; it does not touch the data model, the
drag-drop logic, or any server route.

### 2.3 Why not the alternatives

- **Horizontal scroll** — rejected as the primary strategy: a
  horizontally scrolling sidebar hides channels off-screen with no
  affordance, breaks keyboard navigation flow, and is a known
  accessibility hazard. The capped indent removes the *need* for it.
- **Pure auto-collapse past N levels** — rejected as sole strategy:
  auto-collapsing categories the user explicitly expanded fights the
  user. Collapse stays **user-driven** (the existing
  `collapsedCategories` mechanism); we don't auto-collapse on depth.
- **Breadcrumb-only sidebar** (replace the tree with a single breadcrumb
  path) — rejected: it loses siblings-at-a-glance, which is the whole
  point of a channel sidebar. We use breadcrumbs as the *drill-in* back
  affordance and the channel-header path (§1.4), not as the primary tree.

The chosen combination keeps the familiar tree for shallow hubs (the
common case — most hubs never exceed 2–3 levels), degrades gracefully with
the indent cap for moderately deep hubs, and offers drill-in as an
explicit escape hatch for the rare deeply-nested community without ever
hiding data implicitly.

### 2.4 Interaction with permalinks and breadcrumbs

The §1.4 `channelPath` helper is shared: it powers the drill-in
back-crumb, the channel-header breadcrumb, and permalink resolution. One
tree-walk utility, three surfaces.

### 2.5 Accessibility

- The capped indent keeps `aria-level` accurate (set it to the true
  `depth`, not the clamped value) so screen readers still announce real
  nesting depth even when the visual indent is capped.
- Drill-in sets focus to the first item of the re-rooted subtree and
  announces the focused category name via an `aria-live` region. The
  existing arrow-key navigation (`handleChannelKeyDown`) operates over the
  filtered `flatVisible`, so it keeps working inside a drilled-in subtree.

---

## 3. Channel permission overwrites

### 3.1 What exists today

`hub/src/permissions.rs` (Wavvon-server): `user_permissions(db, pubkey)`
computes a single hub-wide `HashSet<String>` of effective permissions from
`role_permissions` joined through `user_roles`. `UserPermissions::has` /
`require` take **only** a permission string — no channel dimension. Call
sites (`messages.rs`, `channels.rs`, `posts.rs`) do
`perms.require(SEND_MESSAGES)` with no channel argument. `channel_bans`
exists but is an unrelated per-user block, not a permission grant/deny.

There is **no** channel-permission table. This section designs one.

### 3.2 Decision: role-only overwrites, tri-state, with cascade

An overwrite targets a **role** on a **channel** and sets, per permission,
one of: **allow**, **deny**, or **inherit** (the absence of a row =
inherit). We do **not** add per-user overwrites in v1 (see §3.9).

Effective permission for a user on a channel is computed as:

1. Start from the user's hub-wide role permissions (today's
   `user_permissions`).
2. Walk the channel's ancestor chain **root → target** (the §1.4 path).
3. At each channel in the chain, for each role the user holds, apply that
   role's overwrite rows: a `deny` clears the permission, an `allow` sets
   it. Deeper (closer-to-target) rows win over shallower ones — this is
   the file-system cascade: a child explicitly overrides its parent.
4. `admin` is never removed by a channel overwrite (a hub admin can always
   administer any channel; otherwise an admin could lock themselves out of
   a channel they own). Enforced in code, not data.

**Conflict rule within a single channel level** (user has two roles, one
`allow` and one `deny` on the same permission at the same channel):
**allow wins**. Rationale in §3.8.

### 3.3 Data model

Postgres (the hub's live backend — `PgPool`, `BOOLEAN`, `BIGINT`).
`hub/tests/*_flow.rs` also runs against Postgres — `common::create_test_db()`
creates a fresh, isolated Postgres database per test via `PgPoolOptions`
and runs the real migrations against it, so this DDL needs no
SQLite-compatibility caveat. Add to `hub/src/db/migrations.rs`,
additive-only per repo convention (`CREATE TABLE IF NOT EXISTS`):

```sql
-- Channel-scoped role permission overwrites.
-- One row per (channel, role, permission). Absence of a row = inherit.
CREATE TABLE IF NOT EXISTS channel_permission_overwrites (
    channel_id   TEXT    NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role_id      TEXT    NOT NULL REFERENCES roles(id)     ON DELETE CASCADE,
    permission   TEXT    NOT NULL,
    -- TRUE = allow, FALSE = deny. "inherit" is represented by NO ROW.
    allow        BOOLEAN NOT NULL,
    created_at   BIGINT  NOT NULL,
    PRIMARY KEY (channel_id, role_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_cpo_channel
    ON channel_permission_overwrites(channel_id);
```

`ON DELETE CASCADE` on both FKs means deleting a channel or a role cleans
up its overwrites automatically. No `max_channel_depth` interaction — the
cascade walks whatever ancestor chain exists.

### 3.4 Enforcement — new resolver

Add a channel-aware resolver alongside the existing hub-wide one in
`hub/src/permissions.rs` (Wavvon-server):

```rust
pub async fn channel_permissions(
    db: &PgPool,
    public_key: &str,
    channel_id: &str,
) -> Result<UserPermissions, (StatusCode, String)>;
```

Implementation:

1. Call the existing `user_permissions` for the hub-wide baseline and the
   user's role id set.
2. Load the channel's ancestor chain (root → target) via a recursive
   `parent_id` walk (a `WITH RECURSIVE` CTE, or an iterative fetch — the
   chain is short and cacheable per request).
3. Load `channel_permission_overwrites` rows for those channels ∩ the
   user's roles in one query (`WHERE channel_id = ANY($chain) AND role_id
   = ANY($roles)`).
4. Fold them into the baseline `effective` set in root→target order,
   applying the §3.2 conflict + admin-immunity rules.
5. Return a `UserPermissions` with the channel-adjusted `effective` set;
   `has` / `require` are unchanged, so **call sites change by one
   argument, not by shape.**

Call sites that gate a **channel action** switch from
`user_permissions(db, pk)` to `channel_permissions(db, pk, channel_id)`:

- `messages.rs`: `SEND_MESSAGES`, and message read (see §3.5).
- `posts.rs`: `CREATE_POSTS`, `MANAGE_POSTS`.
- `channels.rs`: `MANAGE_CHANNELS` when acting on a specific channel.
- Voice join (the talk-power gate lives here too — a channel `deny` on a
  voice permission means "can't join voice in this channel").

Hub-wide admin routes (role management, hub settings) keep using the plain
`user_permissions` — they have no channel dimension.

### 3.5 Read gating and the sidebar

`READ_MESSAGES` becomes channel-scoped. A user without effective
`READ_MESSAGES` on a channel:

- Does not receive that channel in the channel-list response (the list
  endpoint filters by `channel_permissions` per channel).
- Is rejected (403) if they call the message-history or WS-subscribe path
  for it directly.

Because the sidebar renders whatever the server returns, a hidden channel
simply never appears client-side — no client-side secret-keeping needed.
A category whose children are all hidden is itself hidden (empty-container
suppression, computed client-side over the filtered list).

**Performance note:** filtering the channel list per request means running
the §3.4 fold for each channel. Channel counts are small (tens, not
thousands) and the overwrite table is typically empty; the one-query batch
load in §3.4 step 3 keeps this to two queries total per list fetch. If a
hub ever has enough channels for this to matter, cache the resolved set per
(user, hub-role-version) — deferred (§3.9).

### 3.6 Admin routes

Under `/channels/:channel_id/permissions`. Auth: `MANAGE_ROLES` on that
channel (itself resolved through `channel_permissions`, so a role granted
`MANAGE_ROLES` on a subtree can manage overwrites within it).

| Method | Path | Description |
|---|---|---|
| `GET` | `/channels/:id/permissions` | List all overwrite rows for the channel, grouped by role. Includes the **resolved effective** set per role (baseline + ancestor cascade) so the UI can show "inherited" vs "explicit". |
| `PUT` | `/channels/:id/permissions/:role_id` | Replace the overwrite set for one role on this channel atomically. Body: `{ allow: [perm…], deny: [perm…] }`; anything omitted = inherit (row deleted). |
| `DELETE` | `/channels/:id/permissions/:role_id` | Clear all overwrites for that role on the channel (full inherit). |

No per-permission endpoints — the `PUT` replaces the whole role×channel
set atomically, matching the outgoing-webhooks subscription-set pattern and
avoiding partial-update races.

Every mutation writes a `hub_audit_log` entry
(`channel.permission_overwrite.set` / `.cleared`) with channel id, role id,
and the diff.

### 3.7 Client — admin UI

**Web (primary), desktop/Android parity** — a "Permissions" tab in the
channel settings panel (`onOpenChannelSettings` already exists in
`ChannelSidebar.tsx`):

- Role picker on the left; per-permission tri-state control on the right
  (Inherit / Allow / Deny), one row per permission constant from
  `permissions.rs`.
- Each row shows the **inherited** value (resolved from ancestors, from the
  `GET` response) as ghost text when the control is on "Inherit", so the
  admin sees the effective result. When a row is set to Allow/Deny that
  differs from the inherited value, mark it visually (a dot / accent) —
  this is the "clear UI affordance for an override" the original gap asked
  for.
- Save calls the `PUT` for the edited role; a "Reset to inherit" clears it
  via `DELETE`.

The web client's hub-admin command module gains three route functions
mirroring §3.6. No new Tauri command (all HTTP). The platform adapter
(`apps/web/src/platform/`) gets the same three functions so web/Android
stay in sync per the adapter contract.

### 3.8 Why "allow wins" on same-level conflict

When a user holds two roles that disagree on the same permission at the
same channel, allow wins. The alternative (deny wins) is the stricter,
"security-first" default used by some systems. We choose allow-wins:

- Wavvon roles are **additive** hub-wide already (a user's effective set is
  the union of their roles' permissions — `fetch_permissions` does
  `SELECT DISTINCT ... WHERE role_id IN (...)`). Making channel overwrites
  deny-wins would make the two layers behave oppositely, which is
  surprising.
- Deny-wins makes a single misconfigured deny on a broad role silently
  override a narrowly-granted allow, which is the harder-to-debug failure.
- Cross-*level* precedence (child over parent) is unaffected — a deeper
  `deny` still overrides a shallower `allow`, preserving the file-system
  cascade. Allow-wins applies **only** within the same channel level.

### 3.9 What's deferred

- **Per-user channel overwrites** — "give this one person access to this
  one channel." The table can gain a nullable `user_public_key` column
  later (additive) with user-overwrites taking precedence over
  role-overwrites at the same level. Not in v1: it doubles the resolver's
  complexity and the sovereign-hub model leans on roles.
- **Resolved-permission caching** — see §3.5. Add only if a real hub hits
  the channel-count where per-request folding shows up in profiling.
- **Overwrite templates / "sync to category"** — copying a category's
  overwrites down to new children on create. Convenient but a follow-on;
  v1 requires explicit per-channel setup.
- **Cross-hub / alliance-shared channel overwrites** — alliance channels
  are hosted on the owning hub; overwrites are that hub's. No federation of
  the overwrite table.

---

## Decisions

- **Permalink carries the channel id only, path resolved client-side.**
  Alternative: embed the human path (`Games/LoL/...`) in the link.
  Rejected — the path is derived state that changes when an admin renames
  or re-parents a category; a stored path would rot, and the tree is
  already in client memory so recomputing is free. The id is the only
  durable anchor. Matches the message-permalink scheme already shipped, so
  both link kinds share one resolver.

- **Build the missing deep-link navigation once, for both link kinds.**
  Research found message permalinks don't actually resolve their
  `/message/…` tail today — `parseHubInput` discards it. Rather than invent
  a channel-only mechanism, we extend `parseHubInput` to parse a `target`
  and add one App-level consumer branch, fixing message-permalink
  navigation as a side effect. One mechanism, not two.

- **Capped indent + drill-in over horizontal scroll or auto-collapse.**
  Horizontal scroll hides data with no affordance and breaks keyboard
  flow; auto-collapse fights the user's explicit expansions;
  breadcrumb-only loses sibling visibility. Capped indent handles the
  common and moderate cases with zero interaction cost; drill-in is an
  explicit, reversible escape hatch for the rare deep hub. All client-only,
  no data-model or API change.

- **Role-only channel overwrites, not per-role-and-per-user.** The
  original Nested Channels rule only specified "cascade like a file
  system," not the granularity. A full Discord-style matrix (per-role AND
  per-user, tri-state on every permission) is maximal flexibility at a real
  cost: a two-dimensional resolver, a UI that overwhelms sovereign-hub
  operators, and a permission surface most hubs never use. Wavvon's stated
  bias is sovereign-hub simplicity over maximal generality
  ([decisions.md](decisions.md), [moderation-enhancements.md](moderation-enhancements.md)).
  Role-only covers the actual use cases (a private staff category, a
  read-only announcements channel, a per-team subtree) while keeping the
  resolver one-dimensional and the UI a single role×permission grid. The
  table is forward-compatible: a nullable `user_public_key` column adds
  per-user overwrites later without a rewrite.

- **Tri-state (allow / deny / inherit-as-absent-row) with child-over-parent
  cascade.** Storing "inherit" as the absence of a row (rather than a third
  enum value) keeps the table sparse — the common case is no overwrite —
  and makes the fold trivial: only present rows change the baseline.
  Child-over-parent precedence is the file-system model the original design
  named.

- **Allow-wins on same-level conflict.** Consistent with Wavvon's additive
  role union hub-wide; deny-wins would make the two layers behave
  oppositely and let a broad role's stray deny silently mask a narrow
  allow. Cross-level (child over parent) precedence is unchanged.

- **`admin` is immune to channel deny.** Enforced in the resolver, not the
  data. Prevents an admin from being locked out of a channel by an
  overwrite — the sovereign-operator escape hatch.

- **Read-gating filters the channel list server-side.** The client shows
  whatever the server returns, so hidden channels never reach the client —
  no client-side secret-keeping, and the existing recursive sidebar render
  needs no permission logic.
