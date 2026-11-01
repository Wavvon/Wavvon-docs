# Stickers

**Status: designed 2026-11-01, not built.** Rationale is in
[decisions.md](decisions.md): "Stickers: a personal collection, a copy on
every hub that shows one". Code paths are in Wavvon-server unless named
otherwise.

A hub publishes sticker packs (the Discord shape). A member saves any sticker
seen on any hub into a personal collection and sends it anywhere (the
Telegram shape). The second half is the hard one in a federated system.

**GIFs are not part of this**: they stay link previews and attachments
(decisions.md, "No GIF feature"). Moving attachments, still base64 in the
`messages` row (`crates/hub/src/routes/messages.rs:112-139`), to disk is a
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

So sending a saved sticker to hub B makes **B hold a copy**. B fetches the
copy itself, **from the hub that published it** (§3), and dedups it by the
hash of the normalized image, so the second send fetches nothing.

## 2. Two axes, kept apart

| What | Axis | Lives in |
|---|---|---|
| Packs, and the copies that sends create | community | that hub ([sticker-storage.md](sticker-storage.md)) |
| A member's saved collection | personal | the prefs blob on the home hub(s) |
| The bytes of a saved sticker | community | the origin hub's pack, and copies on hubs where it was sent |

**The home hub stores the list, never the bytes.** Each entry is `{sha256,
name, origin_hub_url, origin_hub_name, saved_at}`. The origin is the hub
whose pack the sticker belongs to, and it is verified (§3). The list rides
the encrypted prefs blob like block lists and themes
([home-hub.md](home-hub.md)), so the home hub learns neither what you keep
nor how much.

Bytes stay out of the blob because the blob is rewritten whole on every
settings change (Wavvon-clients: `apps/web/src/utils/prefsSync.ts`). The
client keeps no byte cache either: a hub only ever takes a sticker from its
origin.

**v1: only the device holding the phrase can edit the collection.** The blob
is master-signed, and the web client does not hand its key to a paired device
(`prefsSync.ts:96-103`).

## 3. A hub fetches a sticker from its origin

When a member sends a saved sticker on hub B and B lacks it:

1. **B fetches** `GET {origin}/federation/stickers/{sha256}`.
   - B goes through the hub's SSRF-checked fetcher (`fetch_capped`,
     `routes/preview.rs:244`), because the origin URL comes from a member.
   - It is capped at `stickers_max_file_bytes` and shares the link-preview
     rate limit (`preview.rs:238`). That limit bounds outbound traffic; it is
     not a storage quota.
2. **B checks** that the bytes hash to the requested `sha256` and come out
   unchanged from its canonical-WebP pass-through (sticker-storage.md §1).
   Anything else is refused.
3. **B ingests the bytes and records `origin_hub_url` as verified**: B itself
   fetched the hash from there. B reads the origin's name from its `/info`.

**The origin serves only its own pack stickers.** A copy of a copy therefore
always comes from the origin, which keeps the origin's choices enforceable:
removing a sticker, or turning export off. The cost is accepted, because
there is no client upload path. If the origin is offline, or has removed the
sticker, a hub that does not already hold it cannot get it. The same goes for
a copy evicted for space (sticker-storage.md §3): it comes back only while
the origin still serves it.

**Unauthenticated, deliberately.** Hub-to-hub auth (a hub-key challenge with
`is_hub: true`, `federation/client.rs:39-90`, with the token cached per URL,
`federation/mod.rs:11-26`) proves only a self-chosen key
(`auth/middleware.rs:44-49`). The origin already serves the same bytes
publicly at `GET /stickers/{sha256}`. And the handshake's plain `reqwest`
client (`client.rs:22-26`) would reach a member-chosen URL with no SSRF
check.

**Export.** The hub setting `stickers_export` (default **on**, because hubs
want to advertise themselves; `hub.settings`) answers "let other hubs use our
stickers". Off, the federation route answers 403. This is a **deterrent, not
DRM**. Anyone who saw a sticker has its pixels and can post them as a plain
attachment, and the public image route still serves readers. What export off
prevents is the sticker flow and the origin label. Copies other hubs already
hold are their content and stay.

**The origin label advertises.** A sticker from elsewhere shows "from <origin
hub name>", linking to the origin's public preview (its `/info`, and its
invite if it publishes one).

Storage, normalization, the two disk budgets and every limit are in
[sticker-storage.md](sticker-storage.md).

## 4. Permissions

