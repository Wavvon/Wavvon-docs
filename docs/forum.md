# Forum channel type

**Status**: design committed. Not built. Federation deferred to v2.

A **forum channel** is a channel whose content is an ordered list of
titled *posts*, each carrying its own reply thread, instead of a
continuous message stream. It is a leaf in the channel tree at the same
positions a regular channel can occupy (see nested-channels in
[future-features.md](future-features.md)), but a different *content
shape*. There is no voice in a forum channel.

This supersedes the "Forum channel type" sketch in
[future-features.md](future-features.md); that section is the
pre-decision exploration.

## Why a channel variant, not a new entity

Channels are unified text + voice — "joining voice is something a user
*does* in a channel" ([decisions.md](decisions.md)). A forum breaks
that: it is the one place where voice does **not** make sense, because
the surface is a post index rather than a room. Per the decisions.md
guidance ("does this make sense for both chat and voice in the same
room? If no, the feature probably belongs as a *channel property*"),
forum-ness is exactly such a property: a `channel_type` discriminant on
the existing `channels` row, not a new tree node type. Categories stay
categories; leaves are either `text` (unified text + voice) or `forum`
(posts, no voice).

This keeps permissions, moderation, bans, naming, and tree placement
attached to the same `channels` entity — no parallel hierarchy.

## How it differs from a regular channel

| | Regular channel (`text`) | Forum channel (`forum`) |
|---|---|---|
| Primary content | Continuous message stream | Ordered list of posts |
| Each entry | Message (no title) | Post (title + body) |
| Replies | Thread off a message | Reply thread inside the post |
| Voice | Yes | No — hard-blocked |
| Search | FTS on message content | FTS on post titles + bodies + reply bodies |
| Real-time | WS message firehose | WS post/reply events (see Notifications) |

---

## 1. Data model

All in `hub/src/db/migrations.rs` (Wavvon-server). Conventions per
[data-model.md](data-model.md): TEXT ids (UUID), INTEGER unix-second
timestamps, TEXT hex pubkeys, additive `CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE`, no drops/renames.

### `channels` — one new column

```
ALTER TABLE channels ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'text';
```

Domain: `'text'` | `'forum'`. Categories (`is_category=1`) ignore it —
the column is only meaningful on leaves. Existing rows default to
`'text'`, so the migration is a no-op for current data. The type is
**fixed at creation** (see deferred — no conversion in v1).

### `posts` — new table

```
CREATE TABLE IF NOT EXISTS posts (
    id            TEXT PRIMARY KEY,
    channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_pubkey TEXT NOT NULL,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    edited_at     INTEGER,
    is_pinned     INTEGER NOT NULL DEFAULT 0,
    is_locked     INTEGER NOT NULL DEFAULT 0,
    reply_count   INTEGER NOT NULL DEFAULT 0,
    last_activity_at INTEGER NOT NULL,
    deleted_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_posts_channel_activity
    ON posts (channel_id, is_pinned DESC, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author
    ON posts (author_pubkey);
```

Notes:
- `is_locked` was not in the sketch; added so "lock post (admin)" has a
  column rather than a side table. A locked post accepts no new replies
  and no edits except by a moderator.
- `reply_count` and `last_activity_at` are **denormalized** so the post
  list renders without an N-query fan-out and sorts by recent activity
  cheaply. Both are maintained in the same transaction as reply
  insert/delete. `last_activity_at` starts equal to `created_at` and
  advances on each non-deleted reply.
- `deleted_at` is a **soft-delete tombstone** (nullable). Moderation
  needs the row to persist for audit and to keep reply ids valid. A
  tombstoned post renders as "[deleted]" with its replies hidden.
  `ON DELETE CASCADE` only fires on hard channel deletion.
- No `parent_id` — posts are flat under a channel. Threading is one
  level (a reply, optionally pointing at another reply via
  `reply_to_id`), same shape as the message-reply model in
  [data-model.md](data-model.md).

### `post_replies` — new table

Reusing `messages` with a `post_id` FK was the sketch's alternative.
Rejected: `messages` carries channel-stream concerns (subscriptions,
firehose ordering, the FTS mirror) that don't apply to replies, and
overloading it forces every `messages` query to learn about posts. A
dedicated table keeps both query surfaces clean.

```
CREATE TABLE IF NOT EXISTS post_replies (
    id            TEXT PRIMARY KEY,
    post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_pubkey TEXT NOT NULL,
    body          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    edited_at     INTEGER,
    reply_to_id   TEXT REFERENCES post_replies(id) ON DELETE SET NULL,
    deleted_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_post_replies_post
    ON post_replies (post_id, created_at);
```

`reply_to_id` is a nullable self-reference for "reply to a specific
reply" (rendered as a quote stub, not a nested tree). `ON DELETE SET
NULL` so deleting a quoted reply doesn't cascade-delete its children.
`deleted_at` is the same soft-delete tombstone as posts.

### FTS mirror — new virtual table

Matches the planned `messages_fts` shape in
[performance.md](performance.md) (FTS5, kept in sync by triggers).

```
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    title, body, post_id UNINDEXED, channel_id UNINDEXED
);
```

A single FTS table covers both titles and bodies of posts and reply
bodies (replies inserted with an empty `title`). Triggers on
`posts`/`post_replies` insert/update/delete keep it current and exclude
tombstoned rows. See section 7.

---

## 2. Hub routes

All under `hub/src/routes/posts.rs` (new, Wavvon-server). Permission
gates per section 5. Every route first checks the channel exists, is
not a category, and is `channel_type='forum'`; a `text` channel returns
`409 not_a_forum`.

| Method + path | Purpose | Gate |
|---|---|---|
| `GET /channels/:cid/posts` | List posts (paged, sorted) | read access |
| `POST /channels/:cid/posts` | Create a post | `create_posts` |
| `GET /posts/:pid` | Get one post + its replies (paged) | read access |
| `PATCH /posts/:pid` | Edit own post title/body | author or `manage_posts` |
| `DELETE /posts/:pid` | Soft-delete post | author or `manage_posts` |
| `POST /posts/:pid/replies` | Create a reply | `send_messages` + not locked |
| `PATCH /replies/:rid` | Edit own reply | author or `manage_posts` |
| `DELETE /replies/:rid` | Soft-delete reply | author or `manage_posts` |
| `POST /posts/:pid/pin` / `DELETE …/pin` | Pin / unpin | `manage_posts` |
| `POST /posts/:pid/lock` / `DELETE …/lock` | Lock / unlock | `manage_posts` |
| `GET /channels/:cid/posts/search?q=` | FTS over the channel's posts | read access |

List sorting: pinned first (`is_pinned DESC`), then
`last_activity_at DESC`. The list is paged by an opaque cursor
(`last_activity_at` + `id` tiebreak), `LIMIT 50`. The `GET /posts/:pid`
reply list is paged by `created_at` ascending, `LIMIT 50`.

Channel ban (planned `channel_bans`,
[future-features.md](future-features.md)) applies to every write route
here, same check as message posting.

---

## 3. Wire models

In `hub/src/routes/post_models.rs` (new, Wavvon-server). The client
mirrors these as TS types.

```
PostSummary {            // post-list rows
  id, channel_id, author_pubkey, title,
  created_at, edited_at?, is_pinned, is_locked,
  reply_count, last_activity_at, is_deleted
}

