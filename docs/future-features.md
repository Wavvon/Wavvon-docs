# Future Features

Design and implementation status for features beyond the initial launch.
Each section notes what's shipped, what's partial, and what's still
deferred. The design rationale is preserved so it stays useful as the
canonical reference for ongoing implementation.

> See also: [farm-model.md](farm-model.md) for the multi-hub server
> layer, and [gaming.md](gaming.md) for the game distribution platform.

## OAuth social verification badges

**What**: a user can link a third-party account (GitHub, Steam, Twitter/X, etc.)
to their Wavvon identity and receive a verified badge visible on their profile.
The badge proves "this Ed25519 key belongs to the person who controls that
external account" — social proof, not auth.

**Why not auth**: using OAuth for login or recovery would make the Wavvon identity
dependent on a centralized provider. Rejected as an auth path; see
[`decisions.md`](decisions.md). Useful only as an opt-in metadata layer.

**Implementation sketch**: user initiates an OAuth flow in the desktop client →
receives a short-lived token from the provider → posts it to their hub (or a
dedicated attestation microservice) → hub verifies the token server-side and
stores a signed badge (issuer = hub pubkey, subject = user pubkey, claim =
`{provider, provider_uid}`). Badge is visible on the user's profile card and
exportable for other hubs to display. Provider account change / deauth revokes
the badge.

**Status**: undesigned. Not on the pre-launch list.

---

## Anti-spam — proof-of-work + hub certifications

**Problem**: decentralized identity means bots can generate keypairs
instantly. Without friction, a hub can be flooded by fresh keys.

**Two-layer defense planned:**

### Layer 1 — proof-of-work levels

- Client computes a SHA-256 puzzle tied to its keypair (leading-zero hash).
- Each level takes exponentially more CPU: level 15 ≈ 1 min, level 23 ≈
  30 min, level 30 ≈ 8 hours.
- Hub sets a minimum level to connect.
- Proof stored in the identity file. Hub verifies instantly with one
  hash check. Cannot be faked — pure math.

**Status: SHIPPED.** `identity/src/pow.rs` (Wavvon-server) implements
`compute_security_level()` and `verify_security_level()`. The hub reads
`min_pow_level` from `hub_settings` (default `0` — no PoW required) and
enforces it in `auth/handlers.rs`. The required level is advertised via
`GET /info` so clients know what to compute before connecting.

### Layer 2 — hub certification (reputation)

**Status**: mostly shipped. The canonical doc is
[hub-certifications.md](hub-certifications.md). Summary:

- Hub signs a statement: "user X has been a member since Y in good
  standing."
