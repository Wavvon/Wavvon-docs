# Banner Channels

A `channel_type = 'banner'` row that renders in the hub sidebar as a
full-width image block instead of a clickable channel row. It carries no
messages, voice, or unread state — purely decorative chrome that hub
owners/admins place anywhere in the channel list (section headers, hub
branding, event promos). It participates in the same drag-and-drop ordering
as regular channels.

---

## Schema

Two nullable columns on `channels` (`crates/hub/src/db/migrations.rs` in
Wavvon-server):

- `banner_url TEXT` — external HTTPS image URL; the hub stores the string
  only and never fetches it. The client loads it directly.
- `banner_file_id TEXT` (no FK) — id of an `attachments` row, served from
  `GET /uploads/{id}` ([attachments.md](attachments.md)). `upload_files` was
  dropped on 2026-11-01 and existing banners were reset to NULL.

Invariant: at most one of the two may be set on a banner channel. Enforced in
the API layer next to the other field checks (`routes/channels.rs`). For non-banner
channels both columns stay NULL.

---

## API

All in the `hub` crate of Wavvon-server.

`CreateChannelRequest` / `UpdateChannelRequest` gain:
- `banner_url: Option<String>`
- `banner_file_id: Option<String>`

`ChannelResponse` gains both fields so the client can render without a
second round-trip.

Validations (applied when `channel_type == 'banner'`):
- Exactly zero or one source set. Both set → 400. (Zero is allowed
  transiently so step 1 of the upload flow can create the channel before
  the file exists.)
- `banner_url`, if present, must parse as an absolute `https://` URL.
- `banner_file_id`, if present, must reference a live (not removed or
  expired) `attachments` row uploaded to this banner channel whose
  `attachment_blobs.kind` is `image`.
- Hub-uploaded banner size cap: 512 KB (tighter than the generic 25 MB
  upload limit; enforced on the banner upload path). Same four image
  formats only.
- Setting `banner_url`/`banner_file_id` on a non-banner channel → 400.

`name` is still required (it is the internal unique id / ordering anchor)
but is never displayed in the sidebar for banner channels.

---

## Upload flow

For hub-uploaded mode, an attachment belongs to a channel, so the channel
must exist before the file. Three steps:

1. Admin creates the banner channel: `POST /channels` with
   `channel_type: 'banner'` (and optionally `banner_url` for external mode,
   in which case stop here).
2. Admin uploads the image to that channel:
   `POST /channels/:id/upload` (multipart, reuses existing infra, 512 KB
   cap, sniffed image check). Response returns the new attachment id.
3. Admin patches the channel: `PATCH /channels/:id` with
   `banner_file_id` = the returned id.

External-URL mode is a single step: `POST /channels` with `banner_url` set.

The client's channel-create flow (desktop: `useChannelCrud.ts` plus the
Tauri command `patch_channel_banner_file`) orchestrates all three steps
without exposing the intermediate file id to the user.

---

## Frontend

In `packages/ui` (Wavvon-clients: `components/layout/ChannelSidebar.tsx`,
`SortableItems.tsx`; editing in `components/channels/BannerEditModal.tsx`),
shared by web and desktop, a node with `channel_type === 'banner'` renders a
distinct branch:
- A full-width `<img>` (`src` = `banner_url`, or `/uploads/{banner_file_id}`),
  `width: 100%`, `height: auto`.
- No `onClick`/navigation handler, no unread dot, no voice participant
  list, no hover affordances.
- The node remains a sortable item so drag-and-drop reordering works
  exactly like other channels (it has a `display_order` like any row).

The channel-creation modal gains a "Banner" option alongside Text / Voice /
Forum. Selecting it swaps the form to a source picker: "External URL" (text
input) or "Upload image" (file picker that drives the three-step flow,
hiding the intermediate file id from the user). The `name` field is still
collected but labeled as an internal identifier.

---

## Permissions

Create / edit / delete of banner channels is restricted to the hub owner
and members holding `channels.manage` — identical to the gate on regular
channel mutation. Regular members receive the banner in `ChannelResponse`
and render the image; they have no controls.

---

## Out of scope

- Animated-banner controls. GIF/WebP animation displays natively via
  `<img>`, but no play/pause, autoplay toggle, or frame controls.
- Click-through links on banners (no target URL / navigation).
- Multiple images per banner (one source per banner channel).