PostDetail {             // GET /posts/:pid
  ...PostSummary, body,
  replies: ReplyView[], reply_cursor?
}

ReplyView {
  id, post_id, author_pubkey, body,
  created_at, edited_at?, reply_to_id?, is_deleted
}

PostListResponse   { posts: PostSummary[], cursor? }
CreatePostRequest  { title, body }
EditPostRequest    { title?, body? }
CreateReplyRequest { body, reply_to_id? }
EditReplyRequest   { body }
PostSearchResponse { results: PostSearchHit[], cursor? }
PostSearchHit      { post_id, title_snippet, body_snippet, is_reply, reply_id? }
```

A tombstoned post/reply serializes with `is_deleted: true`, title/body
nulled, author preserved for the "[deleted by …]" affordance only when
the viewer has `manage_posts`; otherwise author is also nulled.

WS envelope variants (additive to the existing typed channel in
`hub/src/routes/chat_models.rs`, Wavvon-server): `post_created`,
`post_updated`, `post_deleted`, `reply_created`, `reply_updated`,
`reply_deleted`. Payloads carry `channel_id` + `post_id` so clients can
update list/detail views and unread state without a refetch.

---

## 4. Client UI

Desktop (`Wavvon-desktop`); mirrored on `Wavvon-web` and
`Wavvon-android` with the same wire shapes. Per
[decisions.md](decisions.md), state stays in `App.tsx`; these are pure
prop-fed components.

When the selected channel's `channel_type === 'forum'`, `ContentArea`
renders the forum surface instead of the message stream + composer, and
the in-channel voice controls are hidden.

**Post list view** (`ForumPostList`): full-width scrollable list. Each
row shows title, author, relative `last_activity_at`, reply count, and
pin/lock icons. Pinned posts sit in a visually separated band at top. A
"New post" button top-right opens the composer. Empty state mirrors the
empty-channel pattern. Infinite scroll via the list cursor.

**Post detail view** (`ForumPostDetail`): opening a post pushes a detail
view (a back button returns to the list; the channel stays selected in
the sidebar). Layout: post header (title, author, timestamps, pin/lock
badges), post body, then the reply thread in `created_at` order. A reply
that sets `reply_to_id` shows a compact quote stub linking up to the
quoted reply. Author and moderators see edit/delete on their own
entries; moderators see pin/lock controls on the header. A locked post
shows a banner and disables the reply composer.

**Compose post** (`ForumComposer`): modal or inline panel with a
single-line title field and a multi-line body (same markdown affordances
as the message composer — see [client.md](client.md)). Submit calls
`POST /channels/:cid/posts`.

**Compose reply**: a body field pinned to the bottom of the detail view,
same composer component as messages minus first-class attachments
(deferred). Submitting a reply optimistically appends and reconciles on
the `reply_created` WS echo.

Tauri commands (thin pass-throughs): `forum_list_posts`,
`forum_get_post`, `forum_create_post`, `forum_edit_post`,
`forum_delete_post`, `forum_create_reply`, `forum_edit_reply`,
`forum_delete_reply`, `forum_pin_post`, `forum_lock_post`,
`forum_search_posts`. The channel-create flow gains a type selector
(`text` / `forum`).

---

## 5. Permissions

Reuse the existing permission machinery in `hub/src/permissions.rs`
(Wavvon-server). `manage_games` is unrelated and is **not** reused — it
gates the game catalog, not content moderation.

- **Read** a forum channel: same channel-visibility check as a text
  channel. No new permission.
- **Reply**: gated by the existing `send_messages`. A reply is a
  message-shaped contribution; it belongs under the same knob so a hub
  that mutes posting mutes forum replies too.
- **Create a post**: a **new `create_posts` permission**. Forums often
  want "anyone can reply, only some can start threads" (announcements,
  patch notes, curated Q&A). `send_messages` is too coarse for that
  distinction, and folding post-creation into `manage_posts` would
  conflate authoring with moderation. Default role bundles grant
  `create_posts` alongside `send_messages` so the common case (open
  forum) needs no admin action; announcement-style forums restrict it
  by role.
- **Moderate** (edit/delete others' posts and replies, pin, unpin, lock,
  unlock): a **new `manage_posts` permission**. Parallels
  `manage_messages` ([bots.md](bots.md)) but scoped to the forum surface
  so a hub can hand someone forum moderation without message-stream
  moderation. `admin`/`manage_hub` implies it.

Two new permissions, both following the existing `manage_*` / verb
naming. They register in `hub/src/permissions.rs` and surface in the
role editor (`Wavvon-desktop`) with no new UI mechanism.

---

## 6. Notifications

Forum events plug into the **existing** notification model
([decisions.md](decisions.md): "Notifications: client-side filtering,
two distinct features"). The two features — proactive **notification**
(sound + OS) and passive **unread pin** — and the three-state
`NotifyMode` (all / mentions / silent) per channel apply unchanged. The
forum channel row carries an unread pin and the hub badge aggregates it
exactly as a text channel does.

What maps onto that model:

- A new post and a new reply are both **bump events** for the channel,
  subject to the same `NotifyMode` / `allowBump` / active-channel gating
  as a `chat-message`. The hidden-channel gate (the client's `channels`
  array is the authority on visibility) applies to `post_created` /
  `reply_created` exactly as it does to messages.
- **Mentions** inside a post body or reply body are detected the same
  way message mentions are (computed from body text, no table). A
  mention fires notification + pin even in `mentions` mode.
- **Granularity decision (v1)**: unread was tracked at the **channel**
  level, not per-post — the forum row pins like any channel; opening
  the channel (the post list) clears it. **Since shipped**: per-post
  read cursors (`post_reads` table, per-`(user, post)` state) now give
  per-post unread dots and reply counts alongside the original
  channel-level pin, rather than replacing it. `firstNotifyingMessageId`
  ([decisions.md](decisions.md)) still has no forum analogue; "jump to
  first notification" is a stream affordance.

No new `NotifyMode`, no new server notification state. The forum reuses
the same WS auto-subscribe-on-connect path; the new envelope variants
are filtered client-side like message events.

---

## 7. Search

Forum search extends the **same FTS5 direction** planned for messages
([performance.md](performance.md)), not a separate engine.

- A `posts_fts` virtual table (section 1) mirrors post titles, post
  bodies, and reply bodies. Kept in sync by SQL triggers on
  `posts`/`post_replies` (insert → insert, update → update, delete or
  soft-delete → delete from FTS). Replies index with an empty `title`
  column so a single `MATCH` covers both.
- `GET /channels/:cid/posts/search?q=` runs a `MATCH` scoped to the
  channel, returns hits with `snippet()`-generated title/body excerpts,
  flags whether the hit is a post or a reply, and is paged by the same
  rowid-cursor pattern message search will use. Empty/whitespace queries
  are rejected early (same guard as message search).
- Tombstoned rows are excluded from the index, so deleted content never
  surfaces in search.
- The client search UI reuses the message-search affordance
  (`searchQuery` / `searchResults` / `searchOpen` in `App.tsx`,
  [client.md](client.md)); inside a forum channel it targets the forum
  search endpoint and renders hits as "jump to post" / "jump to reply"
  links instead of message rows.

Cross-channel / hub-wide forum search is **deferred** — search is
per-channel in v1, matching the current per-channel message search.

---

## 8. What's deferred

Per-post read cursors, reactions on posts/replies, and attachments on
posts/replies were originally scoped out of v1 below but have since
shipped (`post_reads`, `post_reactions`, and a JSON `attachments`
column on `posts`/`post_replies` all exist and are wired end-to-end).

- **Federation**: posts/replies/reactions federating over alliance
  shared channels is now designed — see section 9 below. v1 remains
  local-only until that ships.
- **Rich formatting beyond the existing markdown**: forums reuse the
  message markdown subset; no forum-specific rich text, no embeds.
- **Channel type conversion** (`text` ⇄ `forum` on an existing
  channel): the type is fixed at creation. Conversion has to answer
  "what happens to the existing message stream / posts," which is its
  own design.
- **Post tags / categories within a forum**: designed — see section 10.
  **Post drafts**: wishlist, not designed.
- **Cross-channel / hub-wide forum search**: per-channel only in v1.

---

## 9. Federation across alliances

**Status**: designed, not built. Wishlist item, not a pillar. Supersedes
the earlier idea (above) of a new federation *envelope* — alliance
content does not use an envelope, it uses a read-through proxy, and
forums reuse that.

### Decision

**Federate forum content the same way alliance messages already do:
read-through proxy, owning hub authoritative.** No replication, no sync
log, no new envelope.

When Hub B reads or posts to an alliance channel owned by Hub A, Hub B
holds no copy — it resolves the owner by walking alliance members and
proxies the HTTP call to Hub A over the federation client
(`get_alliance_channel_messages` / `post_alliance_channel_message` in
`hub/src/routes/alliances/channels.rs`, Wavvon-server). The owning hub is
the single source of truth. Forums extend this: an alliance-shared
**forum** channel proxies its post list, post detail, replies, and
reactions to the owning hub. The `posts` / `post_replies` /
`post_reactions` tables live only on the owning community hub — exactly
where the two-axis rule puts community-axis state. Nothing personal (read
cursors, drafts) crosses; that stays on the reader's home hub.

### Alternative considered

A **dedicated push/replication sync** — a DM-style outbox that forwards
each post to every member hub, or a CRDT/op-log each hub materializes.
Rejected: replication buys offline reads and live push but forces
conflict handling, storage duplication, a versioned envelope, and a
reconciliation worker — for a low-velocity surface. The proxy model
already exists, already handles member resolution and the cycle-guard
(`local_only=true`), and gives correct semantics for free.

### Tradeoff

Proxy trades **availability for simplicity and correctness**. If the
owning hub is offline its forum is unreadable to allies (same as alliance
messages today) — no offline cache. In exchange there is exactly one
copy, so **ordering and conflicts are non-problems**: order is the owning
hub's `created_at`/`id`, edits are last-writer there, a delete is gone
for everyone on next fetch. No vector clocks, no split-brain.

### Identity attribution across hubs

The message path authenticates the proxied write as the **hub** and
smuggles attribution into the content (`[alice via hub] …`,
`channels.rs`). Tolerable for a chat line, ugly in a post *title*, and it
loses the author pubkey. Forums do it honestly: the proxied create
carries the author pubkey + origin-hub identity, and the owning hub
trusts the assertion **because the request is authenticated as an allied
hub** (alliance membership is already a trust relationship). New additive
`author_hub` columns on `posts`/`post_replies` store the origin alongside
`author_pubkey`; clients render "alice · HubName".

Caveat surfaced in UI and threat model: attribution is **hub-asserted,
not cryptographically proven** — unlike a signed DM envelope
([e2e-encryption.md](e2e-encryption.md)), the author doesn't sign the
post; the origin hub vouches. Render as mediated ("via HubName"), never
as a verified badge.

### Moderation semantics

- **Owning hub is sovereign.** Its `manage_posts` moderators (§5) can
  remove/lock/pin any post/reply it hosts, federated or not. Removal
  needs no propagation — one copy, so the delete is instantly visible to
  every ally on next read-through.
- **Origin-hub retraction.** An allied hub may remove content *its own
  users* authored, via a proxied `DELETE` authenticated as that hub; the
  owning hub honors it only when `author_hub` matches the requester. A
  hub can retract its members' posts (e.g. after a local ban) without
  gaining mod power over anyone else's content.
- **Owner can always refuse or override**; the origin hub cannot force
  retention. Pin/lock stay **owner-only** (curation of the owner's
  space).

### Conflict and ordering

None to handle. Single authoritative copy ⇒ the owning hub's existing
local ordering (`idx_posts_channel_activity`, §1) and last-writer edits
apply unchanged. This is the payoff of proxy-over-replication.

### Threat-model deltas

An allied hub becomes a **write path into your forum**. Over
[threat-model.md](threat-model.md):

- **Spam/flood via an ally.** Add a **per-origin-hub rate limiter** on
  federated forum writes (mirror the `badge_offer` limiter in
  `hub/src/rate_limit.rs`, Wavvon-server) and a **federated-write policy**
  the owner controls per shared channel — because the proxied write
  authenticates as a hub, the local `create_posts`/`send_messages` gates
  don't map to a user. New additive `alliance_shared_channels` column
  (e.g. `forum_remote_write` ∈ `none` | `replies_only` |
  `posts_and_replies`, default `replies_only`) lets an announcement forum
  take allied replies but not allied threads.
- **Attribution spoofing.** An origin hub can assert any `author_pubkey`;
  accepted within alliance trust, advisory only, must not feed anything
  assuming a proven identity (reputation certs,
  [hub-certifications.md](hub-certifications.md)).
- **Blast radius.** Containment = owner sovereignty: delete an origin
  hub's content wholesale, unshare the channel, or leave the alliance.

### Non-goals

- **Live cross-hub WS push** — allies poll/refetch on open, as alliance
  messages do; the local `forum_event` ([ws-protocol.md](ws-protocol.md))
  stays local.
- **Offline reads / store-and-forward writes** — forum writes are
  synchronous proxy calls that fail if the owner is offline (unlike the
  DM outbox).
- **Cryptographically signed authorship** — attribution is hub-vouched.
- **Cross-hub / alliance-wide forum search** — per-channel on the owner
  (§7).
- **Cross-hub sync of per-post read cursors** — personal-axis, stays on
  the reader's home hub ([home-hub.md](home-hub.md)).

### Phasing

All three phases SHIPPED 2026-07-19 (server `e424760`, `bdb8083`,
`b2d7d46`; web `6e88c02`, `be9bdbe`).

1. **Read-through GET (first slice, small)** — proxy post list, post
   detail, replies (reactions included, as alliance message reads already
   load them, [federation.md](federation.md)). Read-only makes remote
   forums *visible* (the biggest gap) and mirrors how alliance message
   reads shipped before writes.
2. **Proxied writes** — create post/reply/reaction carrying
   `author_pubkey` + `author_hub`; additive columns; per-origin rate
   limit; the `forum_remote_write` policy.
3. **Origin-hub retraction** as above; pin/lock stay owner-only.
   Reactions excluded (no `author_hub` column; local-scope removal only).
- Deferred: live WS push, cross-hub search, signed attribution,
  federated reaction *removal* / reply-level federated reactions,
  `include_descendants` policy inheritance (direct shares only today).

### Files this will touch

All Wavvon-server unless noted.

- `hub/src/routes/alliances/channels.rs` — new proxy handlers
  (`get_alliance_forum_posts`, `..._forum_post`,
  `post_alliance_forum_post`, `..._forum_reply`, `react_alliance_forum`,
  `delete_alliance_forum_content`), reusing the member-walk + owner
  resolution already there; locally-owned forum channels delegate to the
  local handlers.
- `hub/src/routes/posts.rs` — local forum handlers reused when the
  channel is owned here.
- `hub/src/federation/client.rs` — matching `FederationClient` methods
  (siblings of `get_messages` / `send_message`).
- `hub/src/db/migrations.rs` — additive `author_hub` on
  `posts`/`post_replies`; `forum_remote_write` on
  `alliance_shared_channels`.
- `hub/src/rate_limit.rs` — per-origin-hub federated forum write limiter.
- `hub/src/routes/post_models.rs` — wire types gain optional `author_hub`
  / origin fields (serde defaults so un-upgraded peers parse).
- `hub/src/server.rs` — route wiring for
  `/alliances/:id/channels/:cid/posts…` (paralleling alliance message
  routes).
- Wavvon-web `apps/web` (current delivery target) — alliance forum views
  call the alliance forum endpoints, render "author · hub"; mirrored to
  Wavvon-desktop / Wavvon-android afterward.

---

## 10. Post tags

**Status**: SHIPPED 2026-07-21 (server `a03176c`, clients `6097b37`).
The open questions below were resolved to the recommended answers
(user call, 2026-07-21). One implementation note: the edit-path tag
picker lives inline in `ForumPostDetail`'s edit block, not in
`ForumComposer` — post editing never routed through the composer.

Structured, admin-curated labels attached to posts within one forum
channel, for filtering the post list (`Bug` / `Question` / `Guide`,
`Patch notes` / `Discussion`, …). Not free-text keywords, not a
cross-channel taxonomy.

**Driving use case: a community bug/feature-request tracker.** A hub runs
a forum channel where members file bugs and feature requests; admins tag
each with `bug` / `feature-request` and triage status (`planned` /
`done`), and a bot may read the channel to mirror reports into an external
issue tracker. This shapes the recommendations below — it is the reason
the model is admin-curated (a clean, filterable tag vocabulary the
maintainers control) with moderator retagging (triage), and it adds the
bot-access subsection §10.6.

### Open questions (user call — recommended answer inline)

- **Q1 — who defines tags?** *Recommend admin/moderator-curated per
  channel, no free-form user tags.* Prior art: forum-channel tags in
  comparable platforms are creator-defined sets picked from at post time,
  not free typing — it keeps the list short and filter-useful and sidesteps
  the moderation load of arbitrary user strings (slurs, near-duplicates,
  spam facets). Wavvon already leans admin-curated; this matches. The
  tracker use case seals it: `bug` / `feature-request` / `done` are only
  useful as a controlled vocabulary the maintainers own — free-form would
  give ten spellings of "bug" and break the filter that makes it a tracker.
- **Q2 — cardinality + required?** *Recommend multiple tags per post,
  capped at 5, with an optional per-channel "require at least one tag" flag,
  default off.* Multiple is the norm (a post is both a `Bug` and
  `Windows`, or a `feature-request` that is `planned`); the cap keeps rows
  scannable; required-tag suits triage forums (force a `bug`/`feature`
  choice at file time) but is wrong for casual ones, so it is a channel
  toggle, not global.
- **Q6 — permissions?** *Recommend: `manage_posts` defines/edits/deletes
  tags; the post author assigns tags to their own post at create/edit (no
  new permission beyond `create_posts`); `manage_posts` can retag anyone's
  post.* Reuse the two existing forum permissions — a third `manage_tags`
  knob is not worth it for a curation surface the same mods already own.
  Moderator retag-anyone is exactly the tracker triage motion (a
  maintainer marks a reported post `planned` → `done`), so it is core, not
  an edge case.

### 10.1 Data model

Additive Postgres migrations in `hub/src/db/migrations.rs` (Wavvon-server),
same conventions as §1.

```
CREATE TABLE IF NOT EXISTS forum_tags (
    id          TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    color       TEXT,                       -- optional hex, nullable
    position    BIGINT NOT NULL DEFAULT 0,  -- admin display order
    created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forum_tags_channel ON forum_tags(channel_id, position);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id  TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES forum_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag_id);