- Signature is verifiable by anyone (hub's pubkey is published via `/info`).
- Users collect certifications from multiple hubs — a reputation
  portfolio held on the home hub list.
- Other hubs can require certifications from trusted hubs, and can
  trust a cert's carried PoW level instead of recomputing it
  (cross-hub portable PoW credit).
- Same Ed25519 signer as badges ([server-tags.md](server-tags.md)),
  `subject_kind: "user"`.

**What's shipped**: `cert_issuances` and `user_certs` tables in the DB;
`hub_settings` rows (`cert_mode`, `cert_standing_days`, `cert_validity_days`,
`cert_min_pow_level`, `cert_trusted_issuers`, `cert_require`); five admin
routes in `hub/src/routes/certs.rs`; auth gate in `auth/handlers.rs`
verifies cert signatures, expiry, standing, and `cert_require` property
rules; `GET /info` advertises `cert_requirement`; `IdentityCertificationsSection`
and `HubCertificationsAdminSection` UI components exist on desktop.

**Also shipped**: automatic cert-issuance sweep (`hub/src/cert_worker.rs`)
runs hourly — finds members whose age ≥ `cert_standing_days`, PoW ≥
`cert_min_pow_level`, and who have no live cert, then signs and inserts
a `cert_issuances` row. `GET /certs/revocations?since=<ts>` (public, no
auth) returns revoked certs for external hubs to poll.

**Still deferred**: cross-farm cert relay.

### Also considered

- **Invite-only hubs** — admin issues invite codes. Simple, effective for
  private communities. Already shipped.
- **Per-IP rate limiting** — secondary barrier. Already in place on
  `/auth/*` and write endpoints.
- **Account age alone** — too weak. Easily faked by pre-generating keys.

### Order of implementation

PoW first (foundational, math-based). Hub certification later (requires
trust decisions). Invites are already the quick option for private hubs.

---

## Moderation enhancements — channel ban, voice mute, talk power

Beyond today's ban/mute/kick/timeout:

- **Channel ban** — block a user from specific channels (text + voice).
  New `channel_bans` table (channel_id × pubkey). Check on channel
  access.
- **Voice mute** — user can hear but can't speak. Hub stops forwarding
  their audio packets. New `voice_mutes` table.
- **Talk power** — channels carry a `min_talk_power` threshold for
  their voice side. Users get talk power from their role. Below
  threshold = can read/post text and listen in voice, but can't
  transmit. Users can "raise hand" to request permission.

**Status: SHIPPED.** All three controls are fully wired end-to-end:
`channel_bans`, `voice_mutes`, `channel_voice_mutes`, and
`raise_hand_requests` tables exist in the DB; `channels.min_talk_power`
and `roles.talk_power` columns are present. `hub/src/routes/moderation.rs`
exposes full CRUD for all three (including per-channel voice mute and
raise-hand). The WS voice-join gate in `ws.rs` enforces hub-wide voice
mute, per-channel voice mute, and talk-power threshold before admitting
audio. `ChannelSettingsModal` (desktop) surfaces talk-power config;
`ChannelBansModal` surfaces channel ban management.

---

## Identity recovery — beyond the recovery phrase

The recovery phrase ([identity.md](identity.md)) is shipped. Subsequent
layers:

1. **Backup / export** — explicit export-import of `identity.json` with
   a passphrase wrapper. **Shipped**: `export_identity_backup` and
   `import_identity_backup` Tauri commands (Argon2id + AES-256-GCM),
   `IdentityBackupSection.tsx` UI in Settings → Account.
2. **Device linking** — master keypair authorizes per-device sub-keys.
   Revoke a lost device from another. **Shipped as part of multi-device
   pairing** (see that section below); the DB tables, routes, and QR
   pairing UI are all present.
3. **Recovery contacts** — designate trusted keypairs that can reclaim
   your roles or hub ownership if your key is lost. **Shipped**: DB
   tables, all server routes (including new `GET /recovery/requests` for
   user-scoped request listing), `RecoveryContactsSection` UI on desktop
   (Security tab) and web (Hub Admin → Recovery tab), and five Tauri
   commands (`list_recovery_contacts`, `add_recovery_contact`,
   `remove_recovery_contact`, `submit_rotation_request`,
   `list_rotation_requests`) added to desktop's `src-tauri/src/lib.rs`.

---

## Bots and integrations

**Status: MOSTLY SHIPPED.** The full design lives in
[bots.md](bots.md). Both shapes landed: bots-as-users (external bots
with Ed25519 identity + invite flow) and incoming webhooks. The
canonical spec is `bots.md`; the summary below reflects current
implementation state.

**What's shipped:**

- **Hub-local bots** — admin creates a bot identity on the hub, gets a
  bearer token. Routes: `POST/GET/DELETE /admin/bots`, `PUT
  /admin/bots/:pubkey/webhook`. UI: `HubBotsSection.tsx` (desktop +
  web).
- **External bots** — bot author registers by pubkey; admin issues a
  24-hr invite token; bot signs and accepts. Routes: `POST /bots`,
  `POST /bots/accept-invite`, `GET /bots`, `DELETE /bots/:pubkey`. Bot
  self-service: `GET/PUT /bots/me/profile`, `PUT /bots/me/commands`,
  `PUT /bots/me/subscriptions`. UI: `ExternalBotSection.tsx`.
- **Incoming webhooks** — admin creates a webhook URL for a channel
  (secret token shown once, hash stored). `POST
  /webhooks/:id/:token` accepts `{ content, username?, avatar_url?,
  embeds? }`, rate-limited to 5 msg/min. Routes: `POST/DELETE/PATCH
  /admin/webhooks/:id`. UI: `WebhooksSection.tsx`.
- **Slash command dispatch** — `hub/src/bots/dispatch.rs` parses
  `/command args`, looks up the bot, signs the invocation, and POSTs to
  the bot's webhook URL with Ed25519 signature headers. Supports
  `reply`, `ephemeral`, `defer`, `components`, and `embeds` response
  shapes.
- **Event subscriptions & audit log** — `hub/src/bots/events.rs`
  publishes events to `hub_audit_log` and pushes to subscribed bots via
  WS. Full event set: `member.*`, `voice.*`, `message.*`, `channel.*`,
  `hub.*`, `bot.*`. Bots can reconnect and replay from a sequence
  number.
- **Bot event polling** — `GET /bot/poll?since=N`, `DELETE
  /bot/events`, `POST /bot/send` for polling-based bots that don't use
  WS.
- **Bot registry in Wavvon-discovery** — `GET/POST /api/bots` for
  public bot listing and self-submission.
- **Integration tests** — `hub/tests/bots_flow.rs` (343 lines) covers
  the main flows.

**What's shipped (updated):**

- **Slash command autocomplete** — desktop fully wired (App.tsx caches
  registry on hub connect, ContentArea.tsx shows dropdown). Web wired:
  `listBotCommands()` added to `platform/commands/bots.ts`, loaded in
  `loadHubData`, passed to `ContentArea`.
- **Ephemeral message rendering** — `visible_to_pubkey` filtering,
  "Only you can see this" label, and `message-ephemeral` CSS class all
  present on desktop and web.
- **Message component rendering** — `MessageComponents.tsx` renders
  buttons (primary/secondary/danger) and selects with 5-second
  interaction debounce on desktop and web.
- **Rich embed rendering** — `MessageEmbeds.tsx` renders title, URL,
  description, color accent, thumbnail, fields (inline-aware), image,
  and footer on desktop and web.

- **Token expiry push** — **Shipped**: `hub/src/bots/token_expiry.rs`
  sweeps every 15 min; sends `token_expiring_soon` 72 h before expiry
  with a 24-hour re-warn cooldown; sends `bot_removed` + closes WS on
  expiry. `POST /auth/renew` issues a fresh token (30-day window) and
  returns `{ token, expires_at }`. Auth middleware enforces `expires_at`
  at request time. 11 integration tests in `hub/tests/token_expiry_flow.rs`.

**Still deferred:**

- **Voice/screen-share injection**, **bot DMs**, **outgoing webhooks**
  (hub→external URL on events), **bot-launched game modals** —
  deferred, no timeline.

**Security**: bots get scoped tokens, not full user permissions. Token
rotation is owner-pubkey-gated. Per-bot rate limits. See
[threat-model.md](threat-model.md).

---

## Multi-device pairing

**Status**: design committed. The canonical docs are
[multi-device.md](multi-device.md) (identity + QR pairing) and
[home-hub.md](home-hub.md) (storage layer for personal-axis state).
Read those — the writeup below is the *pre-decision* exploration kept
for historical context only and may drift from the committed design.

**Goal**: let one user have Wavvon on multiple devices (phone + desktop)
under a single identity. Today every device generates its own keypair
and is treated as a separate user. Pasting the recovery phrase on a
second device replaces that device's identity with the first device's,
which works as a "I formatted my PC" recovery story but is awkward
for "I want both devices online at the same time."

**Status: MOSTLY SHIPPED.** The canonical docs are
[multi-device.md](multi-device.md) and [home-hub.md](home-hub.md).
The master+subkey model was chosen and implemented. The pre-decision
exploration below is kept for context; the design questions it raises
are resolved.

### Identity model — pick one

| Option | What it is | Cost |
|---|---|---|
| **Shared keypair** | All devices have the same private key. QR-pairing transfers the key. Hubs see one pubkey = one person. | Simple. ~1-2 weeks. **No revocation** — losing one device means rotating the key everywhere. |
| **Master + device subkeys** | A master keypair (derived from the recovery phrase as a seed) signs per-device subkeys. Each device's subkey signs daily traffic; the master proves "this subkey is mine." | Proper revocation, proper sovereignty. Hub protocol changes (hubs verify subkey signatures). Multi-month. The recovery phrase becomes an HD-wallet seed; existing single-key identities migrate as "device 0." |

The second option is what `decisions.md` calls "the right thing later"
and is forward-compatible with today's keypair model. The first option
is the dirty-but-fast v0 that gets users multi-device immediately at
the cost of needing a rewrite when revocation comes up.

### State sync — separate decision

Each device today has its own JSON files for hub list, prefs, blocked
users, friends, voice settings. Multi-device means these need to live
*somewhere* shared. The choices, ranked from least invasive to most:

1. **No sync** — each device keeps its own list. Same identity, but
   you re-add hubs on each device. Simple but feels broken.
2. **One of the user's hubs holds an encrypted prefs blob** — pick a
   home hub (or the first one) to be the "sync hub." Encrypted with a
   key derived from the master seed. Other devices fetch the blob.
   Reintroduces "pick a primary," which we explicitly punted earlier.
3. **Every hub the user is on replicates the blob** — fancy, invites
   consistency bugs across hubs that don't agree on the blob version.
4. **Separate identity service** — a central component. Conflicts with
   the federated pillar. Off the table.

Option 1 is the v0 path. Option 2 is the right destination. Option 3 is
over-engineering. Option 4 is the wrong direction.

### What's shipped

- **DB**: `subkey_certs`, `subkey_revocations`, `pairing_offers`,
  `home_hub_designations`, `prefs_blobs` tables; `users.master_pubkey`
  column.
- **Identity crate**: `MasterIdentity`, `DeviceSubkey`, `SubkeyCert`,
  `RevocationEntry`, `HomeHubList` types; derivation in `master.rs` /
  `subkey.rs`.
- **Routes**: `hub/src/routes/pairing.rs` (offer, claim, complete);
  `hub/src/routes/identity.rs` (designations, devices, revocations,
  prefs blobs GET/PUT).
- **Auth enforcement**: middleware checks `subkey_revocations`, returns
  401 for revoked subkeys.
- **Desktop UI**: `PairingSection.tsx` (QR offer + claim flow),
  `DeviceListSection.tsx` (paired devices + revoke button).

### What's still missing

- **Identity export/import with passphrase** — no Tauri command or UI
  for exporting `identity.json` with a passphrase wrapper.
- **Per-hub revocation propagation** — revocation is local to each hub;
  a revoked subkey on hub A is not automatically known to hub B.
- **Android pairing UI** — QR flow exists on desktop/web; Android
  client does not yet have it.

---

## Nested channels

**Goal**: let users build an arbitrary tree of categories and channels.
Remember Wavvon channels are **unified text + voice** ([decisions.md](decisions.md)) —
a "channel" in the tree is one room where both chat and voice live.

```
GamesCategory                      ← depth 1 (category)
├── LeagueOfLegendsCategory        ← depth 2 (category)
│   ├── AllianceSection            ← depth 3 (category)
│   │   ├── raid-planning          ← depth 4 (channel — leaf)
│   │   └── lounge                 ← depth 4 (channel — leaf)
│   └── TeamSection                ← depth 3 (category)
│       └── strats                 ← depth 4 (channel — leaf)
└── DotaCategory                   ← depth 2 (category)
    └── general                    ← depth 3 (channel — leaf)
```

Each leaf is a channel — chat history and voice in the same place. The
intermediate nodes are categories (containers).

**Why**: today's flat "category > channel" caps community organization at
two levels. Game communities, in particular, want topic > sub-topic >
section before getting to actual channels — and we don't know in advance
how deep any community will want to go.

### Rules

- **Configurable depth cap** — hubs are sovereign, but admins can
  optionally set a `max_channel_depth` hub setting (integer ≥ 1).
  `0` means unlimited. Default is `0`. The cap is enforced server-side
  on create and move operations.
- **Categories are containers.** They hold other categories and/or
  channels. They can't hold messages or voice (`is_category=1` rows).
- **Categories can't live at max depth.** A category at the deepest
  allowed level would be an empty container — nowhere to put children.
  Invariant: a category may only be created/moved to depth ≤
  `(max_channel_depth − 1)`. Channels (leaves) may go to any depth up
  to `max_channel_depth`. When `max_channel_depth = 0` (unlimited) this
  restriction doesn't apply.
- **Channels are leaves.** Each channel is unified text + voice and can
  sit at any depth.
- **Permissions cascade** — a deny on a parent applies to children
  unless the child explicitly overrides. Same model as a file system.

### Hub setting — `max_channel_depth`

Stored in the hub settings table (new row, key `max_channel_depth`,
default `"0"`). Surfaced in the hub admin panel under a "Structure"
section. The UI should show a helper like:

> "0 = unlimited. If set to 4, categories can nest up to depth 3 and
> channels up to depth 4."

Enforcement is server-side so API clients can't bypass it.

### Data model and implementation status

**Status: SHIPPED.** The `channels` table has `parent_id TEXT
REFERENCES channels(id)` and `is_category INTEGER`. Route validation
in `hub/src/routes/channels.rs` enforces depth (`node_depth()`,
`read_max_depth()`) and cycle detection (`is_ancestor()`) on both
create and move. `max_channel_depth` is seeded as `'0'` in
`hub_settings`. `ChannelSidebar.tsx` uses a recursive `TreeNode`
structure with depth tracking.

**Status: SHIPPED.** `max_channel_depth` is wired end-to-end: the DB
column, server enforcement, `get_hub_settings` / `save_hub_settings`
Tauri commands, and a number input in Hub Admin → Overview are all
present.

### Open implementation questions

- **Drag-drop with arbitrary depth** — the only forbidden move is a
  cycle (dropping a node into one of its own descendants). Visual
  indentation past ~6 levels needs a strategy: horizontal scroll,
  auto-collapse, or breadcrumb-style display in the sidebar.
- **Permission override UI** — when a child explicitly grants what its
  parent denies, that override needs a clear UI affordance so admins
  understand what's happening.
- **Permalinks** — today's `#general` becomes
  `Games / LoL / Alliance / #raid-planning`. Permalink format: keep
  the channel id only and resolve display path client-side.
- **No migration needed** — both categories and channels can already
  live at the root (`parent_id NULL`) or nested under a category in
  today's schema. Existing data is unchanged; new nesting is opt-in
  whenever an admin decides to nest something.

### What we explicitly don't want

- **Channel-as-container** (a channel that holds messages AND has
  sub-channels). This would confuse users. Keep the `is_category`
  distinction sharp: containers vs. leaves.

---

## Forum channel type

**Status: SHIPPED.** The full design is in [forum.md](forum.md).

**Goal**: a channel variant where the content is an indexed list of
*posts* (each with a title) rather than a continuous message stream.
Users browse posts, open one, and reply inside it. Useful for
announcements, Q&A boards, patch notes, bug reports — anywhere a
timeline feed is the wrong shape.

### How it differs from a regular channel

| | Regular channel | Forum channel |
|---|---|---|
| Primary content | Continuous message stream | Ordered list of posts |
| Each entry | Message (no title) | Post with title + body |
| Replies | Thread hanging off a message | Reply thread inside the post |
| Voice | Yes (unified text + voice) | No — posts-only, no voice |
| Search | Full-text on messages | Full-text on post titles + bodies |

Forum channels are leaves in the channel tree (same as regular
channels) and live at the same depth positions. They carry a new
`channel_type` discriminant: `"text"` (default today) vs `"forum"`.

### Data model

All shipped: `posts` table (id, channel_id, author_pubkey, title,
body, created_at, edited_at, is_pinned, is_locked, reply_count,
last_activity_at, deleted_at); `post_replies` (id, post_id,
author_pubkey, body, reply_to_id, soft-delete); `posts_fts` FTS5
virtual table with insert/update/delete triggers; `channel_type TEXT
DEFAULT 'text'` on channels.

### Routes and permissions

All 12 endpoints in `hub/src/routes/posts.rs` are shipped: list,
create, get, edit, soft-delete for posts and replies; pin/lock
(gated to `manage_posts`); FTS search via `GET
/channels/:cid/posts/search?q=`. Two new permissions (`create_posts`,
`manage_posts`) seeded in migrations.

### UI

`ForumPostList.tsx`, `ForumPostDetail.tsx`, `ForumComposer.tsx` exist
on desktop and web. `CreateChannelModal` includes the `forum` type
option. WS events (`post_created`, `post_updated`, `reply_created`,
etc.) feed through the existing notification system.

### Moderation

Soft-delete with `deleted_at`; moderators see authorship on deleted
posts. Channel bans apply. Existing moderation routes extend naturally.

### Still deferred

Per-post read cursors (v1 uses channel-level unread tracking only);
federation of posts across alliances; reactions on posts; attachments
on posts.

---

## Multi-stream overlay, OS picture-in-picture, and decoupled stream viewing

Three related screen-share evolutions. All three are shipped: multi-stream
overlay, cross-channel subscriptions, and OS PiP.

### Multi-stream overlay within a channel

**Status: SHIPPED.** The one-sharer cap has been removed. `state.rs`
holds `ActiveShare` as a `HashMap<stream_id, ScreenStreamMeta>` per
channel with a `cross_channel_subscribers` set. Multiple concurrent
sharers are supported.

**Problem (original)**: v1 enforces one sharer per channel. Co-op gaming and
pair-programming sessions want all participants' screens visible
simultaneously without switching focus.

**Shape**: lift the one-sharer cap (already listed as an open question in
[screen-share.md](screen-share.md)) and render each active stream as an
independent floating overlay panel inside the app window. Each panel is:

- Draggable and resizable (same primitives as the single-stream
  "Floating overlay" layout already designed)
- Independently hide-able and volume-controlled
- Composed of the stream's screen video plus optional webcam-over-screen
  overlay (the v1 webcam-PiP model applied to each stream)

The viewer assembles their own layout by positioning N panels over the
channel content. No sharer-side change — the hub fan-out model already
handles multiple subscribers; the only new hub-side constraint is lifting
the `at-most-one-ActiveShare` enforcement and allocating per-stream
init-chunk cache entries.

**Permission model**: unchanged — the existing `can_screen_share` flag
still gates who can start a share; viewers need no new permissions.

**Hub state change**: `ActiveShare` per channel becomes
`Vec<ActiveShare>` instead of a single optional, with each entry keyed
by `stream_id`. The hub already uses `stream_id` to distinguish screen
vs webcam streams for the same sharer; the extension applies the same
keying across multiple sharers.

---

### Cross-channel stream subscription (decoupled from voice)

**Status: SHIPPED.** `StreamSubscribe` / `StreamUnsubscribe` WS
message variants exist in `chat_models.rs`; the subscription handler
in `ws.rs` adds the viewer to `cross_channel_subscribers` and replays
the init chunk. `HubStreamsPanel.tsx` (desktop) is the streams
discovery panel; `useHubStreams.ts` manages discovery and subscription
state.

**Problem (original)**: today, viewing a screen share in channel X requires being a
member of channel X and having it selected. This forces a choice: leave
your current voice context or miss the stream.

**Shape**: a lightweight *stream subscription* relationship — separate
from voice membership and chat participation. A user in voice in
`#general` opens a "Streams" panel listing all active shares on the hub,
picks one from `#gaming`, and sees it as a floating overlay — without
leaving `#general`'s voice.

**Why this matters**:

- **Co-op / tournament viewing** — a spectator or raid leader watches
  multiple group feeds from a single hub view without joining each
  channel's voice.
- **Cross-team awareness** — a squad leader monitors several sub-group
  channels while staying in their own voice.
- **View-only members** — users who can't join a channel's voice (wrong
  role, full, or choosing not to) can still watch its shared screen.

**Permission model**: reuses the existing `can_view_channel` check — if
you can see the channel you can subscribe to its active streams. No new
permission surface. A channel with `private` access blocks subscriptions
from non-members the same way it blocks chat reads.

**Wire changes** (Wavvon-server):

```
// Client → Hub
StreamSubscribe {
  channel_id: String,    // source channel (not the viewer's current channel)
  stream_id: String,
}
StreamUnsubscribe {
  channel_id: String,
  stream_id: String,
}

// Hub → Client (on subscribe: replay init chunk + forward subsequent chunks)
StreamSubscribed { channel_id, stream_id, sharer_pubkey, mime, has_audio }
// then the normal ScreenShareChunkOut / ScreenShareStopped flow
```

The hub validates `StreamSubscribe` against `can_view_channel` for the
source channel, ignoring voice membership entirely. On approval it adds
the subscriber to that stream's fan-out set (same map as channel
subscribers, just sourced differently) and immediately replays the cached
init chunk so the subscriber's MSE buffer can start decoding.

