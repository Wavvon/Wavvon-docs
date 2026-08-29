# Alliances

Alliances are Wavvon's differentiator: named groups of hubs that share
channels, reactions, and (eventually) voice and games. A hub can be in
multiple alliances; users access alliance content through their home hub
without joining every member hub separately.

```
"WoW Alliance" = Hub A + Hub B
  Hub A shares #raids
  Hub B shares #guild-chat
  Users on Hub A see both. Users on Hub B see both.
```

## Tables

Defined in `hub/src/db/migrations.rs` (Wavvon-server):

- `alliances` — alliance id, name, creator, created_at. The `name` here
  is the **local label** this hub uses for the alliance; there is no
  canonical cross-hub name (see "Local labelling" below).
- `alliance_members` — alliance_id × hub_pubkey, with hub_name + hub_url
- `alliance_shared_channels` — alliance_id × channel_id (local channels
  the hub has chosen to share), plus `include_descendants BOOLEAN NOT
  NULL DEFAULT FALSE`. When true, the row shares not just that space but
  the whole tree beneath it (see "Recursive space sharing" below).
- `pending_alliance_invites` — alliance_id, from_hub_pubkey, from_hub_url,
  alliance_name (as labelled by the sender), optional message, invite
  token, created_at. Holds push-invite cards until the receiving admin
  accepts or declines.

## Routes

All in `hub/src/routes/alliances.rs` (Wavvon-server):

| Route                                                | Who      | Purpose                              |
|------------------------------------------------------|----------|--------------------------------------|
| `POST   /alliances`                                  | admin    | Create alliance                      |
| `GET    /alliances`                                  | any auth | List alliances this hub is in        |
| `GET    /alliances/:id`                              | any auth | Details + members                    |
| `POST   /alliances/:id/invite`                       | admin    | Generate signed invite token (pull)  |
| `POST   /alliances/:id/push-invite`                  | admin    | Push invite directly to a target hub |
| `GET    /alliances/pending-invites`                  | admin    | List pending push invites received   |
| `POST   /alliances/pending-invites/:id/accept`       | admin    | Accept a pending push invite         |
| `POST   /alliances/pending-invites/:id/decline`      | admin    | Decline a pending push invite        |
| `POST   /alliances/:id/join`                         | admin    | Use invite token to join (hub-to-hub)|
| `DELETE /alliances/:id/leave`                        | admin    | Leave alliance                       |
| `POST   /alliances/:id/channels`                     | admin    | Share a local space (see below)      |
| `DELETE /alliances/:id/channels/:ch_id`              | admin    | Unshare a space                      |
| `GET    /alliances/:id/channels`                     | any auth | Effective shared set (local + remote)|
| `GET    /alliances/:id/channels/:ch_id/messages`     | any auth | Read messages (local or via peer)    |
| `POST   /alliances/:id/channels/:ch_id/messages`     | sender   | Post (federated to owning hub)       |

## Join flow

```
Hub A creates alliance        →  alliance_id (local)
Hub A: POST .../invite        →  signed invite token
Hub A → Hub B (out of band: paste link, etc.)
Hub B: POST .../join          →  authenticates to Hub A,
                                  Hub A verifies invite,
                                  both hubs persist membership
```

Out-of-band delivery is intentional — it's the same trust model as
sharing a server invite link in any community tool.

## Push invite flow (additive)

The pull flow above stays. Push invites are useful when the inviting
admin already knows the target hub's URL.

```
Hub A admin: Settings → Alliances → pick alliance → Invite tab
             "Send invite directly" — enters Hub B's URL + optional note
Hub A: POST /alliances/:id/push-invite { target_url, message? }
Hub A → Hub B: POST /federation/alliance-invite
               { alliance_id, alliance_name (Hub A's local label),
                 from_hub_url, message?, invite_token (Hub A-signed) }
Hub B: row in pending_alliance_invites; admins see card in
       Settings → Alliance invites (Accept / Decline)
Accept → same POST /alliances/:id/join as the pull flow,
         reusing the stored invite_token
Decline → row deleted, no callback
```