ALTER TABLE channels ADD COLUMN forum_require_tag BOOLEAN NOT NULL DEFAULT FALSE;
```

**Definitions table + join table, not a JSON column on `posts`.** The
`attachments`-JSON precedent (§1) fits opaque per-post blobs nobody queries
across rows. Tags are the opposite: definitions must be enumerable and
editable independently of any post (admin CRUD, color, order), and the list
route filters *by* them. A join table gives an indexed `EXISTS` filter and
FK cascade (delete a tag → its assignments vanish, no app-side sweep) for
free; a JSON `tag_ids` array loses referential integrity and needs manual
cleanup on tag delete. `forum_require_tag` only means anything on
`channel_type='forum'` leaves, like the other forum columns.

**Search story:** tags stay *out* of the `search_vector` generated column
(§1 in code — Postgres tsvector + GIN, which superseded the FTS5 sketch
these docs still describe). Tag filtering is a structured `WHERE` clause on
the join, orthogonal to full-text `MATCH`; combining them is just both
predicates on the list/search query.

**Status labels are just tags (v1).** A tracker's `planned` / `in-progress`
/ `done` are ordinary `forum_tags` rows a moderator sets via retag
(`manage_posts`, Q6). v1 does **not** model a separate "status" tag *group*
with single-select / mutual-exclusion / a distinct column — that is a
second concept (a typed dimension on top of the flat set) for a workflow a
convention already covers: define the status tags, give them a color band,
retag as triage moves. Grouped/exclusive status tags are a §10.7 non-goal;
revisit if flat tags prove too loose for real trackers.

### 10.2 Hub routes

Tag CRUD lives with channel admin (the channel-scoped admin route group,
Wavvon-server); assignment and filtering extend the existing §2 routes.

| Method + path | Purpose | Gate |
|---|---|---|
| `GET /channels/:cid/tags` | List tag definitions | read access |
| `POST /channels/:cid/tags` | Create a tag | `manage_posts` |
| `PATCH /tags/:tid` | Edit label/color/position | `manage_posts` |
| `DELETE /tags/:tid` | Delete tag (cascades assignments) | `manage_posts` |

- `CreatePostRequest` / `EditPostRequest` (`hub/src/routes/post_models.rs`)
  gain `tag_ids: Option<Vec<String>>`. Server validates every id belongs to
  this channel's tag set, enforces the ≤5 cap and `forum_require_tag`, and
  replaces the post's assignments in the same transaction. Omitted on edit =
  unchanged (respect the omitted-vs-null trap, CLAUDE.md).
- `GET /channels/:cid/posts` (`PostListParams`) gains `tag: Option<String>`
  — filter to posts carrying that tag id. Single-tag filter only in v1
  (multi-tag AND/OR deferred). Pin ordering and cursor paging unchanged.
- `PostSummary` / `PostDetail` gain `tags: Vec<TagRef>` where
  `TagRef { id, label, color? }`, populated per post (one batched query over
  the page, not N+1). `#[serde(default)]` so un-upgraded peers parse.

