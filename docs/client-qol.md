# Client Quality-of-Life

> **Storage note.** Written when the hub ran on SQLite. PostgreSQL is the
> only backend since 2026-08-08, so the "single-file deployment" argument
> behind storing custom emoji as base64 in the database is gone — the
> tradeoff wants re-deciding before that part is built, not copying.

Eight features that sharpen daily use without changing Wavvon's shape.
Each is small in isolation; grouped here because they share the same
constraints — federated (no global coordinator), two-axis state
(community state on the community hub, personal state on the home hub
list), and master+subkey identity.

The recurring design question across all eight is **where does the state
live**. The answers split cleanly:

- **Community-axis, hub-enforced** (search index, custom emojis, events,
  polls, thread counters) — these belong to one community and need
  server enforcement (read filtering, double-vote prevention,
  notification triggers). They live on the community hub, never synced
  globally.
- **Personal-axis, client-local** (drafts, thread collapse state,
  notification grouping) — working state that's per-device and not worth
  syncing. localStorage on the clients; no hub involvement.

> See also: [data-model.md](data-model.md) for the existing schema,
> [forum.md](forum.md) for forum search, and
> [decisions.md](decisions.md) for the two-axis principle.

The hub side of all five server-touching features lives in Wavvon-server
(`crates/hub/`). The client side lives in Wavvon-clients: shared UI in
`packages/ui`, wired by `apps/web` and `apps/desktop` (Android was removed
2026-07-12). "Wavvon-desktop, mirrored" in the sections below predates the
monorepo and means "both clients".

---

## 1. Global message search — **SHIPPED**

**Decision**: search runs hub-side over a full-text index; the client
fan-outs the query to every connected hub in parallel and merges.
(Originally designed as an SQLite FTS5 table; status 2026-11: the hub
uses a Tantivy index — Wavvon-server `crates/hub/src/search/tantivy_search.rs`,
route in `routes/search.rs`. Forum search is separate, on PostgreSQL
`tsvector`.)

**Alternative considered**: client-side full scan. Rejected — the client
doesn't hold full message history (it pages from each hub on demand), so
it can't scan what it doesn't have, and pulling everything to search it
would be enormous and slow.

**Tradeoff**: each hub owns its own index, so there's no single ranked
result set across hubs — the client merges N independent result lists by
timestamp, not by relevance score. Accepted: cross-hub relevance ranking
would require a global coordinator, which violates the federated pillar.
Timestamp-descending merge is predictable and good enough.

