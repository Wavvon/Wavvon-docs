# Future Features

Work that's still undesigned or has a genuinely open remainder beyond
initial launch. Each section links to the canonical doc for the shipped
parts (if any exist) and states only what's left. Fully shipped topics
are removed from here entirely once nothing forward-looking remains —
see [shipped-log.md](shipped-log.md) or the linked canonical doc for
history.

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

## Anti-spam — cross-farm certification relay

**Problem**: decentralized identity means bots can generate keypairs
instantly. Without friction, a hub can be flooded by fresh keys.

Both defense layers are shipped: proof-of-work (`identity/src/pow.rs`,
enforced in `auth/handlers.rs`) and hub certification / reputation
(see [hub-certifications.md](hub-certifications.md) for the full,
current design — cert issuance, trust rules, and the automatic
cert-issuance sweep are all live).

**What's still undesigned**: cross-farm cert relay — letting
certifications propagate across the hubs a single farm operator
manages, instead of each hub verifying independently. No design work
has started.

---

## Bots and integrations

**Status: MOSTLY SHIPPED.** The canonical spec and current
implementation state live in [bots.md](bots.md) — hub-local bots,
external bots, incoming webhooks, outgoing webhooks, slash commands,
event subscriptions, and token expiry are all shipped. See that doc's
"What's deferred" section for the authoritative list; summary:

- **Voice/screen-share injection** — bots can't yet inject audio into
  voice or video into screen-share.
- **Bot DMs** — bots as DM participants. Needs a friend-graph rethink.
- **Bot-launched game modals** — a bot message with a "Play"
  call-to-action opening a full game modal. Blocked on Tier 2
  multiplayer gaming design ([gaming.md](gaming.md)).

No timeline on any of the three.

---

## Multi-device pairing

**Status: MOSTLY SHIPPED.** The canonical docs are
[multi-device.md](multi-device.md) (identity + QR pairing) and
[home-hub.md](home-hub.md) (storage layer for personal-axis state).
The master+subkey model was chosen and implemented, including per-hub
subkey revocation propagation (a background worker polls each master
key's home hub every 6 hours and syncs revocations — see
`subkey_revocation_worker.rs`) and identity export/import with a
passphrase wrapper (`export_identity_backup`/`import_identity_backup`,
`IdentityBackupSection.tsx`).

**Goal (historical)**: let one user have Wavvon on multiple devices
(phone + desktop) under a single identity. Today every device
generates its own keypair and is treated as a separate user. Pasting
the recovery phrase on a second device replaces that device's identity
with the first device's, which works as a "I formatted my PC" recovery
story but is awkward for "I want both devices online at the same
time." The writeup below is the *pre-decision* exploration kept for
historical context — the design questions it raises are resolved in
the canonical docs above.

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

- **Android QR pairing** — Android has a full pairing UI
  (`PairingSection.tsx`, `platform-android/pairing.ts`) but only the
  text-based flow (paste a pairing code); desktop/web's QR
  scan-and-offer flow hasn't been ported.

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

### Status

**SHIPPED (core), with three UX gaps designed in a canonical doc.** The
`channels` table has `parent_id`/`is_category`,
`hub/src/routes/channels.rs` enforces depth and cycle detection on
create/move, `max_channel_depth` is a wired hub setting (DB, Tauri
commands, and a Hub Admin → Overview control), and `ChannelSidebar.tsx`
renders the tree recursively with drag-drop re-parenting.

The three remaining UX gaps — channel permalinks (breadcrumb-path
resolution), a deep-nesting sidebar display strategy, and channel
permission overwrites (the net-new "cascade like a file system"
mechanism, which was never actually implemented) — are now fully
designed in [nested-channels-ux.md](nested-channels-ux.md). See that doc
for the data model, enforcement, routes, and UI. Nothing further is open
here.

> **No migration needed for the tree itself** — both categories and
> channels can already live at the root (`parent_id NULL`) or nested
> under a category in today's schema. The permission-overwrite work in
> [nested-channels-ux.md](nested-channels-ux.md) adds one additive table;
> existing data is unchanged.

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

### Status

**SHIPPED.** Data model, all 12 routes in `hub/src/routes/posts.rs`
(including FTS search and per-post read cursors via `post_reads`), UI
(`ForumPostList.tsx`, `ForumPostDetail.tsx`, `ForumComposer.tsx` on
desktop and web), and moderation (soft-delete, channel bans apply) are
all in place.

### Still deferred

Federation of posts across alliances.

---

## Events — role-slot sign-ups and reminders

