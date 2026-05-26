# Bots — external bot ecosystem

External bots are third-party processes — any language, any host —
that connect to one or more hubs over the existing client WebSocket and
HTTP surface. They authenticate with their own Ed25519 keypair, declare
`is_bot: true` at handshake, and participate in channels they have been
invited to.

This page covers **external** bots only. **Internal service accounts**
(hub-local bot rows created by an admin and run by the hub operator)
are already shipped; they live in the hub DB the same way users do and
are out of scope here except where the wire shapes overlap.

> Status: designed, not built. Tracked as task #148 in
> [future-features.md](future-features.md) — this page supersedes the
> sketch there for external bots.

## What a bot is, exactly

A bot is an Ed25519 keypair plus an HTTP endpoint owned by the bot
operator. From the hub's perspective the keypair is the identity —
exactly the same primitive as a user. What separates a bot from a user:

- The `is_bot: true` flag self-declared at auth time and persisted on
  the bot's hub-local row.
- It carries no recovery phrase, no DH key (no E2E DM participation),
  no voice membership.
- It may advertise an HTTP endpoint (the **bot webhook**) that the hub
  POSTs slash-command invocations and event callbacks to.
- It is invited per-hub by pubkey, not discovered automatically.

Internal service accounts share the `is_bot` flag and the same per-row
shape; the only structural difference is the absence of an external
endpoint and any cross-hub membership.

## 1. Auth flow

Reuses the existing challenge-response signature flow (see
[identity.md](identity.md)) with one additional handshake claim.

1. Bot calls `GET /auth/challenge` and receives a nonce.
2. Bot signs the nonce with its Ed25519 private key.
3. Bot calls `POST /auth/verify` with `{ pubkey, signature,
   is_bot: true, bot_meta?: { name, avatar_url?, webhook_url?,
   commands?: [...] } }`.
4. Hub looks up the pubkey in `users`. The bot row must already exist
   (created by the invite flow in section 2). If it doesn't, the hub
   returns `403 bot_not_invited` — bots cannot self-register, the same
   way invite-only hubs already reject unknown users.
5. Hub verifies the signature, sets `users.is_bot = 1` (idempotent),
   optionally merges the `bot_meta` (see section 4), and issues a
   session token carrying a `kind: 'bot'` claim.
6. The bot opens the existing client WebSocket
   (`hub/src/routes/ws.rs` in Voxply-server) with that token.

Why reuse `users` (with `is_bot=1`) rather than a parallel `bots`
table: the role/permission, ban/mute, channel-membership, and message
foreign keys already point at user pubkeys. A separate table would
duplicate every constraint and break the existing `messages.author_pubkey`
shape. The flag is what `future-features.md` already anticipates and
what internal service accounts already use.

**Token lifetime**: bot tokens are long-lived but not eternal. Default
30 days; renewal is a fresh challenge-response. Revocation is
admin-removes-bot (section 2).

## 2. Invite flow (invite-by-pubkey)

A hub admin adds an external bot by pasting the bot's public key. No
discovery, no central registry — the operator publishes their bot's
pubkey wherever they publish it (their site, a hub directory listing,
DM), the admin pastes it.

1. **Admin pastes pubkey** in Hub Settings → Bots → Add bot. Optional
   fields: a local name/note, an initial role assignment.
2. **Hub creates the invite**: inserts a `users` row with the pubkey,
   `is_bot=1`, `approval_status='bot_pending'`, and a freshly minted
   `bot_invite_token` (single-use, ~24-hour TTL).
3. **Admin shares the invite token** with the bot operator out-of-band
   (copy button next to the row). The token is the only thing the bot
   needs to know — together with the hub URL — to accept.
4. **Bot accepts**: calls `POST /bots/accept-invite` with
   `{ pubkey, signature_over_token, bot_meta }`. Hub verifies the
   signature, flips `approval_status` to `'approved'`, merges
   `bot_meta`, and the bot can now authenticate normally (section 1).
5. **Removal**: admin clicks Remove. The user row's `is_bot_removed=1`
   flag is set; the hub rejects subsequent auth attempts and tears
   down any active session. The row is kept (not deleted) so existing
   `messages.author_pubkey` references stay valid.

