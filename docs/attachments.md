# Attachments: disk, dedup, content checks, retention

**Status: built 2026-11-01 on the hub** ([Wavvon-server#261](https://github.com/Wavvon/Wavvon-server/pull/261))
and in the clients (Wavvon-clients#227: messages and forum send
`attachment_ids`; `packages/ui` renders `StoredAttachment.tsx` and the admin
`AttachmentSettingsSection.tsx`). §8's inline fix is in too: the hub refuses
`attachments` beside an encrypted DM (`routes/dms/messages.rs`).
Rationale is in [decisions.md](decisions.md), "Attachments move to disk; a
full disk expires the oldest, never refuses a member". Code paths are in
Wavvon-server unless named otherwise. It shares its ingest rules with
[sticker-storage.md](sticker-storage.md).

## 0. What was there before 2026-11-01

History: the state this design replaced. Line references are to that code.

- **Messages** carry base64 with the declared `mime` in `messages.attachments`
  (`crates/hub/src/routes/chat_models.rs:135-144`, `routes/messages.rs:112-139`);
  clients render a `data:` URL (Wavvon-clients: `packages/ui/src/components/Attachments.tsx:52`).
- **Forum posts** store a client-supplied `{url, name, mime, size}` verbatim
  (`routes/posts.rs:305-311`): an image from anywhere.
- **`POST /channels/{id}/upload`** (`routes/uploads.rs:61-217`) trusts the
  declared type and serves by extension (`uploads.rs:258-272`). Banners store
  `upload_files.id` (`routes/channels.rs:448-463`) and clients request
  `/uploads/{banner_file_id}` (`packages/ui/src/components/SortableItems.tsx:212`),
  but the file is named after another UUID (`uploads.rs:171` vs `:189`), so an
  uploaded banner looks unreachable. §3 fixes that by construction.
- **DMs** have their own inline path (`routes/dms/messages.rs:134-148`), and
  an encrypted DM sends its attachments **in the clear** beside the envelope
  (§8).

## 1. One route, one table

The upload route stays the only way bytes enter, for messages, forum posts
and banners alike. `upload_files` is replaced, not joined by a second family
(server CLAUDE.md: duplicate endpoints get folded).

```
attachment_blobs  sha256 PK, kind ('image'|'file'), mime, size_bytes,
                  width NULL, height NULL, created_at, last_linked_at
attachments       id PK (random UUID; the URL), sha256 NULL -> attachment_blobs
                  ON DELETE SET NULL, name, uploader, channel_id -> channels
                  ON DELETE CASCADE, message_id NULL -> messages ON DELETE CASCADE,
                  post_id NULL, reply_id NULL (same cascade), as_file BOOL,
                  created_at, removed_at NULL, expired_at NULL
```

- **One upload is one row, linked to one message.** Dedup happens one level
  down: the same file sent twice is two rows and one blob.
- **The URL is the row id, not the hash.** A hash-addressed public URL lets
  anyone holding a file ask whether this hub holds it, private channels
  included. Stickers accept that because packs are public; attachments don't.
- **Bytes** live at `{WAVVON_UPLOADS_DIR}/attachments/<sha256>`, apart from
  soundboard clips and avatars; `backup`/`restore` already carry the whole
  directory (`main.rs:1845-1848`, `:1979-1983`).
- **Two tombstones**, as for stickers, both keeping the row and its name:
  `removed_at` (a moderator, under `messages.manage`: "attachment removed")
  and `expired_at` (retention or the budget, §4: "attachment expired").
- A deleted message is a hard `DELETE` (`messages.rs:606`), so its rows
  cascade; a blob with no live row left loses its bytes.
- One numbered step in `db/migrations.rs` (§7), never the baseline.

## 2. Ingest: sniff, normalize, hash

1. **The declared type is never trusted; the magic bytes decide.** The
   allow-list is of what may be **shown inline**: PNG, APNG, JPEG, GIF, WebP,
   after step 2. Everything else, **executables and SVG included**, is stored
   as is and only ever downloaded (§3); unknown formats as
   `application/octet-stream`. An extension that names a different type than
   the bytes (a `.png` that is a PE binary) is refused with 415. HEIC and
   AVIF are files (no pure-Rust decoder).
2. **Images are re-encoded** by the sticker pipeline, one function with a
   larger fixed maximum dimension (4096 px long edge; not a setting, per
   sticker-storage.md §5): PNG and still GIF to lossless WebP, JPEG to JPEG
   (quality 85; the only encoder that needs no C toolchain writes lossless
   WebP, which makes a photo several times larger), animations to animated
   WebP. Decoding runs under
   pixel and frame limits (decompression bombs), in `spawn_blocking` behind a
   small semaphore. EXIF, location and anything appended after the image go.
3. **Unless the member sends it as a file** (`as_file` form field): bytes
   stored as they are, only ever served as a download, and the client says
   "location and camera details stay in the file". Telegram's "send as
   file": the full-quality original, without the hub keeping two copies.
4. **SHA-256 of the stored bytes, computed by the hub**, then dedup on the
   exact hash. The response never says whether the blob already existed.

Video and audio are stored as uploaded; their metadata is not stripped in v1.

## 3. Serving: `GET /uploads/{id}`

The path stays; it now resolves an `attachments` row, which also makes the
banner URL the clients already build correct.

- Always `X-Content-Type-Options: nosniff`, `Content-Security-Policy:
  default-src 'none'; sandbox`, `Cache-Control: private, max-age=31536000,
  immutable`.
- A re-encoded image: `image/webp`, `inline`. Everything else, SVG,
  executables and images sent as files included, never inline:
  `Content-Disposition: attachment; filename*=UTF-8''<name>` with the sniffed
  type (`text/plain; charset=utf-8` for text).
- A tombstone answers **410**, an unknown id 404.
- **Public, as today**: an `<img>` sends no token; the id is a random UUID.
- Masquerade avatars stay `remote-<hash>.<ext>` files
  (`routes/preview.rs:445-466`), matched by that prefix until they too go
  through §2 (deferred).

## 4. Retention and the disk budget

**Retention.** `attachments_retention_days`, default never. The retention
worker (`retention_worker.rs`) marks older rows `expired_at` and deletes blobs
left with no live row (per-channel message retention cascades as is). It also
deletes **orphans**, rows not attached to anything within 24 hours: a
cleanup delay, so a constant.

**The budget.** `attachments_cap_bytes` limits the sum of blob sizes. **A
member is never refused for space, and no limit applies per member.** When an
ingest would cross the cap, the hub frees room first, under one hub-wide lock:

1. orphans;
2. then whole blobs in `last_linked_at` order, oldest first, skipping banner
   blobs. Every row pointing at an evicted blob becomes "attachment expired".

This is retention arriving early, in the same order: old attachments go
first. At `attachments_warn_percent` the hub admin page warns; usage, cap and
eviction count are in `GET /hub` (admin fields) and `/metrics`.

**A full disk is the one honest exception.** If a write fails for lack of
space before the cap (a cap set above the free disk), the hub evicts once more
and retries once. If the disk is full of something else, the upload fails
with 507, logged loudly: the hub is broken, no setting can create disk.

## 5. Limits

Hub settings like `max_attachment_bytes` (default, floor and ceiling in code;
`PATCH /hub` under `hub.settings`, `routes/hub.rs:153-175`). Each limits a
file, a message or the hub, never a member.

| Setting | Default | Floor | Ceiling | At the limit |
|---|---|---|---|---|
| `max_upload_bytes` (exists) | 25 MB | 1 MB | 25 MB | that file refused (413) |
| `max_attachments_per_message` | 10 | 1 | 25 | that message refused |
| `attachments_cap_bytes` | 10 GB | 64 MB | 10 TB | oldest expire; the upload succeeds |
| `attachments_warn_percent` | 90 | 50 | 99 | admin warning |
| `attachments_retention_days` | 0 = never | 0 | 3650 | older attachments expire |

The cap's floor exceeds two maximum files, so eviction can always make room.
`max_attachment_bytes` stays, for DMs only (§8); the banner limit
(`uploads.rs:19`) stays a constant.

## 6. Sending and reading

- `POST /channels/{id}/messages` takes `attachment_ids` instead of
  `attachments`. `send_message_with` (`messages.rs:92`) checks each id: it
  exists, the sender uploaded it, it was uploaded to this channel, it is not
  linked yet and not tombstoned, and the count is within the setting. Forum
  posts and replies take `attachment_ids` the same way, which ends
  client-asserted URLs.
- Responses and the WebSocket broadcast carry
  `attachments: [{id, url, name, mime, kind, size, width, height, state}]`,
  with `url` relative to the hub that holds the message.
- **Alliance reads**: the reader's hub rewrites `url` to
  `/alliances/{aid}/uploads/{id}` and streams it from the owning hub, storing
  nothing, so the reader never contacts a hub it did not choose (stickers.md
  §1). An alliance *send* to a channel another hub
  owns carries text only, so one with `attachment_ids` is refused with 400
  rather than posted without its files.
- `DELETE /uploads/{id}` tombstones one attachment (`messages.manage` on the
  channel). `openapi.yaml` gains every change; the SDKs regenerate from it.
- **Capability string: `attachments.stored`.**

## 7. Clients and migration

Wavvon-clients, in `packages/ui` so web and desktop get it together:

- The composer uploads each file through the upload route (web
  `apps/web/src/platform/commands/uploads.ts`, desktop's existing
  `upload_file_bytes` command, `apps/desktop/src-tauri/src/messages.rs:863`),
  then sends ids. Pending previews use object URLs, not base64.
- `MessageAttachments` renders `<img src={hubUrl + url}>` with width and
  height, a download link otherwise, and the two tombstone sentences. An image
  pending upload has a "send as file" toggle with the notice from §2.
- **Executable warning** before following a download link whose name ends in
  one of: `exe msi msix appx bat cmd com scr pif cpl ps1 psm1 vbs vbe js jse
  wsf wsh hta lnk reg jar sh command app dmg pkg deb rpm appimage apk iso img
  docm xlsm pptm svg`. One constant in `packages/ui`. The hub accepts these,
  so the warning is the member's only prompt; the headers in §3 make sure a
  browser never runs one in the hub's origin.
- Hub admin page: the new settings, a usage bar and the warning.
- Without `attachments.stored` the attach button is hidden. Inline
  `data_b64` from an older hub still renders.

**Migration: tombstones, no conversion.** Alpha, no backward compatibility.
The step creates the two tables and writes one expired row per inline or
forum attachment (name kept, no blob), then drops `messages.attachments`,
`posts.attachments`, `post_replies.attachments` and `upload_files`, and sets
`channels.banner_file_id` to NULL. Old messages read "attachment expired:
photo.jpg". Operator step for the release notes: re-upload banners, and old
`<uuid>.<ext>` files in the uploads directory can be deleted.

## 8. Encrypted DMs

*(The inline fix below has shipped: `dms/messages.rs` answers 400
`attachments_must_be_encrypted`. The paragraph describes the bug as found.)*

**The spec is right; the code never followed it.** e2e-encryption.md,
"Attachment encryption", puts attachments inside the encrypted plaintext
`{content, attachments?}`. Both clients encrypt `{content}` alone
(Wavvon-clients: `packages/core/src/identity/crypto.ts:126,298`, desktop
`src-tauri/src/dm.rs:1113,1502`) and post the attachments in the clear beside
the envelope (`apps/web/src/platform/commands/dms.ts:362`, `dm.rs:319-328`),
and the hub stores them (`routes/dms/messages.rs:211-241`).

**Fix it first, inline, apart from this design**, so the leak stops before
files move to disk: clients put attachments in the plaintext, and the hub
refuses `attachments` beside an encrypted envelope and caps the ciphertext
instead. The signature already covers the ciphertext (`dms/messages.rs:188`),
so the identity crate and `wire-vectors.json` do not change.

**Files on disk later, deferred.** The client encrypts each file under a
fresh random key and uploads the ciphertext through the same upload handler,
scoped to the conversation: an *opaque* blob, never sniffed, re-encoded or
inline. The encrypted plaintext carries `{upload id, key, nonce, plaintext
SHA-256, name, mime, size}`, so the hub learns only a size. The client strips
image metadata itself, since the hub cannot. Unsolved, and the reason it is
deferred: a DM is mirror-forwarded to the recipient's home hubs
([home-hub.md](home-hub.md)), so the blob has to travel with it, or a reader
fetches from a hub they never chose.

## 9. End to end, deferred, open

**What needs the real binary.** Wavvon-server `e2e/`: the migration step on a
database holding inline attachments, eviction at a cap set to its floor,
backup and restore carrying blobs, the served headers. Across hubs, with a
real browser: an alliance visitor sees the host's image while its browser
never requests the host; a farm-hosted hub serves `/hub/<slug>/uploads/{id}`;
and the image has `naturalWidth > 0`, which only a decoded image moves.

**Deferred:** DM files on disk (§8), signed expiring URLs, a hash blocklist
like stickers', audio and video players, video metadata stripping, ingesting
masquerade avatars.

**Open:** whether libwebp builds for musl (shared with sticker-storage.md §5).