**Status: DESIGNED, not implemented.** The canonical doc is
[events.md](events.md) — it records the shipped baseline (events +
RSVP) and designs the guild delta: `event_slots` with enforced
capacities and one-claim-per-user, a `reminder_minutes` +
idempotent-worker reminder posting an event card into the channel at
T−N, and a client-only calendar view. Also documents the pre-existing
gap that events routes bypass channel-scoped permissions (read-gating
leak) — fix rides with this work. Awaiting implementation pick-up
from the ROADMAP wishlist.

---

## Join-to-create temporary voice channels

**Status: DESIGNED, not implemented.** The canonical design is
[temp-voice-channels.md](temp-voice-channels.md) — `channel_type =
'spawner'` + temp rooms as ordinary channels with owner/GC columns,
spawn-as-sibling (inherits the permission cascade), 60s empty-grace
sweep worker, rename-only owner powers, and a new payload-free
`channel_list_changed` WS event that also fixes the general
stale-sidebar-on-admin-edits gap. Awaiting implementation pick-up
from the ROADMAP wishlist.

---

## Soundboard

**What**: per-hub library of short audio clips members can trigger in a
voice channel; playback is mixed into the sender's outgoing Opus stream
client-side, so the hub relay needs no changes.

**Why**: cheap, loved, and viral in gaming communities.

**Fit**: shares the audio-injection mechanism with the deferred "bots
inject audio into voice" work (see [bots.md](bots.md)) — designing one
should design the other.

**Status**: undesigned. Client-side injection point exists conceptually
in `crates/voice` (mix before Opus encode); needs upload/storage/
moderation rules on the hub side.

---

## Discord server import

**Status: DESIGNED, not implemented.** The canonical design is
[discord-import.md](discord-import.md) — a two-stage CLI
(`export` via a read-only bot → reviewable neutral manifest → `apply`
against a fresh hub over public HTTP routes, demo-seed style).
Structure only in v1: channel tree, roles, and channel permission
overwrites; members, history, and emoji are reported, not imported.
Awaiting implementation pick-up from the ROADMAP wishlist.

---

## LAN / offline mode

**What**: run a hub on a LAN with no internet: mDNS/local discovery so
clients on the same network find it, and a join story that doesn't
require public DNS or a CA-issued TLS cert (self-signed + fingerprint
pinning in the invite, or plain HTTP on RFC 1918 addresses as an
explicit operator opt-in).

**Why**: Mumble's quiet superpower. "Works at a LAN party with no
internet" is something centralized platforms structurally cannot do,
and it makes a strong launch-post headline. The Rust hub is already
self-contained; this is mostly a discovery + trust-bootstrap problem.

**Status**: undesigned. Interacts with the threat model
([threat-model.md](threat-model.md)) — the TLS opt-out must be loud,
local-only, and impossible to enable accidentally on a public hub.

---

## Personal data export — full archive

**Status: DESIGNED, not implemented.** The canonical design is
[data-export.md](data-export.md) — client-assembled (E2E means only
the client can produce plaintext; the export path proves the E2E
claims), one passphrase-encrypted JSON document reusing the shipped
Argon2id/AES-256-GCM identity-backup envelope, covering the full
personal axis with restore-identity+prefs / read-only-DM import
semantics. Community-axis content deliberately excluded. Awaiting
implementation pick-up from the ROADMAP wishlist.

---

## Live captions in voice

**What**: client-side speech-to-text (whisper.cpp-class local models)
rendering live captions for a voice channel.

**Why**: an accessibility differentiator none of the incumbents do
well ([accessibility.md](accessibility.md)). Running locally keeps the
no-telemetry stance intact — audio never leaves the client for
transcription.

**Status**: undesigned, and **desktop-era** — local ML inference is too
heavy for the web client, which is the current delivery target. Parked
until the desktop client is back in scope.

---

## Role categories

**Status: DESIGNED, not implemented.** The canonical design is
[role-categories.md](role-categories.md) — native role grouping
(display-only, no permissions) plus color/emoji-icon on both roles and
categories, surfaced in the hub-admin Roles tab and the user profile
card. Decision entry in [decisions.md](decisions.md). Awaiting
implementation pick-up from the ROADMAP wishlist.

---

## Server tags — federated portable badges

**Status: MOSTLY SHIPPED.** The canonical doc is
[server-tags.md](server-tags.md) — self-tags, badges (issue, accept,
decline, revoke), and cross-hub revocation polling are all shipped.

**Still deferred**: user-configurable trust roots (v1 uses existing hub
relationships); badge transitivity.