### 10.3 Client UI

All in `clients/packages/ui` (web is source of truth), prop-only per the
package rules.

- **Chips on rows** — `ForumPostRow` (`forum/ForumPostList.tsx`) renders
  `post.tags` as small colored chips next to the title. New `.forum-tag-chip`
  class in the shared `styles.css`.
- **Filter bar** — `ForumPostList` header (which already holds the title +
  "New post" button) gains a row of the channel's tag definitions as toggle
  chips; selecting one sets the `tag` param and reloads via the existing
  `load()` cursor path. "All" clears it.
- **Tag picker** — `ForumComposer` (and the edit path) gains a multi-select
  of the channel's definitions below the title field; reuse the existing
  `settings-section` layout. Enforce the cap client-side; block submit when
  `forum_require_tag` and none chosen.
- **Admin** — tag management goes in `ChannelSettingsModal` (forum channels
  only): a small list editor (label + color + reorder) mirroring the
  role-category editor pattern, plus the require-tag checkbox.
- **`ForumActions`** (`forum/ForumView.tsx`) gains `listTags`, `createTag`,
  `editTag`, `deleteTag`; `createPost`/`editPost` take an optional `tagIds`;
  `listPosts`/`listAlliancePosts` take an optional `tagId` filter. Desktop
  wires these to `invoke()`, web to its `hubFetch` platform layer.

