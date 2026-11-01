# Stickers

**Status: designed 2026-11-01, not built.** Rationale is in
[decisions.md](decisions.md): "Stickers: a personal collection, a copy on
every hub that shows one". Code paths are in Wavvon-server unless named
otherwise.

A hub publishes sticker packs (the Discord shape). A member saves any sticker
seen on any hub into a personal collection and sends it anywhere (the
Telegram shape). The second half is the hard one in a federated system.

**GIFs are not part of this.** A link to a GIF shows through the existing
link preview, which the hub fetches so that no reader's IP leaves it, and a
GIF file can be sent as an ordinary attachment (decisions.md, "No GIF
feature"). Attachments themselves are still base64 inside the `messages` row
(`crates/hub/src/routes/messages.rs:112-139`). Moving them to disk is a
separate design.

## 1. The rule that shapes everything

**A message references a sticker stored on the hub that holds the message.**
Never on the sender's home hub, and never on the hub the sticker came from.

- A reader's client fetches images from the hub it is reading. Pointing it at
  another hub hands that hub the reader's IP, and the sticker vanishes when
  that hub is down. Link-preview images and masquerade avatars are re-hosted
  for the same reason (`routes/preview.rs`, `Masquerade::with_hosted_avatar`).
- The hub that shows content moderates it. A copy on hub B is B's to delete;
  a link to hub A is not.

So sending a saved sticker to hub B **uploads a copy to B**. It is
deduplicated by the hash of the normalized image (§3), so a second sender
uploads nothing.

## 2. Two axes, kept apart

| What | Axis | Lives in |
|---|---|---|
| Packs, and the copies that sends create | community | that hub (§3) |
| A member's saved collection | personal | the prefs blob on the home hub(s) |
| The bytes of a saved sticker | neither, by design | any hub that has them, plus the client's cache |

**The home hub stores the list, never the bytes.** Each entry is `{sha256,
name, source_hub_url, origin_hub_url, saved_at}`: `source` is where it was
seen, `origin` is where it was first published. The list rides the encrypted
prefs blob like block lists and themes ([home-hub.md](home-hub.md)), so the
home hub learns neither what you keep nor how much.

Bytes stay out of the blob because it is rewritten whole on every settings
change (Wavvon-clients: `apps/web/src/utils/prefsSync.ts`). The cost: a saved
sticker that no reachable hub or device cache still holds is gone, and the
picker says so.

**v1: only the device holding the phrase can edit the collection.** The blob
is master-signed, and the web client does not hand its key to a paired device
(`prefsSync.ts:96-103`).

## 3. Storage, disk and limits

These are in [sticker-storage.md](sticker-storage.md). In short:

- every sticker is normalized to WebP, stripped of metadata, then hashed by
  the hub, and dedup is on that exact hash;
- packs have a cap that refuses additions;
- copies are a cache that evicts orphans and then least-recently-used copies,
  so a send is never refused for space;
- every limit is a hub setting under `hub.settings`, and none is per member.

## 4. Permissions

These are dedicated ids, as the soundboard has `voice.soundboard.manage`
(`permissions.rs:88-89`). Custom emoji borrow `hub.appearance`; stickers do
not. Defaults are seeded in a **numbered migration step**: the per-boot
baseline re-grants its rows at every start (`db/migrations.rs:616-630`).

| Id | Scope | Default | Gates |
|---|---|---|---|
| `stickers.packs.manage` | Hub | owner | create, rename and delete packs; add and remove their stickers, including "add to a pack" from a sticker seen in chat |
| `stickers.external` | HubAndChannel | `builtin-everyone` | upload a copy; send a sticker that is in no pack |
| `stickers.moderate` | Hub | owner | the stored-sticker admin page: delete, block, unblock |

Sending also needs `messages.send`. Revoking `stickers.external` from everyone
means "only our own packs", like Discord's *Use External Stickers*; channel
scope allows external stickers in #memes only. The upload is gated as well as
the send, as `routes/uploads.rs:77-82` reasons.

## 5. Admin page and endpoints

One page lists **everything stored**: pack stickers and the copies that sends
created. Each row shows size, uploader, origin hub, last used and how many
messages reference it. The page header shows both budgets against their caps,
the packs warning, and the eviction count. Actions under `stickers.moderate`:

- **Delete** ("sticker removed").
- **Delete and block**: the hash also goes on the blocklist, so the same
  normalized image is refused at any later ingest.
- **Unblock.**

A block catches only the exact image. The phase-2 perceptual hint is what
would flag a re-encoded variant to a moderator.

```
GET    /stickers/packs                           packs + stickers        (member)
POST   /stickers/packs {name} · PATCH|DELETE /stickers/packs/{id}        (stickers.packs.manage)
POST   /stickers/packs/{id}/stickers  multipart file, name | {sha256}    (stickers.packs.manage)
DELETE /stickers/packs/{id}/stickers/{sticker_id}                        (stickers.packs.manage)
HEAD   /stickers/{sha256}                        200 / 404               (public)
GET    /stickers/{sha256}                        bytes                   (public)
POST   /channels/{id}/stickers  multipart file, name, origin_hub_url     (messages.send + stickers.external)
         -> {id, sha256}; 200 with the existing row when the hash is known
POST   /channels/{id}/messages  + sticker_id
GET    /admin/stickers?state=&uploader=&sort=&limit=&cursor=             (stickers.moderate)
GET    /admin/stickers/usage                     both budgets, evictions (stickers.moderate)
DELETE /admin/stickers/{id}?block=true                                   (stickers.moderate)
GET    /admin/stickers/blocklist · DELETE /admin/stickers/blocklist/{sha256}
```

`{sha256}` on a pack means "add the copy already here". The lists use the
hub's paging dialect (`limit`, keyset `cursor`). A hash-addressed public URL
lets anyone ask whether a hub holds an image, which joining answers anyway.

`send_message_with` (`routes/messages.rs:92`) is the one choke point for local
and alliance-forwarded sends, so all the checks sit there:

- the sticker exists and is not tombstoned;
- a copy needs `stickers.external`;
- `last_used_at` is bumped;
- the alliance path refuses `sticker_id` in v1.

Responses and the WebSocket broadcast carry `sticker {id, name, url, sha256,
width, height, origin_hub_url, state}`. `openapi.yaml` gains every route.
**Capability string: `stickers`.**

## 6. Client flow

**Sending** a saved sticker to hub B:

1. `HEAD /stickers/{sha256}` on B. If present, go to step 4.
2. Take the bytes from the local cache, otherwise from `GET` on the entry's
   `source_hub_url`. If neither has them, the sticker is "no longer
   available".
3. `POST /channels/{id}/stickers` on B, with `origin_hub_url`.
4. Send with `sticker_id`.

Step 1 matches across hubs because canonical WebP is kept byte for byte
(sticker-storage.md §1).
A 403 means "this hub allows only its own stickers", and the picker greys out
saved stickers where `stickers.external` is missing. A send is never refused
for space; only a file over `stickers_max_file_bytes` is.

**Two save actions on a sticker in chat**, on different axes:

- *Save to my collection* (personal).
- *Add to a pack* (community, `stickers.packs.manage`).

The collection is a typed `stickers` field in `PrefsBlobContents`
(Wavvon-clients: `packages/core/src/identity/master.ts:51`). Desktop's
`LocalPrefs` (`apps/desktop/src-tauri/src/prefs_blob.rs:13`) **drops fields
it does not know**, so it must carry the new one forward, or a push from
desktop erases the collection.

- **Picker:** Saved, then this hub's packs.
- **Rendering:** a fixed size, "from <host>" when there is an origin, and a
  tombstone's sentence.
- **Admin:** packs, the stored-sticker page and the settings, in the shared
  hub admin page.

## 7. Deferred and open

Deferred:

- **Alliance channels**, which need the image proxied too.
- **DMs**, where a sticker would be an end-to-end encrypted attachment.
- The perceptual hint, saving a whole pack, and pack share links.

Open question (the storage ones are in sticker-storage.md §5):

1. **Verify `origin_hub_url`?** It is the sender's claim, shown as plain text
   and never followed. Checking would cost one server-to-server `HEAD` per new
   copy.