The receiving hub **polls `/alliances/pending-invites` on mount** of
the Alliance invites tab — no WebSocket push for this. The volume
(admin-to-admin, rare) doesn't justify a new realtime channel.

### Federation endpoint is unauthenticated

`POST /federation/alliance-invite` accepts unauthenticated POSTs. The
trust comes from the **invite token** inside the payload, which is a
Hub-A-identity signature over the alliance id (same primitive as the
pull-flow token). Anyone can drop a card in Hub B's pending list, but
accepting it triggers the normal join path — the join only succeeds
if the token verifies against Hub A's pubkey. A fake push invite at
worst clutters the pending list; it cannot create membership.

### Local labelling

The `alliance_name` shipped in the push payload is **Hub A's local
label** for the alliance. Hub B may store its own label after accept
and is never forced to adopt Hub A's. This matches the sovereignty
rule already implicit in the schema (`alliances.name` is per-hub) and
keeps the design symmetric with the pull flow, where Hub B picks the
name it stores at join time.

## Reading remote alliance messages

When Hub B fetches messages for an alliance channel that's owned by Hub A,
Hub B's `get_alliance_channel_messages` calls Hub A's federation endpoint
and caches results. For local channels, it loads from PostgreSQL directly.
**Reactions are loaded in both branches** via
`messages::load_reactions` (the helper was made `pub(crate)` for this).

## Recursive space sharing

Sharing extends beyond text/forum leaves: **any space type** is
shareable, and sharing a container shares the tree beneath it. "Space"
is the same nested unit as in
[nested-channels-ux.md](nested-channels-ux.md): banner / channel /
category / forum, and spaces nest.

**Sharing.** `POST /alliances/:id/channels` accepts an optional
`include_descendants` (defaults false). Clients send `true` when
sharing a category, so the whole subtree comes along. Sharing a single
leaf leaves it false.

**Effective set (computed at read time).** The effective shared set is
`explicit shares ∪ all descendants of include_descendants shares`,
resolved on each `GET` via a recursive CTE, depth-guarded at 32. This
gives **live semantics**:

- a sub-channel created after a category was shared is automatically
  shared;
- unsharing the root removes the whole subtree;
- a channel moved out of a shared category stops being shared.

No per-descendant rows are materialized — see
[decisions.md](decisions.md) (2026-07-05).

**Response shape.** `GET /alliances/:id/channels` entries gain:

- `channel_type` — `"text"` | `"forum"` | `"banner"` | `"spawner"`;
- `parent_id` — null unless the parent is **itself in the shared set**,
  so entries always form well-rooted trees;
- `is_category` — whether the entry is a container.

Old peers omit these fields; responses parse via serde defaults
(`channel_type` `"text"`, `parent_id` null, `is_category` false), so
the change is wire-compatible with un-upgraded alliance members.

**Message endpoints** resolve against the effective set (descendants
included). `POST` to a banner / category / spawner returns **400**;
`GET` on those returns an empty list.

**Client.** The web client (Wavvon-web) renders the shared tree in the
sidebar — categories as non-clickable folders, text/forum clickable,
banner/spawner dimmed — and now wires alliance channel open/post
(previously stubbed).

## Voice in alliance channels

**Status**: **shipped** — hub side 2026-08-22, web client 2026-08-29. Web
client + hub only; no desktop work, since both clients speak the same
WebTransport voice stack ([voice-transport-v2.md](voice-transport-v2.md),
shipped 2026-08-07). What is still deferred is listed at the end.

Two things below were wrong, and both were found by the tests rather than by
re-reading, so they are corrected in place with the reason kept:

- **The visitor's session cannot live in `sessions`.** That table has
  `public_key REFERENCES users(public_key)`, so a row for someone with no
  `users` row is impossible, and the additive-only migration rule rightly
  forbids dropping the constraint. The visit *is* the session — see the table
  below.
- **`voice_key_request` is not a client message.** It is `WsServerMessage`:
  the hub asks a sender to re-offer, and the client answers with another
  `voice_key_offer`. It is out of the WS allowlist.