These are dedicated ids, as the soundboard has `voice.soundboard.manage`
(`permissions.rs:88-89`). Custom emoji borrow `hub.appearance`; stickers do
not. Defaults are seeded in a **numbered migration step**: the per-boot
baseline re-grants its rows at every start (`db/migrations.rs:616-630`).

| Id | Scope | Default | Gates |
|---|---|---|---|
| `stickers.packs.manage` | Hub | owner | create, rename and delete packs; add and remove their stickers, including "add to a pack" from a sticker seen in chat |
| `stickers.external` | HubAndChannel | `builtin-everyone` | make this hub fetch a sticker from another hub; send a sticker that is in no pack |
| `stickers.moderate` | Hub | owner | the stored-sticker admin page: delete, block, unblock |

Sending also needs `messages.send`. Revoking `stickers.external` from everyone
means "only our own packs", like Discord's *Use External Stickers*.

**The admin UI shows it as a plain hub toggle**, "Allow stickers from other
hubs", mapped to `stickers.external` on `builtin-everyone`, so an admin never
needs the permission model. Changing it needs `roles.manage`, like any role
edit. Per-channel control stays available through the permission. The fetch
is gated as well as the send, as `routes/uploads.rs:77-82` reasons.

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
GET    /stickers/{sha256}                        bytes                   (public)
GET    /federation/stickers/{sha256}    own pack stickers only; 403 export off (public)
POST   /channels/{id}/stickers  {sha256, origin_hub_url}                 (messages.send + stickers.external)
         -> {id}: 200 already here, 201 fetched from the origin, 502 origin unavailable
POST   /channels/{id}/messages  + sticker_id
GET    /admin/stickers?state=&uploader=&sort=&limit=&cursor=             (stickers.moderate)
GET    /admin/stickers/usage                     both budgets, evictions (stickers.moderate)
DELETE /admin/stickers/{id}?block=true                                   (stickers.moderate)
GET    /admin/stickers/blocklist · DELETE /admin/stickers/blocklist/{sha256}
```

`{sha256}` on a pack means "add the copy already here"; that sticker then
counts as this hub's own. The lists use the hub's paging dialect (`limit`,
keyset `cursor`). A hash-addressed public URL lets anyone ask whether a hub
holds an image, which joining answers anyway. `POST /channels/{id}/stickers`
on a hash that is one of this hub's own pack stickers needs no
`stickers.external`.

`send_message_with` (`routes/messages.rs:92`) is the one choke point for local
and alliance-forwarded sends, so all the checks sit there:

- the sticker exists and is not tombstoned;
- a copy needs `stickers.external`;
- `last_used_at` is bumped;
- the alliance path refuses `sticker_id` in v1.

Responses and the WebSocket broadcast carry `sticker {id, name, url, sha256,
width, height, origin_hub_url, origin_hub_name, state}`. `openapi.yaml` gains every route.
**Capability string: `stickers`.**

## 6. Client flow

**Sending** a saved sticker to hub B takes two calls:

1. `POST /channels/{id}/stickers {sha256, origin_hub_url}` on B, which
   returns the sticker id.
2. Send the message with `sticker_id`.

The client never uploads sticker bytes. How to read the answers:

- 403 means "this hub allows only its own stickers"; the picker greys out
  saved stickers where `stickers.external` is missing.
- 502 means "not available right now": the origin is offline, has removed
  the sticker, or has export off.
- A send is never refused for space.

**Two save actions on a sticker in chat**, on different axes:

- *Save to my collection* (personal).
- *Add to a pack* (community, `stickers.packs.manage`).

The collection is a typed `stickers` field in `PrefsBlobContents`
(Wavvon-clients: `packages/core/src/identity/master.ts:51`). Desktop's
`LocalPrefs` (`apps/desktop/src-tauri/src/prefs_blob.rs:13`) **drops fields
it does not know**, so it must carry the new one forward, or a push from
desktop erases the collection.

- **Picker:** Saved, then this hub's packs.
- **Rendering:** a fixed size, "from <origin hub name>" linking to the
  origin's preview, and a tombstone's sentence.
- **Admin:** packs, the stored-sticker page, the settings and the two
  toggles, in the shared hub admin page. The toggles are "Let other hubs use
  our stickers" (`stickers_export`) and "Allow stickers from other hubs"
  (`stickers.external` on everyone).

## 7. Deferred and open

Deferred:

- **Alliance channels**, which need the image proxied too.
- **DMs**, where a sticker would be an end-to-end encrypted attachment.
- The perceptual hint, saving a whole pack, and pack share links.

Origin verification is settled by §3: the origin is the hub the bytes were
fetched from. The open questions are on storage (sticker-storage.md §5).