### 10.4 Federation (§9 interaction)

Tags are **channel-local community-axis metadata on the owning hub, passed
through read-only** by the §9 read-through proxy. Alliance forum reads
(`get_alliance_forum_posts` / `..._forum_post`) already ship whatever the
owner's `PostSummary`/`PostDetail` carry, so `tags` and the owner's tag
definitions flow to allied readers for free; filtering runs on the owner
(the `tag` param proxies through). No `forum_tags` rows ever live on a
reader hub — same as posts.

Remote *writes* (the `posts_and_replies` policy) do **not** carry tags in
v1: `FederatedCreatePostRequest` gains no tag field, so an allied author
can't assign the owner's tags. The owner's `manage_posts` mods can tag a
federated post locally. This matches §9's owner-sovereign curation stance
(pin/lock are owner-only for the same reason). Remote tag assignment is
deferred.

### 10.6 Bot access (tracker use case)

A bot is a `users` row with `is_bot=1` that authenticates and holds a
session like any principal ([bot-capability-layer.md](bot-capability-layer.md)).
So it already reaches the forum REST routes its channel access and roles
permit — the §10.2 surface needs **no bot-specific addition**:

- **Read posts + tags** — `GET /channels/:cid/posts`, `GET /posts/:pid`,
  `GET /channels/:cid/tags` are gated on channel read access only. A bot
  invited to the tracker channel reads reports and their tags today. (Full
  post *bodies* over the *push* path would ride the same
  `can_read_message_content` redaction as messages — see the v1 stance;
  over REST there is no redaction, same as a member reading the channel.)
