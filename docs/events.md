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
  deferred until a personal notification system exists (see §5).

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

## 5. Deferred

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