**Data model**: no new persistent table; the index (`hub.search/` in the
hub's working directory) is a derived view of `messages`.

**Wire**: `GET /search?q=<query>&limit=<n>` (limit capped at 100; no
`before` paging). Candidates are filtered through the same channel read
permission as the message list, so results never leak messages the
caller can't read.

**Client side** (both clients): a
search input in the top nav. On submit it dispatches parallel
`hubFetch("/search?q=...")` calls to all connected hubs, merges the
result arrays, sorts by `created_at` descending, and renders a list —
each row shows hub name, channel name, sender, timestamp, and a snippet
with the matched term highlighted. Clicking a result selects that hub +
channel and scrolls to the message id.

**UI sketch**:

```
[ search: "release notes"            ]
─────────────────────────────────────
Acme Hub · #announcements · alice · 2h
  …the v3 release notes are posted in…
Gaming Hub · #general · bob · yesterday
  …did you read the release notes yet…
```

**Deferred**: cross-hub search federation (a hub searching its alliance
peers), search within DMs, attachment-filename search, date-range filter.

---

## 2. Message drafts — **SHIPPED**

**Decision**: drafts are personal working state, stored client-side in
`localStorage` under `wavvon.drafts` as a JSON map keyed by
`hubId/channelId` (DMs keyed by `conversationId`). No hub involvement, no
sync.

**Alternative considered**: sync drafts via the home-hub prefs blob
(`prefs_blobs`, see [multi-device.md](multi-device.md)). Rejected for v1 —
a half-typed message is ephemeral working state, not something a user
expects to follow them across devices, and syncing it would churn the
prefs blob on every keystroke-debounce. Per-device drafts are the right
default.

**Tradeoff**: a multi-device user's draft stays on the device they typed
it on. Accepted — that matches the mental model ("I was typing on my
laptop"), and it keeps the feature entirely client-local with zero
protocol surface.

**Data model**: none server-side. Client localStorage:

```json
{
  "wavvon.drafts": {
    "<hubId>/<channelId>": "half-typed message…",
    "<conversationId>": "dm draft…"
  }
}
```

**Wire**: none.

**Client side / behaviour** (Wavvon-desktop, mirrored): when the user
navigates away from a channel with non-empty composer text, persist it.
On return, pre-fill the composer. A subtle "Draft" label shows on the
channel row in the sidebar when a draft exists. Sending clears the draft;
explicitly emptying the composer clears it too.

**UI sketch**:

```
# general
# random            Draft
# announcements
```

**Deferred**: rich-text draft preservation (today's composer is plain
text with markdown preview, so plain string storage is lossless);
optional opt-in draft sync via the prefs blob once multi-device sync
lands.

---

## 3. Custom emojis — **SHIPPED**

**Decision**: a per-hub emoji library. Holders of `hub.appearance` upload
PNG/WebP/GIF/JPEG emoji (magic bytes checked; SVG refused) stored inline
as base64 in the database; members use them in messages as `:name:` and
as reactions. This is community-axis state — it belongs to the hub, not
the user. Code: Wavvon-server `crates/hub/src/routes/emojis.rs`.

**Alternative considered**: external object storage / CDN URLs.
Rejected — that pushes a storage dependency onto every self-hoster for
what is, at 200 small images per hub, a trivially small dataset. Inline
base64 in SQLite keeps a hub a single-file deployment, consistent with
how attachments already live inline on `messages`
([data-model.md](data-model.md)).

**Tradeoff**: base64 in the database bloats the row and isn't cacheable
by a CDN. Each emoji is capped at 90,000 base64 characters (~66 KB);
there is no per-hub count cap today. The image route sets cache headers
so clients cache aggressively after first fetch. (Status 2026-11: since
attachments moved to disk — [attachments.md](attachments.md) — the
"consistent with inline attachments" argument above no longer holds; see
the storage note at the top.)

**Wire**: `GET /emojis` and `GET /emojis/{id}/image` (public), plus
`POST`/`DELETE` admin routes gated on `hub.appearance`. Exact paths and
shapes: `openapi.yaml`.

**Reactions**: custom emoji reuse the existing reactions system
([data-model.md](data-model.md), `reactions` table). The stored `emoji`
value is either a Unicode character (today) or a hub emoji name with a
sigil — `h:parrot` — so the client can tell the two apart and render the
hub image for the prefixed form.

**Client side** (Wavvon-desktop, mirrored): on hub connect, fetch and
cache `GET /emojis`. The emoji picker gains a "This server" section at
the top. The composer auto-completes `:par` -> `:parrot:` from the hub
list. When rendering a message, replace `:name:` tokens that match a hub
emoji with an inline `<img src="/emojis/:id/image" class="inline-emoji">`.

**UI sketch**:

```
Picker:  [ This server ]  🦜 :parrot:   🎉 :partyblob:
         [ Smileys ]      😀 😁 😂 …

Message: nice work :parrot:   ->   nice work 🦜(img)
```

**Deferred**: animated GIF emoji, emoji categories/tags, a global emoji
catalog on Wavvon-discovery.

---

## 4. Events / calendar — **SHIPPED**

**Decision**: a first-class hub event type — a row carrying a title,
time, optional location, and an RSVP list — that also posts an event card
into a channel when created. Community-axis state, hub-enforced.

**Alternative considered**: bot-generated event cards (bots can already
post rich embeds, [apps.md](apps.md)). Rejected — a card from a bot is
just rendered text; it carries no structured time the hub can fire a
notification on, and no RSVP state the hub can enforce against
double-booking or count reliably. A native type is what lets the hub own
the timestamp (for the start reminder) and the RSVP tally.

**Tradeoff**: a new table, two new routes' worth of surface, and new
`events.create` / `events.manage` permissions — more weight than a bot card. Justified by
the structured data (RSVP + timestamp) needing server enforcement and a
notification trigger.

**Data model** (community-axis, Wavvon-server migration):

```sql
CREATE TABLE hub_events (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL,
  creator_pubkey TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER,
  location      TEXT,
  created_at    INTEGER NOT NULL
);
CREATE TABLE event_rsvps (
  event_id   TEXT NOT NULL,
  user_pubkey TEXT NOT NULL,
  status     TEXT NOT NULL CHECK(status IN ('going','maybe','not_going')),
  PRIMARY KEY (event_id, user_pubkey)
);
```

The table sketch above is the original design; the schema has grown
(organizer slots, staging) — read Wavvon-server `crates/hub/src/routes/events.rs`.

**Wire**: `/events` CRUD plus `/events/{id}/rsvp` and `/rsvps`. Creating
needs `events.create` resolved through the target channel (and at hub
level); editing or deleting someone else's event needs `events.manage`;
reading needs `messages.read` on the event's channel. Exact routes:
`openapi.yaml`.

On create, the hub also writes a normal `messages` row into the channel
that embeds the event card, so the event appears inline in the timeline;
that card message is the live signal (there is no separate
`event_created` WS event).

**Client side** (Wavvon-desktop, mirrored): event cards render as a
distinct message type in the channel. An "Events" button in the channel
sidebar opens a mini-calendar of upcoming events with RSVP counts. The
desktop notification system (Wavvon-desktop `src-tauri/`) fires a reminder
15 minutes before `starts_at`.

**Connection to proximity voice**: for a concert or meetup, the creator
can name a voice zone on the event; the card shows a "Join" button that
drops the user into the channel's voice at that proximity-zone origin
(reuses the zone protocol in [proximity-voice.md](proximity-voice.md)).

**UI sketch**:

```
┌─ Event ─────────────────────────────┐
│ 🎵 Friday Listening Party            │
│ Fri Jun 6, 20:00 · #music            │
│ 12 going · 4 maybe                   │
│ [ Going ] [ Maybe ] [ Can't ] [Join] │
└──────────────────────────────────────┘
```

**Deferred**: recurring events, iCal export, cross-hub event federation
(an alliance-wide event), event edit history.

---

## 5. Polls — **SHIPPED**

**Decision**: native poll creation in a channel, vote aggregation
hub-side, live totals pushed over WS. No bot dependency. Community-axis,
hub-enforced.

**Alternative considered**: client-side vote tallying (clients exchange
votes and each counts locally). Rejected — there's no trustworthy way to
prevent double-voting without a single counting authority, and clients
can't reconcile a consistent live total. The hub is the natural counting
authority for its own channel.

**Tradeoff**: votes are attributable (the hub stores `user_pubkey` per
vote), so v1 polls are not anonymous. Accepted for v1 — anonymity needs a
blind-tally scheme and is deferred. The hub knowing who voted is the same
trust the user already extends for messages.

**Data model** (community-axis, Wavvon-server migration):

```sql
CREATE TABLE polls (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL,
  creator_pubkey TEXT NOT NULL,
  question      TEXT NOT NULL,
  options       TEXT NOT NULL,          -- JSON array of { id, text }
  ends_at       INTEGER,
  max_choices   INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);
CREATE TABLE poll_votes (
  poll_id    TEXT NOT NULL,
  user_pubkey TEXT NOT NULL,
  option_ids TEXT NOT NULL,             -- JSON array (multi-choice)
  PRIMARY KEY (poll_id, user_pubkey)
);
```

**Wire** (Wavvon-server):

```
POST   /channels/:id/polls     { question, options, ends_at?, max_choices? }  (messages.send)
GET    /polls/:id              -> { question, options, your_vote, totals }    (messages.read)
POST   /polls/:id/vote         { option_ids: [string] }
DELETE /polls/:id              (creator, or messages.manage)
WS:    poll_vote_updated { channel_id, poll_id, totals: { [option_id]: count } }
```

Posting a poll also writes a `messages` row with the poll card. Each vote
upserts the voter's `poll_votes` row (re-voting replaces, respecting
`max_choices`) and broadcasts `poll_vote_updated` so every client's bar
chart updates live.

**Client side** (Wavvon-desktop, mirrored): poll cards show the question,
a bar per option (% filled), the user's selection if they've voted, and a
vote button. After voting or on each `poll_vote_updated`, bars animate to
new totals. Past `ends_at`, the card shows final results and disables
voting.

**UI sketch**:

```
┌─ Poll ──────────────────────────────┐
│ Best raid night?                     │
│ Friday   ███████████░░░  64%  (32)   │
│ Saturday ████░░░░░░░░░░  24%  (12)   │
│ Sunday   ██░░░░░░░░░░░░  12%   (6)   │
│ ends in 2h · you voted Friday        │
└──────────────────────────────────────┘
```

**Deferred**: anonymous polls (blind tally), public per-voter list,
results export.

---

## 6. Thread view improvements — **SHIPPED**

**Decision**: keep threads flat (one level), and add an inline
collapse/expand affordance plus "jump to thread." A denormalized
`reply_count` on `messages` drives a "N replies" chip; clicking it
expands the thread inline. Collapse state is personal (client-local).

**Alternative considered**: nested/recursive threads (Reddit-style).
Rejected — deep nesting fractures conversation context in a chat setting
and produces unreadable indentation past a couple of levels. A flat
thread anchored to a parent message is the right shape for live chat.

**Tradeoff**: a denormalized counter can drift from the true reply count
if an insert/delete path forgets to maintain it. Accepted — the counter
is maintained in the same code paths that already insert and soft-delete
messages, and a periodic reconcile can correct drift if it ever appears.
The alternative (counting replies on every render) is too expensive.

**Data model** (community-axis, Wavvon-server migration):

```sql
ALTER TABLE messages ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0;
```

`reply_count` on the thread-root message is incremented when a reply is
inserted and decremented on delete (soft-delete still decrements, so the
chip reflects visible replies). Threading already exists via `reply_to`
on `messages` ([data-model.md](data-model.md)); this only adds the
counter. Collapse state is client-local (localStorage, per channel).

**Wire** (Wavvon-server): no new route — reuse the message-list route
with a thread filter:

```
GET /channels/:id/messages?thread_root=:msg_id   -> the flat reply list
```

`reply_count` rides along on existing message payloads.

**Client side** (Wavvon-desktop, mirrored): a message with
`reply_count > 0` shows a "N replies" chip. Clicking it fetches the
thread and renders it as an indented sub-list under the root; clicking
again collapses. A "Jump to thread" button on any reply scrolls to and
highlights the root, expanding it. Collapse state persists per channel in
localStorage.

**UI sketch**:

```
alice: anyone hitting the v3 build error?
   💬 3 replies  ▸                 (collapsed)

alice: anyone hitting the v3 build error?
   💬 3 replies  ▾                 (expanded)
     bob:  yeah, missing env var
     carol: set WAVVON_FARM_URL
     bob:  that fixed it, thanks
```

**Deferred**: a dedicated side-panel thread view, thread-level
notifications (notify only on replies to threads you're in), thread
search.

---

## 7. Notification grouping — **SHIPPED**

**Decision**: batch OS notifications per hub with a 3-second debounce, so
a burst of messages produces one toast instead of ten. A single message
with nothing buffered fires immediately. Entirely client-local — the
debounce lives in the desktop React side (Wavvon-clients
`apps/desktop/src/hooks/useChannelMessages.ts`, `pendingNotifsRef`).

**Alternative considered**: hub-side notification coalescing. Rejected —
the hub already pushes per-message WS events and shouldn't grow
delivery-timing logic; batching is a per-device presentation concern that
belongs next to the OS notification API. No protocol change.

**Tradeoff**: bursty notifications are delayed up to 3 seconds before the
user sees a toast. Accepted — that's the point; the single-message fast
path means quiet channels still notify instantly, and only an active
burst (the annoying case) pays the debounce.

**Data model**: none. In-memory per-hub (and per-DM-conversation) pending
buffers.

**Wire**: none — client-side only, no hub changes.

**Client side / behaviour** (desktop): maintain a
per-hub pending buffer with a 3-second debounce. While messages arrive,
hold them; after 3 seconds of quiet, fire one toast — e.g.
**"Acme Hub — 5 new messages in #general, #gaming."** If the burst spans
more than three channels, list three and append "and N more channels."
The debounce only engages when ≥2 messages arrive within the window; a
lone message with an empty buffer fires at once.

DMs buffer **per conversation**, not per hub, because the sender matters:
**"Alice — 3 new messages."**

**UI sketch**:

```
┌─────────────────────────────────────┐
│ Acme Hub                             │
│ 5 new messages in #general, #gaming  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Alice                                │
│ 3 new messages                       │
└─────────────────────────────────────┘
```

**Deferred**: per-hub notification-throttle settings (user-tunable debounce
window), notification action buttons (Reply, Mark read).

---

## 8. Read marker, new-messages divider, mark as unread — **SHIPPED**

**Where the state lives.** Community-axis, on the community hub: one
timestamp per member and channel (`channel_last_read`, unix ms). Messages
with a later `created_at` are unread; `GET /channels/unread` counts them.

**Hub** (`routes/channels.rs`, Wavvon-server#403). `POST
/channels/{id}/read` moves the caller's marker to now and answers
`previous_last_read_at`, the marker before the call. With a `message_id`
(capability `channels.markunread`) the marker becomes that message's
`created_at` minus one instead — "mark as unread". Only the caller's own
marker ever moves. The capability matters: an older hub ignores the body
and marks the channel read, the opposite of what was asked.

**Clients** (Wavvon-clients#412, #417; web and desktop alike).

- Opening a channel marks it read and keeps the previous marker. The
  divider goes above the first later message someone else wrote
  (`firstUnreadId` in `packages/ui/src/utils/unreadCounts.ts`); a marker
  of 0 (never read) or a hub too old to answer draws none. The channel
  opens at the divider instead of at the bottom.
- The divider is held by message id, so it does not move while reading
  and stays until the channel is left. While it is above the viewport a
  bar says how many messages are new, with Jump and Mark as read; Esc
  marks read too — only when no menu or dialog took the key (it used to
  mark read while closing a context menu).
- Leaving a channel marks it read again, so messages read live while it
  was open do not come back as new — unless the reader just marked it
  unread, which is the whole point of that action.
- "Mark as unread" in the message menu moves the hub marker back, marks
  the channel unread in the sidebar and puts the divider at that message.

**Not done.** The sidebar's unread dots are still client state seeded
from `/channels/unread` at hub load, not pushed per marker change, so a
second device learns of a read on the first only at its next load.

---

## 9. Saved messages and reminders — **SHIPPED**

**Where the state lives.** Personal axis: one list in the synced settings
(`wavvon.savedMessages`, carried by the prefs blob on the home hub; web
through `SYNCED_KEYS`, desktop through `synced_setting_get/set` under the
same key). Nothing is stored on the community hub. Each entry keeps what
showing and reopening it needs without asking anyone: hub id, URL and name,
channel id and name, message id, author, a 200-character excerpt, when the
message was written and when it was saved. The list is capped at 500 because
it travels in the blob on every sync, and it is last writer wins like every
other synced value.

**Saved** (Wavvon-clients#413). "Save message" in the message menu; a
bookmark button in the top bar opens the list, newest first, across hubs;
an entry jumps to the message through the permalink path. A delete seen
for a saved message marks it deleted instead of dropping it.

**Reminders** (Wavvon-clients#414). "Remind me" in the message menu: in 20
minutes, 1 hour, 3 hours, tomorrow at 09:00, or a chosen time. The entry
gets an absolute `remind_at`, never a bare timer, so a reload or another
device keeps it; a message reminded but not saved is kept for the reminder
alone and leaves with it. When due the client toasts it, shows an OS
notification where the page may, counts it on the Saved button and lists it
first until dismissed; the entry is marked fired, so it fires once.

Shared code: `packages/ui/src/utils/savedMessages.ts`,
`hooks/useSavedMessages.ts`, `components/content/SavedMessagesModal.tsx`.

**Not done.** No Web Push for a reminder while no tab is open: that would
need a hub to hold a schedule of personal reminders, which is
personal-axis state on whatever hub sends the push. A closed client fires
the reminder on its next load.

---

## 10. Voice messages — **SHIPPED**

(Wavvon-clients#415.) A microphone button in the composer: hold to record,
release to send, slide the pointer away (or press Esc) to cancel; Space or
Enter held on the focused button does the same. `MediaRecorder` records
Opus at 32 kbit/s, in Ogg where the browser can and WebM otherwise, for at
most five minutes; the microphone permission is asked on the first press.

**No new hub surface.** A recording is an ordinary attachment named
`voice-message-<ms>.ogg|webm`, so the hub's attachment size limit,
retention and permissions apply as to any file, and the button shows only
where the hub stores attachments (`attachments.stored`). The hub sniffs
the bytes: Ogg is `audio/ogg`, WebM is `video/webm`, which an `<audio>`
element plays all the same.

**Player.** An attachment with that name renders inline: play/pause, a
waveform decoded from the file that is also the seek bar, the time, and
1x/1.5x/2x speed. The duration comes from the decoded audio, because a
`MediaRecorder` WebM carries none in its header and the element reports
`Infinity`. Shared code: `packages/ui/src/utils/voiceMessage.ts`,
`components/content/VoiceRecordButton.tsx`,
`components/VoiceMessagePlayer.tsx`.

**Not done.** Voice messages in DMs: an encrypted DM carries its
attachments inline rather than as hub uploads, and the recorder is wired to
the channel composer only.

---

## 11. Empty states that teach — **SHIPPED**

(Wavvon-clients#418.) Where a list is empty it says how to fill it, as text
from the catalogues: the friends list (add from a name or a key, and what a
friend gives), Saved (saving and reminders, and that the list follows the
identity), the directory with no results (what to change, and when the
NSFW filter hid everything), and a hub with no channels seen by someone who
can create them, which offers the setup templates again. The DM list
already said how to start a conversation.

---

## What's deferred (all features)

| Feature | Deferred |
|---|---|
| Global search | Cross-hub search federation; DM search; attachment-filename search; date-range filter |
| Drafts | Rich-text draft preservation; opt-in draft sync via prefs blob |
| Custom emojis | Animated GIF emoji; categories/tags; global discovery catalog |
| Events | Recurring events; iCal export; cross-hub event federation; edit history |
| Polls | Anonymous polls (blind tally); public per-voter list; results export |
| Threads | Side-panel thread view; thread-level notifications; thread search |
| Notification grouping | User-tunable debounce window; notification action buttons |

A note that recurs above: anything tagged "cross-hub" or "federation"
(search, events) is deferred for the same reason — it needs coordination
across hubs that don't share a source of truth, and that cost isn't
justified until the single-hub version proves out.
