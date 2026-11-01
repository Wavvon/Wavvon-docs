# Sticker storage: ingest, disk, limits

**Status: designed 2026-11-01, not built.** This is the hub side of
[stickers.md](stickers.md): how a sticker is taken in, stored once, and
evicted, and which limits an admin sets. Rationale is in
[decisions.md](decisions.md), "Stickers: a personal collection, a copy on
every hub that shows one". Code paths are in Wavvon-server.

The goal: **disk grows with distinct stickers, not with messages.**

## 1. Ingest: normalize, strip, hash

Every sticker that enters goes through one function, whether it is a pack
upload or a copy fetched from its origin hub (stickers.md §3):

1. **Decode fully**, in pure Rust. Accepted inputs: PNG, JPEG, GIF, WebP and
   APNG.
2. **Convert to WebP.** Stills become WebP and animations become animated
   WebP, at fixed encoder settings and a fixed maximum dimension. Animated
   stickers stay supported.
3. **Already-canonical WebP passes through.** A WebP within bounds only loses
   its metadata chunks (EXIF, XMP, ICCP) and keeps every other byte. That is
   what makes a copy from hub A hash the same on hub B. Re-encoding a lossy
   WebP would mint a new hash on every hop.
4. **SHA-256, computed by the hub.** A requested hash is only a key to look
   up or fetch, and a fetched copy must hash to it exactly.
5. **Blocklist check** (stickers.md §5), then **dedup** on the exact hash.

An encoder upgrade can store one image twice, once per upgrade. That is
accepted. The hub has no image pipeline today: `image` 0.25 reaches
`Cargo.lock` only through `qrcodegen-image`, and animated-WebP *encoding*
needs libwebp (C).

**Perceptual hashing is phase 2, and only a hint** ("this looks like X in a
pack, use it?"). It never merges automatically. Two different images can
share a perceptual hash, so a merge would show readers a picture the sender
never sent, and an attacker can craft such collisions on purpose.

## 2. Storage

```
sticker_packs      id, name, created_by, created_at
stickers           id, sha256 UNIQUE, name, mime, size_bytes, width, height,
                   pack_id NULL -> sticker_packs ON DELETE SET NULL,
                   origin_hub_url NULL, origin_hub_name NULL,
                   uploader, created_at,
                   last_used_at, removed_at NULL, evicted_at NULL
sticker_blocklist  sha256 PK, blocked_by, reason, created_at
messages           + sticker_id NULL -> stickers
```

- **Bytes on disk** as `sticker_<sha256>.webp` under `WAVVON_UPLOADS_DIR`,
  following the soundboard (`crates/hub/src/routes/soundboard.rs:31-44`).
  `backup` and `restore` already carry that directory
  (`crates/hub/src/routes/uploads.rs:33-38`).
- **Pack sticker or copy is decided by `pack_id`.** Deleting a pack turns its
  stickers into copies, which the cache can then evict.
- **Two tombstones**, so that a message renders a sentence rather than a gap.
  Both delete the bytes and keep the row:
  - `removed_at` (a moderator deleted it): "sticker removed".
  - `evicted_at` (space was needed): "sticker no longer available". A later
    send re-fetches the sticker from its origin into the same row and clears
    the mark.
- **`origin_hub_url` is verified by construction**: a copy exists only
  because this hub fetched that hash from that hub. It is NULL for this
  hub's own pack uploads.
- **Served** at `GET /stickers/{sha256}`: public (an `<img>` sends no token),
  `immutable`, `image/webp`, `nosniff`.
- One numbered step in `db/migrations.rs`, never the per-boot baseline.

## 3. Two budgets

- **Packs** are curated. At their cap, *additions* are refused and admins
  see a warning; the admin decides what goes. Packs are never evicted.
- **Copies** are a cache, and **a send is never refused for space**. When an
  ingest would cross the copies cap, the hub evicts orphans first (no
  message, no pack), then the least recently used copies by `last_used_at`.
  An evicted sticker comes back the moment anyone sends it again, as long as
  its origin still serves it.

A worker beside the retention worker also deletes orphans older than the GC
delay, so a quiet hub does not sit at its cap.

**No limit applies to a member.** A member flooding new stickers to push
other people's copies out is handled by moderation (block a hash) and by the
existing message rate limits, not by quotas. The cost, accepted in
decisions.md: on a small, full hub, old messages lose their stickers.

## 4. Limits

Every limit is a hub setting, following `max_attachment_bytes`: a default,
plus a floor and a ceiling in code, stored in `hub_settings` and set through
`PATCH /hub` under **`hub.settings`** (`crates/hub/src/routes/hub.rs:17-23,
153-164, 456-485`). Disk is the operator's concern.

| Setting | Default | Floor | Ceiling | At the limit |
|---|---|---|---|---|
| `stickers_max_file_bytes` | 512 KB | 64 KB | 4 MB | that file refused: pack upload, or a fetch from an origin |
| `stickers_packs_cap_bytes` | 512 MB | 16 MB | 100 GB | additions to packs refused |
| `stickers_packs_warn_percent` | 90 | 50 | 99 | admin warning |
| `stickers_copies_cap_bytes` | 1 GB | 64 MB | 1 TB | orphans, then LRU copies evicted; the send succeeds |
| `stickers_per_pack` | 60 | 1 | 500 | adding to that pack refused |
| `sticker_packs_per_hub` | 20 | 1 | 200 | creating a pack refused |
| `stickers_orphan_gc_days` | 30 | 1 | 365 | the orphan worker's age threshold |
| `stickers_export` | on | — | — | off: `GET /federation/stickers/{sha256}` answers 403 (stickers.md §3) |

The copies-cap floor sits above the file ceiling, so eviction can always make
room for one file.

## 5. Open questions

1. **Can libwebp be built for the musl targets?** A fallback format there
   would hash differently and break dedup across hubs.
2. **The maximum dimension is deliberately not a setting** (512 px is
   proposed), because changing it changes every hash. Confirm.
