# Data Model

The hub uses PostgreSQL (via sqlx). Schema migrations run automatically at
startup via the `store` crate (`store/src/migrations.rs` in Wavvon-server).
This page is a map, not the schema — read the migrations file for column-level
detail.

## Tables by concern

### Identity & membership
- `users` — pubkey-keyed user rows local to this hub
- `roles`, `role_permissions`, `user_roles` — role bundles + assignments
- `hub_settings` — single-row config for this hub
- `bans`, `mutes`, `timeouts` — moderation state

### Channels & messages
- `channels` — **one table for both categories and rooms**.
  `is_category` boolean splits them; `parent_id` (self-referential) lets
  any channel nest under another. **No `kind` column** — every non-
  category channel is unified text + voice (see [decisions.md](decisions.md)).
- `messages` — local channel messages (text history)
- `reactions` — emoji × message × user
- `upload_files` — metadata for files uploaded via
  `POST /channels/:channel_id/upload` (multipart, 25 MB cap; bytes live
  on disk under `WAVVON_UPLOADS_DIR`, default `./uploads/`, served back
  at `GET /uploads/:filename`). Clients reference an upload by URL via
  the `RemoteAttachment` wire type. Channels can point at an upload as
  their banner via `channels.banner_file_id`.
- Small attachments can also ride **inline** as a JSON column on
  `messages` (`Attachment` wire type: base64 bytes, 3 MB cap summed per
  message — see `hub/src/routes/chat_models.rs` in Wavvon-server). The
  upload path is the one for anything bigger.
- (mention tracking is computed from message bodies, not a separate
  table)

Voice is **runtime state**, not a table — `state.voice_channels` is an
in-memory map of `channel_id → set of public keys currently connected`.
There's no persistent record of who was in voice when.

### DMs
- `dms` — local DM messages (both inbox and sent)
- `dm_outbox` — pending outbound federated DMs (the worker drains this)

### Federation
- `peer_hubs` — hubs we know about (URL + pubkey)
- `federated_messages` — cached messages pulled from peer hubs

### Alliances
- `alliances` — id + metadata
- `alliance_members` — hub pubkeys per alliance
- `alliance_shared_channels` — which local channels we share

### Notifications & prefs
- `notification_settings` — three-state per scope (all / mentions / silent)

This list is a map of the core concerns, not an inventory — later
features added more tables (`channel_pins`, `polls`/`poll_votes`,
`hub_events`/`event_rsvps`, forum `posts`, `post_reads`, recovery and
pairing tables, …). The migrations file is the authoritative list.

## Conventions

- **IDs are TEXT** — UUID strings, generated client- or server-side
  depending on the resource.
- **Timestamps are INTEGER** — unix seconds (or ms in some places; check
  the column).
- **Pubkeys are TEXT** — hex-encoded Ed25519 pubkey.
- **No cross-table foreign keys to peer hubs**. Federated rows reference
  remote ids by string only — the source hub is authoritative.

## Migration strategy

Migrations are idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE`
statements. We do not version-stamp the schema. New tables/columns
are added; we don't drop or rename in place.

## Querying

All query code is in `hub/src/routes/*.rs` (Wavvon-server) next to the
endpoint that owns the data. There's no separate repository layer — sqlx
queries are written inline with `sqlx::query!`/`query_as!` macros for
compile-time checking.