Why a token rather than just whitelisting the pubkey: it proves the
operator actually controls the private key before any side effects
land. Pasting a pubkey alone could be a typo or an impersonation
attempt against a real operator; the signed-token round-trip catches
both.

Why not WS-push the invite (like alliance push invites): the bot
process isn't running on a hub and doesn't expose an inbound
federation endpoint. The pull-style "operator copies a token" is the
right shape for processes that connect outward only.

## 3. Slash commands

Slash commands are the primary way a bot is invoked. The hub owns
parsing and routing; the bot owns execution.

### Registration

A bot declares its commands at auth time (or via `PUT
/bots/me/commands` after) as an array of:

```
{ name: "roll", description: "...", args: "<NdM>",
  scope: "channel" | "dm", privileged: bool }
```

The hub stores them in `bot_commands` (one row per bot × command).
Conflicts (two bots register `/roll`) are resolved per-channel: the
client UI shows `/roll@botname` to disambiguate, and the hub routes
based on the explicit `@botname` suffix when present. Without a
suffix, the hub picks the bot that was invited to the channel first;
ties are vanishingly rare and the admin can rename via the directory.

Built-in hub commands (`/me`, `/shrug`, etc.) always win over bot
commands of the same name — the hub strips them before dispatch.

### Dispatch

1. User sends a message starting with `/`. The client posts it
   normally; the hub's message handler
   (`hub/src/routes/messages.rs` in Voxply-server) detects the slash
   prefix.