> **Maintenance note**: this section pushes the file past the wiki's ~200-line
> budget. Split it out to `alliance-voice.md` (and relink from
> [README.md](README.md) and [voice.md](voice.md)) on the next edit that
> touches it.

### Decision — the owning hub's relay *is* the room; visitors dial it directly

A member of Hub B who joins voice in an alliance channel owned by Hub A
gets a **short-lived, voice-scoped session on Hub A** and talks to Hub
A's relay directly. One room, on one hub, one sender-id space, one E2E
key fan-out. Hub B's only job is to sign a grant saying "this pubkey is
my member and this channel is shared with us."

Same stance as alliance messages and forum federation — owning hub
authoritative ([forum.md](forum.md) §9). Voice is the one surface where
the client can skip the middle hop entirely, because it already dials a
hub's voice endpoint directly rather than through any proxy; that same
property is why the farm never proxies voice
([farm-impl.md](farm-impl.md)).

Note this **contradicts the old "needs a relay redesign" claim** this
section used to carry: nothing in the relay changes.

### Alternatives considered

- **Relay-to-relay mesh** — Hub B forwards its participants' datagrams
  into Hub A's room and mirrors the roster back. Rejected: `sender_id`
  is a per-channel u16 allocated locally, so two hubs collide; it needs
  a virtual-participant lifecycle in `voice_channels`, hub-to-hub
  relaying of `voice_key_offer` bundles, and a third failure domain
  (mid-hub down, both endpoints up). It buys one thing — the client
  keeps a single hub connection — and the web client is already
  multi-hub, so that is worth nothing.
- **Merge rooms across every member hub** — rejected on the same ground
  forum federation rejected replication: no authoritative copy means
  roster reconciliation and split-brain, for a surface where "one room
  on one server" is simply correct.

### Tradeoff

**Availability for simplicity.** Hub A offline ⇒ its shared voice
channel is unjoinable, exactly as its shared text channel already is. In
exchange: no change to the relay, the sender-id allocator, the E2E
construction, or the datagram format — so **no
[wire-format.md](wire-format.md) entry and no three-way identity-crate
mirror.** Second cost, named: a visitor's IP reaches Hub A. Disclosed in
the join affordance.

### The grant

An Ed25519-signed assertion by the origin hub, `{payload, signature}` —
the same primitive as the alliance invite token and hub badges
([server-tags.md](server-tags.md)), deliberately **not** a new
identity-crate envelope: only the two hubs and the client ever read it,
and no client must reproduce it byte-for-byte.

```
AllianceVoiceGrant {
  alliance_id, owner_hub_pubkey, channel_id,
  subject_pubkey,                       // visitor's canonical (master) pubkey
  origin_hub_pubkey, origin_hub_url,
  display_name,                         // roster only; hub-vouched
  issued_at, expires_at                 // issued_at + 300
}
```

Five minutes. A ticket to open one session, not a membership.

### Routes

**Origin hub — mint.** `POST /alliances/:id/voice-grant` body
`{ channel_id }`, in `hub/src/routes/alliances/voice.rs` (new,
Wavvon-server). Gates: caller is a member in good standing (not banned,
not muted, approved — the only local permission that means anything
about a remote channel); `channel_id` is in the alliance's **effective
shared set** via the existing resolver in
`hub/src/routes/alliances/channels.rs`, so `include_descendants` and the
depth-32 guard apply unchanged; entry `channel_type == "text"` else
`400 not_a_voice_space`; entry is remote, else `409 channel_is_local`
(use plain `voice_join`). Per-caller rate limit mirroring the
`badge_offer` limiter in `hub/src/rate_limit.rs`.