- **Retag** — a bot granted a role carrying `manage_posts` retags any
  post via the §10.2 assignment path (`PATCH /posts/:pid` with `tag_ids`),
  exactly like a human moderator. This is the triage motion: bot reads a
  new `bug` report, sets `planned` → `done`. No new permission; reuse Q6.

**v1 stance — bots ride the same HTTP routes; no forum push events.** The
bot event layer (`bots/events.rs` `emit_bot_event` + `bot_subscriptions`,
Wavvon-server) dispatches audit-backed `message.*` events to subscribed
bots, but `posts.rs` emits **only client WS** post/reply events (§3, §6) —
it never calls the bot dispatch path, and there is no forum event type in
the subscription registry. So a triage bot **polls** `GET
/channels/:cid/posts` (sorted by `last_activity_at`, §2) in v1; it does not
get pushed a new bug report. Adding push later is additive and cheap —
emit `post.created` / `post.reply_created` through the existing
`emit_bot_event` path and extend the `can_read_message_content` redaction
to `post.*` — but it is a §10.7 non-goal until a bot actually needs
sub-poll latency.

### 10.7 Non-goals (v1)

- Free-form / user-authored tags (Q1).
- Multi-tag AND/OR filter combinations — single-tag filter only.
- Tag-based notifications ("follow a tag") — no forum notification changes
  (§6 stays as-is).
- Cross-channel tag taxonomies or shared tag sets — tags belong to one
  channel.
- Federated (remote-hub) tag assignment (§10.4).
- Tag icons/emoji or per-tag use-permissions — label + optional color only.
- Grouped / single-select "status" dimension — status is flat tags (§10.1).
- Forum push events to bots — triage bots poll the REST routes (§10.6);
  `post.*` event dispatch is a later additive add.
