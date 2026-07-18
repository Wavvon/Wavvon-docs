# Events — baseline, role-slot sign-ups, reminders

Canonical doc for hub events. The baseline (events + plain RSVP)
shipped earlier without a design doc; this doc records it and designs
the guild delta: **role-slot sign-ups**, **reminders**, and a
**calendar view**.

**Status: baseline + role-slot sign-ups + reminders SHIPPED
server-side** (hub `825b0da`, 2026-07-04); **web UI for slots +
reminders SHIPPED** (clients, 2026-07-04, see §2's implementation note
below); **calendar view DESIGNED, not implemented** (client-only,
lowest priority — see §4). Desktop/Android UI for slots + reminders is
queued next; see ROADMAP.

**Guild-scale delta DESIGNED, not implemented (2026-07-18):**
**hub-level events** (§5), **propagation to sub-channels** (§6), and
**slot-based participant marshalling / voice-move** (§7 — the
centerpiece). The voice-move consent model + voice-only presence grant
are also recorded in [decisions.md](decisions.md).

---

## 1. Shipped baseline

- Tables: `hub_events` (id, channel_id → `channels`, creator_pubkey,
  title, description, starts_at, ends_at, location, created_at) and
  `event_rsvps` (event_id CASCADE, user_pubkey, status ∈
  going/maybe/not_going, PK (event_id, user_pubkey)).
- Routes (`hub/src/routes/events.rs`): create/update/delete/get/list
  (+ `upcoming`/`limit` params), `POST /events/:id/rsvp`,
  `GET /events/:id/rsvps`. Creation requires `CREATE_EVENTS` and posts
  an **event card** system message into the event's channel
  (`post_event_card`), which is how members learn about it via the
  normal message/WS push path.
- Clients: `EventsPanel.tsx`, `EventCard.tsx`, `EventComposer.tsx`
  (web; desktop/android have parallel copies).

> **Known gap — FIXED 2026-07-04 (hub `efbf17b`)**: the events routes
> were not switched to channel-scoped permission resolution when
> channel permission overwrites shipped
> ([nested-channels-ux.md](nested-channels-ux.md) §3) — `create_event`
> checked hub-wide `CREATE_EVENTS` + channel existence only, and
> `list_events` wasn't read-gated, so event titles in channels hidden
> from a user still appeared in the event list. `create_event` now
> resolves `channel_permissions(..., channel_id)` for `CREATE_EVENTS`,
> `list_events` filters by `channels_with_permission(READ_MESSAGES)`,
> and `get_event` 404s (not 403) when the caller can't read the
> channel, so an event id alone can't confirm a hidden channel's
> existence. The slot/reminder routes below build on this gated shape.

## 2. Role-slot sign-ups

A raid needs "which roles are covered", not "how many are coming".
An event may define **slots**: named sign-up buckets with optional
capacity (tank ×2, healer ×4, DPS ×10; capacity NULL = unlimited,
covering free-form buckets like "bench").

### Data model (additive)

```sql
CREATE TABLE IF NOT EXISTS event_slots (
    id         TEXT   PRIMARY KEY,
    event_id   TEXT   NOT NULL REFERENCES hub_events(id) ON DELETE CASCADE,
    name       TEXT   NOT NULL,
    capacity   BIGINT,            -- NULL = unlimited
    position   BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
);

ALTER TABLE event_rsvps ADD COLUMN slot_id TEXT
    REFERENCES event_slots(id) ON DELETE SET NULL;
```

An RSVP may carry a slot claim: `status='going'` + `slot_id`. The
existing `(event_id, user_pubkey)` PK already enforces one
RSVP-and-slot per user per event — switching slots is an upsert, same
as switching status today. `ON DELETE SET NULL`: deleting a slot
demotes its claimants to plain "going", never deletes their RSVP.

### API (extends existing routes)

- `CreateEventRequest` gains `slots: [{name, capacity?}]` (optional;
  order = `position`).
