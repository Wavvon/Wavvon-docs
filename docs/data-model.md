# Data Model

The hub uses PostgreSQL (via sqlx). Schema migrations run automatically at
startup from the hub crate (`Wavvon-server: crates/hub/src/db/migrations.rs`).
This page is a map, not the schema — read the migrations file for column-level
detail.

## Tables by concern

### Identity & membership
- `users` — pubkey-keyed user rows local to this hub
- `roles`, `role_permissions`, `user_roles` — role bundles + assignments
  (`member_roles` is a view over `user_roles`)
- `hub_settings` — single-row config for this hub
- `bans`, `mutes`, `channel_bans` — moderation state (a timeout is a mute
  with `expires_at`; there is no `timeouts` table)

### Channels & messages
- `channels` — **one table for both categories and rooms**.
  `is_category` boolean splits them; `parent_id` (self-referential) lets
  any channel nest under another. `channel_type` is `text`, `voice`,
  `forum`, `banner` or `spawner`; voice happens only in `voice` channels
  (see [decisions.md](decisions.md), "Voice lives in voice channels").
- `messages` — local channel messages (text history)
- `message_reactions` — emoji × message × user
- `attachments` + `attachment_blobs` — an attachment row per use, a
  deduplicated blob per content hash; bytes live on disk, uploaded via
  `POST /channels/{id}/upload` and served at `GET /uploads/{id}`. A banner
  channel points at an image attachment via `channels.banner_file_id`.
  Design in [attachments.md](attachments.md).
- (mention tracking is computed from message bodies, not a separate
  table)

Voice is **runtime state**, not a table — `state.voice_channels` is an
in-memory map of `channel_id → public keys currently connected` (with
their WebTransport sessions).
There's no persistent record of who was in voice when.

### DMs
- `conversations`, `conversation_members` — 1:1 and group DM threads
- `dm_messages` — local DM messages (both inbox and sent)
- `dm_outbox` — pending outbound federated DMs (the worker drains this)

### Federation
- `peers` — hubs we know about (URL + pubkey)
- `federated_messages` — cached messages pulled from peer hubs

### Alliances
- `alliances` — id + metadata
- `alliance_members` — hub pubkeys per alliance
- `alliance_shared_channels` — which local channels we share

Three-state notification modes (all / mentions / silent) have no hub
table: they are client-side preferences.

This list is a map of the core concerns, not an inventory — later
features added more tables (`channel_pins`, `polls`/`poll_votes`,
`hub_events`/`event_rsvps`, forum `posts`, `post_reads`, recovery and
pairing tables, …). The migrations file is the authoritative list.

## Conventions

- **IDs are TEXT** — UUID strings, generated client- or server-side
  depending on the resource.
- **Timestamps are BIGINT** — unix seconds (or ms in some places; check
  the column).
- **Pubkeys are TEXT** — hex-encoded Ed25519 pubkey.
- **No cross-table foreign keys to peer hubs**. Federated rows reference
  remote ids by string only — the source hub is authoritative.

## Migration strategy

A frozen, idempotent baseline runs on every start; every later change is a
numbered step, run once in a transaction and recorded in `schema_version`.
A database newer than the binary is refused. Until 1.0 a step may be
destructive; from 1.0 steps are additive only. See [decisions.md](decisions.md),
"The hub schema carries a version".

## Querying

Query code lives in `Wavvon-server: crates/hub/src/routes/` next to the
endpoint that owns the data. There's no separate repository layer — queries
are inline runtime `sqlx::query` / `query_as` calls (no compile-time
`query!` macros).