**Hub state**: `ActiveShare` gains a `cross_channel_subscribers:
HashSet<ConnectionId>` alongside the existing channel subscriber set. Fan-
out on each `ScreenShareChunk` covers both sets. On `ScreenShareStop` or
sharer WS disconnect, all subscribers (both sets) receive `ScreenShareStopped`.

**Client-side**: a "Streams" discovery panel (hub-scoped, not
channel-scoped) that lists active shares across all channels the user can
view. Subscribing to a stream from this panel opens it as a floating
overlay (the multi-stream overlay model above) without changing the user's
current channel or voice state.

**Decoupling summary**:

| Today | With stream subscription |
|---|---|
| View stream → must be in that channel's voice | View stream → subscribe from anywhere on the hub |
| Leave voice A to watch channel B's stream | Stay in voice A, subscribe to B's stream |
| Streams are "richer voice" | Streams are first-class hub objects |

---

### OS-level picture-in-picture

**Status: SHIPPED.** `open_pip_window` and `close_pip_window` Tauri
commands added to `lib.rs`. `desktop/public/pip.html` is a
self-contained MSE stack that listens for `pip-stream-chunk` / `pip-stream-stop`
Tauri events and renders the stream in a borderless, always-on-top
window (320×180 default, min 160×90, draggable, resizable). A "Pop out /
Pop in" button in `ScreenShareViewer.tsx` opens the window and forwards
chunks via `emit("pip-stream-chunk")`.