2. Hub resolves `(channel_id, command_name, optional @botname)` to a
   single bot via `bot_commands` + channel membership. No match →
   message is stored as a regular message (slash text isn't magic).
3. Hub does **not** persist the slash invocation as a message by
   default. The bot decides what to echo.
4. Hub POSTs to the bot's `webhook_url` with a signed envelope:

```
POST {webhook_url}
X-Voxply-Hub-Pubkey: <hex>
X-Voxply-Signature: <ed25519 over body>
X-Voxply-Timestamp: <unix>

{ type: "slash_command",
  hub_url, channel_id, message_id_hint,
  author: { pubkey, display_name },
  command: "roll",
  args_raw: "2d6",
  args_tokens: ["2d6"] }
```

5. Bot responds synchronously (within ~5s) with a `BotResponse`:

```
{ reply?: { body, attachments?, reply_to?: message_id },
  ephemeral?: bool,
  reactions?: [{ message_id, emoji }],
  defer?: bool }
```

- `reply.body` posts as a normal channel message authored by the bot
  (same pubkey, same `messages` row shape).
- `ephemeral=true` posts a message visible only to the invoking user
  (client-side filtered; the hub tags the message with
  `visible_to_pubkey`).
- `defer=true` means "I'll post asynchronously over WS" — the bot
  posts the reply via the normal `POST /messages` path within a
  reasonable window.

### Hub-handled vs bot-handled

| Command shape | Owner |
|---|---|
| `/me`, `/shrug`, formatting helpers | Hub (stripped before dispatch) |
| `/poll`, `/roll`, anything dynamic | Bot |
| Admin commands (`/kick`, `/ban`) | Hub-built-in or admin-tooling bots |

Rule of thumb: if the command only rewrites the user's own message
body, hub handles it. If it produces a *new* message or side effect,
bot handles it.

### Errors

- Webhook timeout / 5xx → hub posts an ephemeral error message to the
  invoker ("bot @name failed to respond"). No retry — slash commands
  are user-driven and visible; silent retries would double-post.
- Signature verification failure on the bot's response → same error,
  hub treats the response as discarded.

## 4. Bot directory (hub-local)

Each hub keeps a `bots` view (built from `users` rows where
`is_bot=1`) plus a `bot_profiles` table for the operator-supplied
metadata. The directory is **per-hub**, not federated — every hub
admin curates their own list. This matches the federated-not-
centralized stance: a global bot index would need a coordinator.

### Metadata a bot advertises

Sent in `bot_meta` at auth and `/bots/accept-invite`, stored in
`bot_profiles`:

- `name` — display name shown in mentions and the directory.
- `avatar_url` — optional; hub may proxy/cache.
- `description` — short blurb.
- `webhook_url` — required for slash commands.
- `commands` — see section 3.
- `homepage_url` — optional; "learn more" link in the directory UI.

The operator can update these any time via `PUT /bots/me/profile`. The
hub validates URL schemes (https only) and rejects webhooks that
resolve to private/loopback ranges in production.

### Admin UI

Hub Settings → Bots lists every bot row (pending invite, approved,
removed). Each row shows name, pubkey fingerprint, webhook URL,
declared commands, and last-seen timestamp. Admins can revoke,
rename (overrides the bot-supplied name), and adjust role assignment.

### What is *not* in this directory

- A list of "bots you could invite" — operators publish their pubkeys
  themselves; the hub doesn't crawl anything.
- Cross-hub bot reputation — folded into the future hub certifications
  design space ([future-features.md](future-features.md)). For now a
  bot proves itself per-hub by being invited.

## 5. Multi-hub

A single bot process can connect to N hubs simultaneously. Each
connection is independent:

- Separate WebSocket (one per hub).
- Separate auth handshake (each hub has its own session token).
- Separate `bot_profiles` row (the bot may advertise different
  command sets, different webhook URLs, even different display names
  per hub — operator's choice).
- Separate rate-limit budget (section 6).

The bot's webhook URL may be shared across hubs or per-hub; the
`X-Voxply-Hub-Pubkey` header lets the bot tell which hub a callback
came from. The signature header lets the bot verify the call really
came from the hub it claims to.

There is **no** "home hub for bots" concept. Bots are pure community-
axis actors — they participate in channels and respond to commands.
They have no personal-axis state (no DMs, no friends, no prefs to
sync) so the home hub list ([home-hub.md](home-hub.md)) does not
apply.

Failure modes: a hub going down only affects that hub's WS connection.
The bot reconnects with normal backoff. The bot's identity is the same
pubkey everywhere, so a user mentioning `@name` on Hub A vs Hub B is
talking to the same operator.

## 6. Permissions and rate limiting

### What a bot can do

A bot is a `users` row with roles, so it inherits the existing
permission system ([identity.md](identity.md) →
`hub/src/permissions.rs` in Voxply-server). A bot can be granted
`send_messages`, `manage_messages` (delete its own posts), or even
`manage_channels` — admins decide. The pubkey-keyed permission model
doesn't care that the actor is a bot.

### What a bot *cannot* do

Hard-coded in v1, regardless of role:

- **Cannot join voice (v1).** The voice relay (`voice/` crate in
  Voxply-desktop) currently handles only human microphone streams and
  has no audio-injection path for bot processes. Blocked for now, not
  forever — see *What's deferred* below for the voice-bot design space
  (music playback, TTS, translation).
- **Cannot send DMs from a bot identity** (v1). The DM outbox model
  ([federation.md](federation.md)) assumes a human-curated friend
  graph; bot DMs are a separate design space. Deferred.
- **Cannot participate in E2E encrypted DMs** — bots publish no DH
  key ([e2e-encryption.md](e2e-encryption.md) requires one).
- **Cannot acknowledge or submit "not a bot" challenges** —
  paradoxical and unnecessary; bots are already invited explicitly.
- **Cannot be a hub admin** in the federation sense — federation
  identity is the hub's own keypair, not any user's.

### Rate limiting

Bots get tighter per-second / per-minute caps than humans on write
endpoints. Defaults:

- `POST /messages`: 5/sec sustained, 30/minute burst.
- `PUT /bots/me/profile`: 1/minute.
- Slash-command response posts: bypass the message rate limit when
  posted within the 5s deferred window (one reply per invocation).

The limits are per-bot-per-hub, enforced in the existing rate-limit
middleware. Admins can override per-bot via the directory UI when a
bot genuinely needs to spray (e.g., a polling-result announcer).

## 7. Wire changes — scope for the backend engineer

This is the change list, not the implementation. Repo: **Voxply-server**
unless otherwise noted.

### DB (`hub/src/db/migrations.rs`)

- `users` gains `is_bot INTEGER DEFAULT 0`, `is_bot_removed INTEGER
  DEFAULT 0`, `bot_invite_token TEXT`, `bot_invite_expires INTEGER`.
- New `bot_profiles(pubkey PK, name, avatar_url, description,
  webhook_url, homepage_url, updated_at)`.
- New `bot_commands(pubkey, name, description, args, scope,
  privileged, PRIMARY KEY (pubkey, name))`.
- `messages` gains `visible_to_pubkey TEXT NULL` for ephemeral
  slash-command replies (additive; null = normal broadcast).
- New `approval_status` value `'bot_pending'` accepted in the existing
  column.

### Routes

- `POST /bots/accept-invite` — bot signs the invite token; hub
  approves the row.
- `GET /bots` — list directory (auth: any member).
- `POST /bots` — admin pastes pubkey, creates the pending row, returns
  the invite token.
- `DELETE /bots/:pubkey` — admin removes.
- `PUT /bots/me/profile`, `PUT /bots/me/commands` — bot updates its
  own metadata.
- `GET /bots/me` — bot fetches its own current profile (handy for
  reconnects).
- The existing `POST /auth/verify` accepts `is_bot: true` and an
  optional `bot_meta` block.
- The existing `POST /messages` accepts `visible_to_pubkey` only when
  the author is `is_bot=1` AND the message is the immediate response
  to a tracked slash invocation.

### Outbound (hub → bot)

- Signed `POST {webhook_url}` envelope (section 3). New module
  `hub/src/bots/dispatch.rs` owns the signing, timeout, and error
  surfacing. Signing uses the hub's existing federation keypair —
  same primitive as `hub/src/federation/client.rs`.

### Wire models

- `BotMeta`, `BotProfile`, `BotCommand`, `SlashInvocation`,
  `BotResponse`, `BotInviteToken`. Shared between hub and clients;
  define in `hub/src/routes/bot_models.rs` and re-export through the
  existing chat models module so the desktop client picks them up.

### Client (`Voxply-desktop`)

- Hub Settings → Bots tab: list, add (paste pubkey), copy invite
  token, revoke. UI only; no Tauri bridge changes.
- Slash-command autocomplete in the composer reads from a per-hub
  cached `bot_commands` list (fetched once on connect, refreshed on
  the bot-updated event).
- New WS envelope variants: `bot_added`, `bot_removed`,
  `bot_profile_updated` for live directory refresh.
- Ephemeral message rendering: messages with `visible_to_pubkey ==
  my_pubkey` render with a "only you can see this" affordance; other
  pubkeys filter them out (defence-in-depth — the hub also filters on
  send).

### Browser / Android clients

[`browser-client.md`](browser-client.md) and
[`android-client.md`](android-client.md): same wire shapes. No
platform-specific work needed beyond the directory UI parity. Voice-
specific exclusions for bots don't apply to either client.

## Tradeoffs

**Decision**: external bots are first-class members (`users` row +
`is_bot=1`) with an opt-in webhook for slash-command dispatch.
Invite-by-pubkey, per-hub directory, no central index.

**Alternative considered**: an outbound-webhook-only model (no
persistent bot identity, hub POSTs events to a registered URL,
replies come back as anonymous messages). Rejected: it cannot
participate in the permission/role/ban model, cannot author messages
that survive a hub restart with a stable identity, and would need a
parallel auth scheme. Bots-as-users reuses everything we already have.

**Alternative considered**: a central bot directory (one shared list
across hubs). Rejected on the same grounds as the central hub registry
([decisions.md](decisions.md)) — federated communities curate their
own bot lists; cross-hub reputation is a future hub-certifications
problem, not a bot-system problem.

**Tradeoff accepted**: the operator must distribute their bot's
pubkey out-of-band (the same way hub URLs are distributed today).
That is a friction tax; we accept it because it keeps the trust
boundary clean — every hub admin makes an explicit decision about
every bot.

## What's deferred

- **Bot DMs** — bots as DM participants (notifications, transactional
  messages). Needs a friend-graph rethink and probably a separate
  `bot_dms` table; not in v1.
- **OAuth-style scoped tokens per capability** — today a bot's token
  is broad ("act as this bot identity"). Capability tokens
  ("subscribe to channel X only", "post to channel Y only") are a
  follow-on once we see real abuse patterns.
- **Cross-hub bot reputation / certifications** — folded into the
  hub certifications design space ([future-features.md](future-features.md)).
- **Bot-to-bot interaction** — explicitly not designed; a bot
  receiving another bot's slash output is allowed but not encouraged.
- **Async event subscriptions over webhook** (e.g., "POST me every
  channel message"). Bots get events over their WebSocket like users
  do; a webhook firehose would be a denial-of-service magnet against
  the bot operator. The webhook is for synchronous slash dispatch
  only in v1.
- **Hub-to-hub bot federation** — a bot invited on Hub A is *not*
  automatically known to Hub B in an alliance. The bot operator
  invites it per hub. Federated bot identity is a possible v2 if it
  proves painful.
- **Sandboxed in-hub bot execution** — running bot code inside the
  hub process (the internal-service-account path) is already shipped;
  external bots intentionally run outside the hub for isolation.
- **Voice bots** — music playback, TTS, live translation, and
  recording bots are all valid use cases and explicitly wanted. The
  blocker is the voice relay (`voice/` crate): it only handles
  microphone capture today and has no bot audio-injection path. What
  needs to be added: a bot-audio input channel in the relay (a bot
  process pushes a PCM/Opus stream over a local or network socket; the
  relay mixes it into the voice channel the same way it would a
  human's mic). The `kind: 'bot'` session-token check at the UDP
  handshake should become a capability gate (`can_speak_voice`) rather
  than a hard reject. Design note: a music bot connecting to N hubs
  simultaneously is a significant bandwidth multiplier on the relay —
  rate-limit and admin-permission scaffolding needs to be in place
  before enabling this.
- **Screen-share / video bots** — a bot injecting a video stream into
  the screen-share feature (watch-party bot, stream announcer, etc.).
  The existing screen-share design ([screen-share.md](screen-share.md))
  uses `getDisplayMedia` which is human-only: the client captures a
  real display surface and sends it as `ScreenShareChunk` WS envelopes.
  A video bot needs the inverse path: the bot process pushes
  pre-encoded VP8/Opus WebM chunks over the WebSocket; the hub relays
  them to channel members exactly as it does for human screen-share.
  What needs to be added: a `ScreenShareBot` envelope variant that
  bypasses `getDisplayMedia`, a capability gate (`can_share_screen`) on
  bot session tokens, and hub-side validation that the pusher is a
  bot identity (not a client trying to forge a remote display source).
  The v2 WebRTC path in screen-share.md (P2P via hub SDP/ICE signaling)
  could accommodate bot video injection without the chunk-relay
  bandwidth overhead — deferred to the same v2 milestone.
- **Bot-launched games (modal)** — a bot sending a message that
  contains a "Play" call-to-action; clicking it opens a full modal
  overlay running an HTML5 game in the Tier 1 iframe sandbox
  ([gaming.md](gaming.md)). The modal gives the game a proper
  interaction surface — keyboard, mouse, gamepad — without competing
  with the chat layout or breaking focus. The bot's message in chat
  acts only as the launch card (thumbnail, name, description, button);
  the game itself lives entirely inside the modal. Closing the modal
  returns the user to the channel with no state loss.

  The design would be a new `BotResponse` field —
  `game?: { entry_url, name, description?, thumbnail_url? }` — that
  the client renders as a launch card on the bot's message. The
  postMessage SDK already runs in a sandboxed iframe so the security
  surface is contained; the main addition is a multiplayer-state bridge
  (game posts scores/moves to the bot via `postMessage`; bot relays
  over WS so other channel members see the same state). Deferred until
  the Tier 2 multiplayer gaming work is designed ([gaming.md](gaming.md)
  — Tier 2 is currently undesigned).