- Slot management on an existing event (creator or `CREATE_EVENTS`
  holder — same rule as event update today):
  - `POST /events/:id/slots` `{name, capacity?}` — add.
  - `PATCH /events/:id/slots/:slot_id` `{name?, capacity?}` — rename /
    resize; capacity may not drop below current claim count (400).
  - `DELETE /events/:id/slots/:slot_id` — only if unclaimed (409
    otherwise; demote-first is a deliberate two-step so claimants are
    never silently dropped).
- `POST /events/:id/rsvp` gains optional `slot_id`. Claiming a full
  slot → 409 with the slot's current count. Capacity check runs in a
  transaction (count claims `FOR UPDATE`) so two simultaneous claims
  can't oversubscribe.
- `EventWithRsvps` responses gain
  `slots: [{id, name, capacity, position, claimed, claimants: [pubkey…]}]`
  (claimants are public to viewers, same as `GET /events/:id/rsvps`
  today).

### Client (web)

`EventCard.tsx` renders slot rows with fill state (`3/4 Healers`) and
a claim/unclaim button per row; `EventComposer.tsx` gains a slot
editor (add row: name + capacity). Claimed slot shows your name
highlighted. No new component files needed unless EventCard outgrows
the ~200-line convention — then extract `EventSlotList.tsx`.

> **Implementation note (2026-07-04, hub `825b0da`)**: slot management
> (`POST`/`PATCH`/`DELETE /events/:id/slots...`) authorizes on "event
> creator OR `CREATE_EVENTS` resolved through the event's channel via
> `channel_permissions`" — a channel-scoped check, deliberately
> narrower than the hub-wide `ADMIN` check `update_event`/
> `delete_event` still use today for the base event fields. This
> matches this doc's original wording ("creator or `CREATE_EVENTS`
> holder") rather than the current event-update code path; reconciling
> `update_event`/`delete_event` to the same channel-scoped check is a
> reasonable follow-up but out of scope here.
>
> **Implementation note (2026-07-04, clients `dea0df0`)**: web UI shipped.
> `EventComposer.tsx` gained a slot editor (name + optional capacity
> rows) and a reminder offset picker (Off/15m/1h/24h), both folded into
> the `POST /events` payload. `EventCard.tsx` renders the reminder
> read-only and delegates slot rows to a new `EventSlotList.tsx`
> (claim/unclaim via `POST /events/:id/rsvp` with/without `slot_id`,
> claimed slot bolded, claimants shown by short pubkey, 409/404 errors
> surfaced inline). `createEventSlot`/`updateEventSlot`/
> `deleteEventSlot` were added to `@platform` for the
> `POST`/`PATCH`/`DELETE /events/:id/slots...` routes but aren't wired
> to any UI yet — no post-creation slot-management surface exists
> (composer is create-time only); that's the natural next follow-up.
> Desktop/Android UI is not yet built — still server + web shapes only.

**Exact shapes shipped:**

```jsonc
// Slot object (POST/PATCH /events/:id/slots response; also each entry
// of EventWithRsvps.slots)
{
  "id": "uuid",
  "name": "Tank",
  "capacity": 2,           // or null = unlimited
  "position": 0,
  "claimed": 1,
  "claimants": ["<pubkey hex>", "..."]
}

// CreateEventRequest.slots (optional; order = position)
{ "slots": [{ "name": "Tank", "capacity": 2 }, { "name": "Bench" }] }

// POST /events/:id/slots request body
{ "name": "Healer", "capacity": 4 }

// PATCH /events/:id/slots/:slot_id request body (tri-state capacity:
// absent = don't touch, null = clear/unlimited, number = resize)
{ "name": "Healer (resized)", "capacity": 6 }

// POST /events/:id/rsvp request body
{ "status": "going", "slot_id": "uuid-or-omitted" }
```

`EventWithRsvps` (GET /events, GET /events/:id) gains `slots: [...]`
alongside the existing flattened event fields and `rsvp_counts`.

