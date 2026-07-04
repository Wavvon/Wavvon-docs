# Join-to-Create Temporary Voice Channels

A channel can be flagged as a **spawner**: joining its voice creates a
fresh personal room next to it, moves the joiner in, and the room
garbage-collects itself when it has been empty for a grace period. How
large communities avoid a wall of twenty static voice channels.

**Status: designed, not implemented.** ROADMAP wishlist item.

---

## 1. Data model (additive)

```sql
ALTER TABLE channels ADD COLUMN is_temporary BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE channels ADD COLUMN owner_pubkey TEXT;         -- temp channels only
ALTER TABLE channels ADD COLUMN spawner_name_template TEXT; -- spawners only
ALTER TABLE channels ADD COLUMN empty_since BIGINT;         -- temp GC bookkeeping
```

- **Spawner** = `channel_type = 'spawner'` (the discriminant column
  already exists: `text` / `forum` / `spawner`). A spawner holds no
  messages and no voice of its own; it renders in the sidebar with a
  `+`-style affordance.
- **Temp channel** = a completely normal unified text+voice channel
  with `is_temporary = TRUE` and `owner_pubkey` set. Everything
  existing (voice relay, messages, permission cascade) works on it
  unchanged.

## 2. Spawn flow

On a voice-join request for a spawner channel (the WS voice-join
handler, which since channel permission overwrites resolves
channel-scoped permissions):

1. Gate on effective `read_messages` on the **spawner** (same gate as
   any voice join).
2. Create a sibling channel (`parent_id` = spawner's parent,
   `display_order` = after the spawner): name from
   `spawner_name_template` (default `"{user}'s room"`, `{user}` =
   display name); `channels.name` is UNIQUE, so on collision append
   ` 2`, ` 3`, … (bounded retry).
3. Set `is_temporary`, `owner_pubkey` = joiner, `created_by` = joiner.
4. Proceed with the normal voice-join against the new channel — the
   existing `VoiceJoined { channel_id, … }` response already carries
   the channel id, so the client lands in the new room with no new
   message type.
5. Broadcast `channel_list_changed` (§4).

Permissions on the temp room need no special handling: it sits under
the spawner's parent, so the **ancestor cascade applies automatically**
(a members-only category spawns members-only rooms). Depth: the room is
a sibling of the spawner, same depth — never violates
`max_channel_depth`.

## 3. Ownership and GC

- **Owner powers, v1: rename only.** `update_channel` allows name
  changes when `is_temporary AND owner_pubkey = caller` (in addition to
  the existing `MANAGE_CHANNELS` path). No user caps, no owner
  transfer, no kick — per-user room admin waits for per-user overwrites
  ([nested-channels-ux.md](nested-channels-ux.md) §3.9).
- **GC**: when the last participant leaves (the existing `leave_voice`
  path knows the roster), stamp `empty_since = now`. A
  `temp_channel_worker` (existing worker pattern) sweeps every 30s and
  deletes temp channels with `empty_since` older than **60s** — the
  grace period absorbs reconnects and "oops, wrong room" rejoins. A
  join clears `empty_since`.
- **Boot sweep**: on startup the voice roster is empty by definition,
  so the worker's first pass stamps any temp channel without
  `empty_since`, and they age out through the same 60s path — one code
  path, no special boot logic.
- Deleting the channel cascades its messages and permission overwrites
  (existing FK behavior). **Text in a temp room is ephemeral** — this
  is a feature (scratch space), stated in the UI hint.

## 4. Channel-list-changed WS signal

> **Implemented 2026-07-04 (hub `3005fc5`) — reused the existing
> `channels_updated` event, NOT a new `channel_list_changed`.** The
> codebase already had a hub-wide, payload-free `{"type":
> "channels_updated"}` fired on channel create/update/reorder/delete;
> the temp-voice work reused it for spawn/GC rather than add a second
> overlapping event. The design intent below stands; only the name
> differs. Clients listen for `channels_updated`.

Today there is no WS signal for channel create/delete/move at all —
admins' structural edits only appear to others on refetch. Temp
channels make this unacceptable (rooms appear and vanish constantly),
so this design adds the missing event:

```json
{ "type": "channels_updated" }
```

Deliberately **payload-free**: clients respond by refetching the
channel list, which is already read-gated server-side per §3.5 — so no
channel data is ever pushed to users who aren't allowed to see it, and
there's exactly one code path (the filtered list endpoint) deciding
visibility. Broadcast on: temp spawn, temp GC, and — for free —
regular channel create/update/delete/move. Fixes the stale-sidebar
problem generally.

## 5. Admin surface

Channel-settings for a spawner: `channel_type = 'spawner'` selectable
at creation (Create Channel modal gains the type the same way `forum`
was added), plus a "Name template" field. Sidebar renders spawners
with a distinct icon and no unread/message affordances. Temp rooms
render as normal channels with a small "temporary" badge and the
owner's name in the tooltip.

## 6. Deferred

- **Owner user-cap / kick / transfer** — needs per-user overwrites or
  a dedicated room-moderation mechanism; rename-only covers v1.
- **Persistent "keep this room"** (owner promotes temp → permanent) —
  cheap later (`is_temporary = FALSE` + `MANAGE_CHANNELS` check), out
  of v1 to keep the GC story simple.
- **Spawner templates beyond name** (pre-set overwrites, talk power) —
  inherit-from-parent covers the real cases so far.

---

## Decisions

- **Temp rooms are ordinary channels + two columns, not a new
  subsystem.** Voice relay, messages, cascade, read-gating all apply
  unchanged; the only new machinery is spawn-on-join and a GC worker.
- **Spawn as a sibling, not a child, of the spawner.** Keeps the
  spawner a leaf (no container/leaf blurring), inherits the same
  parent cascade, and can never violate the depth cap.
- **60s empty-grace GC via a sweep worker, not instant delete.**
  Instant deletion destroys rooms on voice reconnects; the stamped
  `empty_since` + sweep also gives boot cleanup the same code path.
- **Payload-free `channel_list_changed`.** Pushing channel objects
  would need per-recipient permission filtering in the WS layer — a
  second visibility code path to keep correct. A refetch hits the one
  already-gated endpoint. Channel lists are small; the cost is noise-
  level.
- **Rename is the only owner power in v1.** Anything more re-opens the
  per-user-permissions question that §3.9 deliberately deferred.