**Owning hub — admit.** `POST /auth/verify`
(`hub/src/auth/handlers.rs`) gains one optional field,
`alliance_voice_grant`. When present and the pubkey is not already a
member, Hub A verifies: signature against `origin_hub_pubkey`;
`owner_hub_pubkey` is this hub; `origin_hub_pubkey` is in
`alliance_members` and `channel_id` is in **Hub A's own** shared set for
that alliance (Hub A re-resolves — it never trusts B's view); not
expired; `subject_pubkey` equals the pubkey the challenge-response just
authenticated through `resolve_canonical_identity`; subject not banned
locally and not on a `block`-policy federated ban source.

The visitor's **identity is proven to Hub A by its own signature**, not
vouched by Hub B. Only `display_name` is hub-vouched.

On success Hub A issues a session with `scope = "alliance_voice"` and
**creates no `users` row** — no roles, no approval-queue entry, nothing
in `/users`. Visitor state is one additive table in
`hub/src/db/migrations.rs`:

```
alliance_voice_visitors(
  subject_pubkey PK, token UNIQUE, origin_hub_pubkey, origin_hub_url,
  display_name, channel_id, admitted_at, expires_at)
```

**The `token` is the point, not an extra.** A visitor holds no `sessions` row
at all, because `sessions.public_key` references `users` and a visitor has no
user row by design. Putting the bearer token here instead leaves `sessions`
meaning exactly what it always meant, and makes "a visitor is not a member"
structural rather than something a loosened join has to keep remembering. Both
auth paths — the HTTP extractor and `validate_ws_token` — try `sessions` first
and fall back to this table, in that order, so a member who also holds a visit
somewhere never loses their member session to the fallback.

Swept by the existing retention worker; `expires_at` also bounds the token,
so a late sweep cannot extend a visit.

### Scope enforcement — allowlist, not denylist

`hub/src/auth/middleware.rs` already carries `member` / `lobby`;
`alliance_voice` is a third value. It is an **allowlist** because a
denylist grows a hole every time a route is added. Reachable: `GET
/info` (capabilities, `voice_wt_url`, `voice_cert_hash`); the WS; `PUT
/identity/me/dh-key` and `GET /identity/:pk/dh-key` (E2E wrapping needs
both directions). Everything else → `403 alliance_voice_scope`.

On the WS only `voice_join`, `voice_leave`, `voice_speaking`,
`voice_key_offer` and `ping` are handled (`voice_key_request` is
server→client, see the status note above); every
other variant is dropped **with a log line**, not an `Other => {}`
no-op — the silent-fallthrough bug class `Wavvon-server`'s CLAUDE.md
names. `voice_join` is additionally checked against
`alliance_voice_visitors.channel_id`, so a visitor admitted for one
shared channel cannot join another.

### What does not change

`hub/src/voice_wt.rs`, `voice_channels`, `voice_sender_ids`,
`voice_next_sender_id`, `voice_pending_binds`, `voice_relay_active` —
untouched; a visitor is an ordinary pubkey in Hub A's maps. E2E sender
keys fan out over Hub A's WS to Hub A's participants, visitors included,
wrapped static-static X25519 to each recipient's DH key **which the
visitor uploads itself** over its own authenticated session — no hub
asserts a DH key for anyone. The datagram format is unchanged.

"One voice session per identity" ([decisions.md](decisions.md),
2026-08-21) holds *per hub*, so the hub will happily let a user hold a
local room on B and the visited room on A at once. That is correct — two
hubs — but the client must not, or the mic is live in two places.

### Web client

`clients/apps/web` plus the shared surface in `clients/packages/ui`.

- **Capability gate**, and one correction to the original plan: the
  affordance is gated on **our own** hub advertising `voice.alliance`,
  not the owner's. Our hub has to sign the grant, and we know its
  capabilities for free; the owner's half is checked when the grant is
  redeemed, and a hub that does not do alliance voice is refused before
  any signature of ours is sent. Gating on the owner at render time
  would mean asking every allied hub for `/info` on every load, for a
  button almost nobody presses.
- **Join**: the voice affordance on an alliance channel row calls
  `handleAllianceVoiceJoin(allianceId, channelId, confirm)` — `POST
  /alliances/:id/voice-grant` on the current hub, then `/auth/challenge`
  + `/auth/verify` (carrying the grant) on the returned
  `owner_hub_url`, then a WS to the owner, then `voice_join`, then
  `VoiceWtSession` with the returned `voice_wt_url` / `voice_token` /
  `voice_cert_hash`. `VoiceWtSession`
  (`clients/apps/web/src/platform/voice.ts`) took all three already — no
  change to it. The visitor session is deliberately **not** in the hub
  session map: it is not a hub the user joined, and everything walking
  `allSessions()` (hub list, restore, DM delivery, account switch) would
  be wrong about it.
- **One live session**: the join tears down any existing voice session,
  local or remote, first. The structural change this needed is that the
  socket owning the room is now a **parameter** through join, leave,
  watch, key offers and speaking, rather than implicitly the active
  hub's — leaving a room on the wrong socket is how a ghost is left in
  someone else's roster.
- **Roster**: visitors render `name · HubName` from `visiting_from` on
  the participant payload, muted rather than badged — the name is
  hub-asserted, so it must never read as a verified marker. The hub
  resolves it in `voice_identity`, which answers from `users` for a
  member and from `alliance_voice_visitors` (joined to the vouching
  hub's name) for everyone else.
- **Disclosure**: the join confirmation names the address being dialed,
  before anything is minted.
- If the user is already a full member of Hub A, the hub answers
  `/auth/verify` with their normal member session and ignores the grant
  entirely — the client needs no branch for it.

### Moderation

- **Owner sovereign**: Hub A can force-leave and ban a visitor; the ban
  is re-checked at every grant redemption. Additive per-share policy
  column on `alliance_shared_channels`, mirroring `forum_remote_write`:
  `voice_remote_join TEXT NOT NULL DEFAULT 'allowed'` ∈ `allowed` |
  `none`. It is set by re-sharing the channel with the field present
  (`POST /alliances/:id/channels`), same leave-it-alone semantics as
  `forum_remote_write`, and read back on the shared-channel list;
  admin UI is a checkbox on the share row. **Leaf channels only** — that
  route also rewrites `include_descendants`, so offering it on a
  category would silently unshare a subtree. A descendant with no direct
  share row gets one, which is how a single room inside a recursively
  shared category is closed.
- **Origin hub** can stop minting for its own members. It cannot evict
  an admitted visitor from Hub A's room; the 5-minute grant TTL and the
  session expiry bound that. Cross-hub push revocation is the
  coordination cost this design refuses to pay.
- **No visitor moderation powers, ever** — structural, via the
  allowlist, not a check someone can forget.

### Threat-model deltas

Over [threat-model.md](threat-model.md): an allied hub becomes an
**admission path into your voice rooms** — contained by
`voice_remote_join`, the mint limiter on the origin, a per-origin-hub
redemption limiter on the owner, unsharing, or leaving the alliance.
**Display-name spoofing** is advisory only and must never feed anything
assuming a proven name — in particular it never touches
`cert_issuances` ([hub-certifications.md](hub-certifications.md)).
**Not a membership escalation**: no `users` row, no roles, no message
read access.

### Deferred

Whisper *lists* defined on the origin hub (whispering a visitor already
works — targets resolve on Hub A). Screen share
([screen-share-webrtc.md](screen-share-webrtc.md)), soundboard and video
([video-voice.md](video-voice.md)) in a visited room — each needs its
own allowlist entries; additive later.

**A visit has never carried audio in a test.** The topology harness proves
admission across two real hubs — grant, redemption, confinement, policy — and
stops at the relay URL, exactly as the local suites do. Two clients on a real
network remains the only thing that proves a visitor is audible.

## What's not done

- **Member discovery beyond invite tokens** — no way to browse an
  alliance's membership; joining is still invite-driven.
- Game launch/lobby federation across alliance.

(Forum post/reply/reaction federation over alliance-shared channels
**shipped 2026-07-19** — [forum.md](forum.md) §9. This section used to
list it as not done.)

See [ROADMAP](../ROADMAP.md) and [future-features.md](future-features.md).