## 3. Reminders

One reminder per event, a fixed offset before start.

- `ALTER TABLE hub_events ADD COLUMN reminder_minutes BIGINT` (NULL =
  no reminder) and `ADD COLUMN reminder_sent_at BIGINT` (NULL = not
  yet sent). Composer offers Off / 15m / 1h / 24h.
- New `event_reminder_worker.rs`, following the existing worker
  pattern (`dm_worker.rs`, `banlist_worker.rs`): tick every 60s,
  select events where `reminder_minutes IS NOT NULL AND
  reminder_sent_at IS NULL AND starts_at - reminder_minutes*60 <= now
  AND starts_at > now`, post a reminder card into the event's channel
  via the existing `post_event_card` path (with a "starts in N
  minutes" variant), set `reminder_sent_at`. Idempotent across
  restarts by construction; an event edited to a later start with the
  reminder already sent keeps `reminder_sent_at` (no re-send in v1 —
  documented composer behavior: clearing and re-picking the reminder
  offset resets it).
- **Channel-message reminders, not per-user notifications** — the
  reminder reaches exactly the people who can read the channel
  (read-gating applies automatically), needs zero new push
  infrastructure, and lands in history for whoever was offline.
  Per-user pings for slot claimants ("your raid starts in 15m") are
  deferred until a personal notification system exists (see §8).

> **Implementation note (2026-07-04, hub `825b0da`)**: shipped as
> `reminder_worker.rs` (not `event_reminder_worker.rs` — matches the
> other worker module names, all of which drop the `event`/`hub`
> prefix already implied by the crate). `CreateEventRequest`/
> `UpdateEventRequest` both accept `reminder_minutes` (nullable);
> `UpdateEventRequest` uses the existing tri-state
> absent/null/value convention (see `UpdateChannelRequest` in
> `chat_models.rs`) so a composer can explicitly clear the reminder.
> Any `PUT /events/:id` call that includes `reminder_minutes` at all
> (even re-sending the same value) resets `reminder_sent_at` to NULL —
> slightly broader than "an event edited to a later start... keeps
> `reminder_sent_at`" above, which still holds for edits that don't
> touch `reminder_minutes` (e.g. `starts_at`-only edits never touch
> `reminder_sent_at`).

## 4. Calendar view

Client-only: a month/week toggle in `EventsPanel.tsx` rendering the
already-fetched event list on a grid, timezone-localized like the
existing list. No server change. Lowest priority of the three — ship
slots + reminders first.

## 5. Hub-level events

An event that belongs to the whole community, not one channel — a
community anniversary, a hub-wide town hall. Every member sees it in the
event list regardless of which channels they can read.

`hub_events.channel_id` is `NOT NULL` and must stay that way (the schema
baseline and every existing query depend on it). So a hub-wide event is
**not** channel-less; it is an ordinary event with an additive
`hub_wide` flag whose card/reminder still anchor to a real channel
chosen at creation — the natural default is an announcements or banner
channel every member can read.

### Data model (additive)

```sql
ALTER TABLE hub_events ADD COLUMN hub_wide BOOLEAN NOT NULL DEFAULT FALSE;
```

### Semantics

- The card and reminder card post into the anchor `channel_id` exactly
  as today (`post_event_card` / the reminder worker are untouched). Point
  the anchor at a channel everyone reads and the "everyone learns about
  it" property falls out of the existing message path — no new push.
- **`list_events` skips channel read-gating for hub-wide events.** Today
  it drops any event whose anchor channel the caller lacks `READ_MESSAGES`
  on (`channels_with_permission(READ_MESSAGES)` filter,
  `events.rs:541`). A `hub_wide` event is included **regardless** of that
  filter — every member sees it. Non-hub-wide events keep the existing
  gate.
- **`get_event` must not 404 a hub-wide event** on an unreadable anchor
  channel. Today it 404s when the caller can't read the channel
  (`events.rs:586`, the deliberate "an id can't confirm a hidden channel"
  posture). For `hub_wide` events that posture doesn't apply — the event
  is public to the hub by construction — so the read-gate check is
  bypassed when `hub_wide` is true.

### API

- `CreateEventRequest` gains `hub_wide: bool` (`#[serde(default)]` =
  false, so existing callers are unaffected). `EventResponse` gains
  `hub_wide` (flattened into `EventWithRsvps` like the other event
  fields).
- **Permission:** setting `hub_wide = true` requires **hub-level**
  `CREATE_EVENTS` — the plain hub-wide `user_permissions` check, not the
  channel-scoped one — *in addition to* the existing channel-scoped
  `CREATE_EVENTS` gate on the anchor channel. Rationale: a hub-wide
  announcement is a hub-wide authority; a member who only holds
  `CREATE_EVENTS` inside one sub-tree (via a channel overwrite) should
  not be able to post to the whole hub. A `hub_wide = false` event is
  unchanged (channel-scoped gate only).
- `update_event` may not flip `hub_wide` in v1 (the flag is create-time
  only) — keeps the reminder/card anchor stable. Deferred if a real need
  appears.

### Client (web)

`EventComposer.tsx` gains an **Event scope** control: *This channel* /
*Whole hub*. The *Whole hub* option is shown only when the client holds
hub-level `CREATE_EVENTS`; picking it sets `hub_wide` and keeps the
channel picker (now labelled "Announcement channel", defaulting to the
hub's announcements/banner channel). `EventCard.tsx` renders a small
"Hub-wide" badge. No new component files.

## 6. Event propagation to sub-channels

A raid organizer posts an event in `#raid-planning` but wants every
squad sub-channel to see the card too. Propagation fans the
**announcement cards** out to descendant channels while the event stays
**one row** — only cosmetic cards duplicate, never event state.

### Data model (additive)

```sql
ALTER TABLE hub_events ADD COLUMN propagate_to_children BOOLEAN NOT NULL DEFAULT FALSE;
```

### Semantics

- When `propagate_to_children` is true, `post_event_card` (and the
  reminder worker's card) posts the card into the anchor channel **and
  into every descendant** of the anchor in the `channels` tree (walk
  `parent_id` downward; reuse the same recursion `channels.rs` already
  uses, depth-capped identically). One event row; N cards.
- **Read-gating falls out for free — verified.** The cards are ordinary
  channel messages. A member sees a descendant's card only if they can
  read that descendant, because message history and the live WS push are
  already read-gated per channel (`channels_with_permission` /
  `channel_permissions` on the message and subscribe paths,
  nested-channels-ux.md §3.5). Propagation posts to *every* descendant;
  visibility is decided by the existing per-channel gate at delivery, so
  no propagation-specific permission logic is needed. A descendant hidden
  from a user simply never delivers its copy to them.
- RSVP / slot state is unaffected: the cards are pointers back to the one
  event; claiming/among them all resolves to the same `hub_events` row.
- Deleting the event deletes the event row; the already-posted cards are
  ordinary messages and are **not** retroactively deleted (same as the
  reminder card today — cards are history, not live state). Documented in
  the composer hint.

### Interaction with hub-wide (§5)

`hub_wide` and `propagate_to_children` are independent flags and may
combine: a hub-wide anniversary that also drops a card into every
sub-channel. `hub_wide` changes **list/get visibility of the event**;
`propagate_to_children` changes **where cards post**. Neither touches the
other's code path.

### API / client

- `CreateEventRequest` gains `propagate_to_children: bool`
  (`#[serde(default)]` = false). `EventResponse` carries it back.
- Same create-time permission as the base event (channel-scoped
  `CREATE_EVENTS` on the anchor) — propagation posts cards downward into
  the anchor's own subtree, which the creator already administers if they
  can create there; no extra grant. (Descendant read-gating still filters
  who *sees* each card.)
- `EventComposer.tsx` gains a "Also post in sub-channels" checkbox, shown
  only when the anchor channel has descendants.

## 7. Slot-based participant marshalling (voice-move)

The centerpiece. The raid organizer's problem: an event has slots
(Tank ×3, DPS ×8) with claimants, and at event time the claimants must be
**distributed across voice channels** — tanks split into squad rooms,
DPS mixed by class — while leaders coordinate over the existing whisper
system. This section designs the primitive that makes that possible
(**move a voice participant into another channel**) and the staging
surface built on top of it.

(This would normally live in its own `event-staging.md` per the
~200-line convention; it is kept here inline because it is one feature
family with §2's slots. Split it out if events.md is next touched.)

The three phases are independent enough to build separately: **Phase 1**
is the generic move primitive with a right-click surface (no events).
**Phase 2** is the staging panel + queued assignments + voice-only
presence. **Phase 3** is optional auto-spawned squad channels. The
voice-move consent model + voice-only presence grant are recorded in
[decisions.md](decisions.md).

### 7.1 The move primitive (Phase 1)

Voice join is **always client-initiated** on both transports — desktop
sends UDP after a `voice_join` WS handshake, web opens a `/voice/ws`
relay socket. Neither can be "yanked" server-side. So a move is: the hub
**asks** the target's client to leave its current channel and join a new
one; the client runs its normal leave-and-join. One mechanism works
identically for UDP and WS because both already leave-and-join
client-side.

**New permission.** Add `MOVE_MEMBERS = "move_members"` to
`hub/src/permissions.rs` `ALL_PERMISSIONS` (Wavvon-server). Additive
constant only — `role_permissions` stores permission strings, so no
migration. Resolved **channel-scoped against the destination** channel
(`channel_permissions(mover, dest)`), so a role granted move rights only
within a sub-tree can't fling members into unrelated channels.

**Client → hub: request a move.** New `WsClientMessage` variant (mirrors
the whisper control messages `voice_whisper_start`/`_stop` in
`chat_models.rs`):

```jsonc
// client → hub
{ "type": "voice_move",
  "target_pubkey": "<hex>",
  "target_channel_id": "<uuid>",
  "event_id": "<uuid-or-omitted>" }   // present when driven by a staging panel
```

Hub handling (new handler beside `handle_voice_whisper_start` in
`routes/ws/handlers/voice.rs`, Wavvon-server):

1. Authorize the **mover**: `channel_permissions(mover, target_channel_id)`
   must hold `MOVE_MEMBERS`, else a `voice_join`-style `Error`.
2. Resolve the target's current voice channel (mover-facing UX only; the
   move works even if the target is not in voice — §7.3).
3. Target **in voice now** → push the `voice_move` server message. Target
   **not in voice** and `event_id` present → persist a **queued
   assignment** (§7.3) instead.
4. If the target can't read `target_channel_id`, record a **voice-only
   presence grant** (§7.4) so their imminent join passes the read gate.

**Hub → target: the push.** New `ChatEvent` variant delivered
**targeted-by-pubkey**, exactly like `WhisperSignal` (returns `""` from
`channel_id()` so the channel-subscription filter never matches; the WS
dispatch loop filters on the target pubkey — `connection.rs:274` is the
`WhisperSignal` precedent):

```jsonc
// hub → target client (WsServerMessage "voice_move")
{ "type": "voice_move",
  "target_channel_id": "<uuid>",
  "target_channel_name": "Squad Alpha",   // so a voice-only target can label voice
  "source_channel_id": "<uuid-or-null>",  // where they were (escape hatch)
  "event_id": "<uuid-or-null>",
  "auto": true }                          // consent decision, §7.2
```

`target_channel_name` is included because a voice-only-presence target
(§7.4) does **not** have the channel in its read-gated channel list, so
the client has no other way to label the voice UI. The target client, on
receipt: `auto: true` → immediately run the normal voice leave-and-join
to `target_channel_id`; else prompt (§7.2). No new voice transport code —
it calls the same join path the join button uses.

**Phase 1 client surface (no events).** Right-click a voice participant
in the roster → **"Move to channel…"** → channel picker (voice channels
the mover can see). Sends `voice_move` with no `event_id`. Gated in the
UI on the mover holding `move_members` (server re-checks). This is the
entire Phase 1 deliverable — a generic moderator primitive that ships
before any staging UI. Web first; desktop parity is trivial (identical
client-initiated join).

### 7.2 Consent model

Recorded as a [decisions.md](decisions.md) entry. Summary:

- **Auto-accept (`auto: true`)** when the target has **claimed a slot or
  RSVP'd "going"** on `event_id`. Claiming a slot is opting into being
  organized; a modal per member would defeat bulk marshalling. The client
  still shows a **toast** with a **"Rejoin previous channel?"** escape
  hatch (uses `source_channel_id`), so a misplaced member self-corrects
  in one click.
- **Prompt (`auto: false`)** for a move with **no event context** (Phase
  1 right-click) or when the target has **not** claimed/RSVP'd the event.
  Modal: "*\<mover\> wants to move you to \<channel\>.*" Accept / Decline;
  Decline is a server no-op (no forced state).

The hub sets `auto` by checking `event_rsvps` for a `going` row (or slot
claim) by `target_pubkey` on `event_id`. No `event_id` ⇒ `auto: false`.

### 7.3 Queued assignments (target not in voice)

Ruling: a move issued to a member **not currently in voice** is queued
and auto-applied when they join the event's voice.

**Storage (additive):**

```sql
CREATE TABLE IF NOT EXISTS event_move_assignments (
    event_id           TEXT   NOT NULL REFERENCES hub_events(id) ON DELETE CASCADE,
    user_pubkey        TEXT   NOT NULL,
    target_channel_id  TEXT   NOT NULL REFERENCES channels(id)   ON DELETE CASCADE,
    assigned_by        TEXT   NOT NULL,
    created_at         BIGINT NOT NULL,
    PRIMARY KEY (event_id, user_pubkey)
);
```

- **Idempotency:** the `(event_id, user_pubkey)` PK makes re-issuing an
  `UPSERT` that overwrites `target_channel_id` — latest assignment wins
  ("re-issuing overwrites"). Same shape as the `event_rsvps` PK.
- **Expiry:** assignments **die with the event** (`ON DELETE CASCADE`)
  and are pruned at **event end** — the reminder worker's sweep gains one
  `DELETE FROM event_move_assignments WHERE event_id IN (SELECT id FROM
  hub_events WHERE ends_at IS NOT NULL AND ends_at < now)` pass (or a
  dedicated 60s tick if the reminder worker shouldn't grow). An event
  with no `ends_at` keeps assignments until the event is deleted.

**Application trigger.** The target's voice-join handler (both
`voice.rs::handle_voice_join` and `voice_ws.rs`) gains a check after a
successful join: is there a pending `event_move_assignments` row for this
user whose `target_channel_id != joined_channel`? If so, the hub pushes a
`voice_move` (§7.1) for that assignment. Because the user claimed/RSVP'd
(that's why an assignment exists), the push is `auto: true` and the
client immediately re-joins the assigned channel. The row is **not**
deleted on application — it stays until event end/delete, so a
reconnect during the event re-applies it (a member who drops and rejoins
lands back in their squad). "The event's voice" = joining **any** voice
channel while a pending assignment exists for an active event; the
assignment's own `target_channel_id` is the destination.

This reuses the reassign-on-join seam the spawner path already uses
(`voice.rs:107` reassigns `channel_id`), except here a second
`voice_move` round-trip is preferred over in-place reassignment so the
single consented mechanism handles both live and queued moves.

### 7.4 Voice-only presence (target can't read the destination)

Ruling: a member moved into a channel they **can't read** is still moved
— they get **voice-only presence**. They appear in the voice roster, can
speak/hear, see themselves among the participants and the channel's
**name**, but gain **no** `READ_MESSAGES`: no text history, no message
stream, no sidebar text entry. The organizer's move **is** the
authorization — a deliberately narrower reveal than the
"404-hides-hidden-channels" posture in §1's read-gating note, scoped to
exactly this ephemeral voice session.

**Grant shape — ephemeral, in-memory, evaporates on leave.** *Not* a DB
row. A grant is transient `AppState` state alongside
`voice_relay_active`:

```rust
// AppState (Wavvon-server hub)
staging_voice_grants: RwLock<HashMap<String /*pubkey*/, HashSet<String /*channel_id*/>>>,
```

- **Created** when the hub pushes a `voice_move` whose target lacks
  effective `READ_MESSAGES` on `target_channel_id`: insert `(pubkey,
  channel_id)` before the client's join arrives.
- **Consumed** by the voice-join read gate (below).
- **Evaporates on leave:** `leave_voice` (the shared teardown both
  transports call — `voice_ws.rs::cleanup` delegates to it) removes the
  `(pubkey, channel_id)` grant. Disconnect ⇒ leave ⇒ grant gone. Never
  outlives the voice session; never survives a restart (in-memory).

**Server-side enforcement points — exactly one gate flips:**

- **Voice join gate — bypass added.** `voice.rs:70` and `voice_ws.rs:113`
  reject a join when the caller lacks effective `READ_MESSAGES`. Add:
  *…unless `staging_voice_grants[pubkey]` contains this channel.* That
  single bypass is the entire reveal.
- **Message routes — NO bypass.** `messages.rs` history, WS `subscribe`,
  the read-gated channel-list endpoint, and `list_events`/`get_event`
  read-gating **do not** consult `staging_voice_grants`. A voice-only
  participant calling the message-history route still gets 403; the
  channel still never appears in their channel list. Text visibility is
  unchanged by staging.
- **Voice roster** already lists whoever is in `voice_channels` — the
  voice-only participant shows there for everyone in the room (and the
  room shows them the roster) with no change; that is the intended reveal.

**What the client renders:** voice UI shows the destination channel
**name** (from `voice_move.target_channel_name`) and the participant
roster — needed, so the moved member knows where they are and who's
there. Sidebar shows **no** text-channel entry, no unread badge, no
message pane — the channel is absent from the read-gated channel list, so
the existing recursive sidebar render simply omits it (no client-side
secret-keeping, same posture as nested-channels-ux.md §3.5). The voice
HUD is the only place the channel's existence surfaces.

### 7.5 Staging panel (Phase 2)

An organizer-only panel on the event card. Gated on **event creator OR
channel-scoped `CREATE_EVENTS`** (same rule as slot management,
`require_slot_management_access`) **AND** `MOVE_MEMBERS`.

- Claimants grouped by slot (reuses `EventWithRsvps.slots.claimants`).
- Drag a claimant onto one of the event's voice channels → emits a
  `voice_move` (§7.1) with `event_id`. Drop onto a channel the claimant
  can't read → the voice-only-presence path (§7.4) handles it; the chip
  shows a small "voice-only" hint.
- Bulk **"Move all \<slot\> to \<channel\>"** → one `voice_move` per
  claimant (a batched variant is a later optimization; v1 loops).
- Leaders coordinate over the **existing whisper system** (whisper to a
  role or to a channel's participants) — no new mechanism; the panel just
  co-locates roster + move affordance.
- Targets not in voice yet → each drag persists an assignment (§7.3) and
  auto-applies on join. The panel shows assigned-but-absent members
  distinctly ("assigned, not yet in voice").

**Optional: auto-spawned squad channels (Phase 3).** Reuse the temp-voice
spawner ([temp-voice-channels.md](temp-voice-channels.md)): the panel can
spawn N linked squad rooms and drop claimants into them. The rooms are
ordinary temp channels (`is_temporary = TRUE`) and **auto-clean-up via
the existing `empty_since` GC** when the raid disbands — no new
lifecycle. Event linkage (a nullable `event_id` on the temp channel,
additive) lets the panel list "this event's rooms"; deferred to Phase 3
with the auto-spawn.

### 7.6 Conflicts flagged against shipped behavior

- **`get_event` / `list_events` read-gating** assume every event is
  gate-able by its anchor channel — hub-wide events (§5) break that; the
  two bypasses are called out there. The staging panel reads through the
  normal gated event routes, so a voice-only participant still can't
  `GET` a hidden event's card via the event routes — consistent with
  §7.4's "message routes stay strict".
- **Reminder worker** posts only into the event's anchor channel;
  propagation (§6) and the assignment-prune (§7.3) both extend its sweep.
  If it shouldn't grow, a dedicated `staging_worker` on the same 60s
  pattern is the alternative for the prune.
- **`voice_ws.rs` auth** rejects any join lacking `READ_MESSAGES`
  (line 113) and rejects `mini_app`-scoped tokens (line 38). The staging
  bypass touches the `READ_MESSAGES` branch **only** — mini-app tokens
  still never join voice; the `is_bot` branch is unaffected.
- **Invisible presence** (decisions.md, 2026-07-12) already notes an
  invisible user still shows in a voice channel's participant list. A
  voice-only-presence participant is likewise visible in the roster — the
  reveal is intended, so no new conflict, but a moved invisible member
  becomes visible in that room's roster like any other participant.

## 8. Deferred

- **Per-user reminder pings** (slot claimants, RSVP'd users) — needs a
  personal-notification design (personal axis, DND interaction); the
  channel-card reminder covers v1.
- **Recurring events** — schedule templates are a real ask for weekly
  raids but multiply edit/reminder semantics; revisit after slots
  prove out.
- **Slot role-gating** ("only members with role X may claim Tank") —
  natural follow-on once role categories ship; would reference role
  ids on `event_slots`.
- **Cross-hub / alliance event federation** — same posture as forums:
  hub-local v1.

---

## Decisions

- **Slots are first-class rows, not free-text in the description.**
  The whole point is enforced capacity and one-claim-per-user —
  invariants need a table. `ON DELETE SET NULL` + the existing RSVP PK
  give demotion and claim-switching for free.
- **Reminder = a channel event-card, not per-user pushes.** Reuses the
  shipped card path, inherits read-gating, works for offline members
  via history. Per-user pings deferred with the notification system.
- **One reminder offset per event, worker-driven, idempotent via
  `reminder_sent_at`.** A cron-ish sweep every 60s over an indexed-size
  table matches the five existing worker precedents; multiple offsets
  per event add rows and UI for marginal value in v1.
- **Slot deletion requires the slot to be empty.** Deleting claims as
  a side effect of structure editing is the kind of silent data loss
  a raid organizer discovers at raid time.
- **Hub-wide events keep a NOT-NULL anchor channel + a `hub_wide` flag,
  not a nullable `channel_id`.** The alternative — making `channel_id`
  nullable for hub-wide events — is a destructive schema change the
  additive-only migration rule forbids, and it would fork every event
  query into "has a channel / doesn't". The flag anchors the card to a
  real (announcements) channel, reuses `post_event_card` untouched, and
  isolates the change to two read-gate bypasses in `list_events` /
  `get_event`.
- **Propagation fans out cards, never event state.** An event stays one
  row; only the announcement/reminder cards duplicate into descendants.
  Because cards are ordinary channel messages, descendant read-gating is
  already enforced by the message/subscribe paths — propagation needs no
  permission logic of its own, and RSVP/slot state can never diverge
  across copies.
- **A voice move is a hub-requested client leave-and-join, not a
  server-side yank.** Voice join is client-initiated on both transports;
  a request-to-join is the only mechanism that works identically for UDP
  and WS without a second control path. `voice_move` mirrors the shipped
  whisper control-message + targeted-`ChatEvent` pattern. Full consent +
  voice-only-presence rationale in [decisions.md](decisions.md).