**Problem**: the "Floating overlay" layout (designed in
[screen-share.md](screen-share.md)) pins the viewer inside the app window.
When the main app is minimized or another application takes focus, the
stream disappears.

**Shape**: a second Tauri `Window` with `always_on_top: true` and minimal
or no decorations, launched on demand from the viewer panel. The `<video>`
+ MSE stack from the in-app viewer runs inside this detached window. The
main app and the PiP window share stream state via Tauri's event/command
bridge.

**Implementation sketch** (Wavvon-desktop, `src-tauri/`):

```rust
tauri::WindowBuilder::new(
    app,
    "screen-share-pip",
    tauri::WindowUrl::App("pip.html".into()),
)
.title("Wavvon — stream")
.inner_size(320.0, 180.0)
.min_inner_size(160.0, 90.0)
.always_on_top(true)
.decorations(false)   // or minimal: .decorations(true) for OS drag handle
.build()?;
```

The PiP window communicates with the main window via
`window.emit("stream-chunk", ...)` / `window.listen(...)` using the same
chunk data the in-app viewer already receives. No new hub protocol. No
server changes.

**Scope**: viewer-side UX only. Compatible with both the single-stream and
multi-stream overlay models — the PiP window can host one stream or a
compact grid of N streams depending on which model is active.

