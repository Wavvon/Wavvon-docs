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
- **Granularity decision**: unread is tracked at the **channel** level,
  not per-post, for v1. The forum row pins like any channel; opening the
  channel (the post list) clears it. Per-post unread state (a dot on
  individual posts you haven't opened, "new replies since you last
  viewed") needs per-post read cursors — **deferred**. This keeps forums
  inside the existing one-pin-per-channel model with zero new
  notification state. `firstNotifyingMessageId`
  ([decisions.md](decisions.md)) has no forum analogue in v1; "jump to
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

- **Federation**: posts/replies federating over alliance shared channels
  ([federation.md](federation.md)). v1 is local-only. The federation
  envelope would gain `post` / `post_reply` event types alongside
  `message`; designed once the local model is stable.
- **Per-post unread / read cursors**: per-post "new" dots and "N new
  replies since you looked." Needs per-(user, post) read state. v1
  tracks unread at the channel level only (section 6).
- **Reactions on posts and replies**: the `reactions` table is
  message-keyed; extending it to posts is a follow-on, not v1.
- **Attachments on posts/replies**: messages store attachments inline as
  a JSON column ([data-model.md](data-model.md)); the same approach fits
  posts but is out of scope for v1.
- **Rich formatting beyond the existing markdown**: forums reuse the
  message markdown subset; no forum-specific rich text, no embeds.
- **Channel type conversion** (`text` ⇄ `forum` on an existing
  channel): the type is fixed at creation. Conversion has to answer
  "what happens to the existing message stream / posts," which is its
  own design.
- **Post tags / categories within a forum** and **post drafts**:
  wishlist, not designed.
- **Cross-channel / hub-wide forum search**: per-channel only in v1.