---

## Server tags — federated portable badges

**Status: MOSTLY SHIPPED.** The canonical doc is
[server-tags.md](server-tags.md). It splits the feature into self-tags
(free-form discovery keywords, hub-authoritative via `/info`) and
badges (portable Ed25519-signed attestations one hub grants another,
push-to-subject / pull-by-anyone). The badge signer is the same
primitive the hub certification section uses for certifying users.

**What's shipped**: `hub_tags` and `hub_nsfw` hub settings; `badge_offers`,
`hub_badges`, and `issued_badges` DB tables; `hub/src/routes/tags.rs`
(GET/PATCH `/admin/settings/tags`); `hub/src/routes/badges.rs` (full
CRUD: pending offers, accept, decline, remove, issue, list issued);
`GET /info` includes `self_tags`, `nsfw`, and `badges` fields;
Ed25519 badge signature verification on accept; outbound issuance POSTs
to recipient hub's `/federation/badge-offer`. `HubBadgesSection.tsx`
(desktop) and `ServerTagsSection.tsx` + `hubAdmin.ts` (web) are the
UI and API layers.

**Shipped**: `DELETE /admin/badges/issued/:id` soft-revokes a badge;
`GET /federation/badge-revocations?since=<iso>` lets external hubs poll
incrementally for revocations.
(`/federation/badge-revocations`); user-configurable trust roots (v1
uses existing hub relationships); badge transitivity.
