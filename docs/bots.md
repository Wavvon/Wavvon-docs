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
   (`hub/src/routes/ws.rs` in Wavvon-server) with that token.

Why reuse `users` (with `is_bot=1`) rather than a parallel `bots`
table: the role/permission, ban/mute, channel-membership, and message
foreign keys already point at user pubkeys. A separate table would
duplicate every constraint and break the existing `messages.author_pubkey`
shape. The flag is what `future-features.md` already anticipates and
what internal service accounts already use.

**Token lifetime**: bot tokens are long-lived but not eternal. Default
30 days. Revocation is admin-removes-bot (section 2).

**Token renewal without a service gap**: the bot renews proactively
while its current session is still live — no disconnect required.

1. Bot calls `GET /auth/challenge` and signs the nonce as usual.
2. Bot calls `POST /auth/renew` (same shape as `/auth/verify` but
   requires a valid `Authorization: Bearer <current_token>` header).
3. Hub verifies the current token is not revoked, verifies the
   signature, and returns a new token with a fresh 30-day window.
4. Bot stores the new token and uses it on the next reconnect. The
   old token remains valid until its original expiry — the running
   WS session is unaffected.

The hub sends a `token_expiring_soon` push over the bot's WS 72 hours
before expiry so the bot can renew without polling the expiry date:

```json
{ "type": "token_expiring_soon", "expires_at": 1748822400 }
```

If the bot ignores the warning and the token expires, the hub closes
the session with reason `token_expired` (section 2) and the bot must
do a full re-auth.

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
   flag is set. Before tearing down the active WS session, the hub
   sends a disconnect signal so the bot process can handle it cleanly:
   ```json
   { "type": "bot_removed", "reason": "admin_revoked", "hub_url": "..." }
   ```
   The hub then closes the WS with a standard close frame. Other
   disconnect reasons the bot may receive:
   - `token_expired` — session token reached its 30-day lifetime.
   - `server_shutdown` — hub is restarting.
   - `rate_limit_escalated` — repeated rate-limit violations.

   On receiving `bot_removed / admin_revoked` the bot process should
   stop reconnection attempts for that hub; all other reasons are
   transient and the bot should reconnect with normal backoff.

   The user row is kept (not deleted) so existing
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
   (`hub/src/routes/messages.rs` in Wavvon-server) detects the slash
   prefix.
2. Hub resolves `(channel_id, command_name, optional @botname)` to a
   single bot via `bot_commands` + channel membership. No match →
   message is stored as a regular message (slash text isn't magic).
3. Hub does **not** persist the slash invocation as a message by
   default. The bot decides what to echo.
3b. If `command.privileged = true` and the invoking user does not hold
   the `manage_messages` permission (or higher), the hub posts an
   ephemeral **"You don't have permission to use this command."** to the
   invoker and stops. The webhook is never called; the bot sees nothing.
4. Hub POSTs to the bot's `webhook_url` with a signed envelope:

```
POST {webhook_url}
X-Wavvon-Hub-Pubkey: <hex>
X-Wavvon-Signature: <ed25519 over body>
X-Wavvon-Timestamp: <unix>

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
`X-Wavvon-Hub-Pubkey` header lets the bot tell which hub a callback
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
`hub/src/permissions.rs` in Wavvon-server). A bot can be granted
`send_messages`, `manage_messages` (delete its own posts), or even
`manage_channels` — admins decide. The pubkey-keyed permission model
doesn't care that the actor is a bot.

### What a bot *cannot* do

Hard-coded in v1, regardless of role:

- **Cannot join voice (v1).** The voice relay (`voice/` crate in
  Wavvon-desktop) currently handles only human microphone streams and
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

### Per-user command cooldowns

Independent of the per-bot limits above, each slash command carries a
**per-user cooldown** that the hub enforces before dispatching.
Default: 3 seconds. Bots set it per-command at registration time:

```json
{ "name": "roll", "description": "...", "cooldown_seconds": 5 }
```

If a user invokes `/roll` again before the cooldown expires, the hub
posts an ephemeral **"⏱ You can use /roll again in N seconds."** and
does not call the webhook. The bot never sees the spam; no webhook
budget is consumed.

The cooldown is tracked in an in-memory store keyed by
`(bot_pubkey, command_name, invoker_pubkey)` — same infrastructure
as the existing rate limiter. `bot_commands` gains a
`cooldown_seconds INTEGER DEFAULT 3` column.

## 7. Wire changes — scope for the backend engineer

This is the change list, not the implementation. Repo: **Wavvon-server**
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

### Client (`Wavvon-desktop`)

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

## 8. Event subscriptions

Bots receive hub events over their existing WebSocket connection — the
same session opened in section 1. A bot declares which event types it
wants at auth time (in `bot_meta`) or updates at any time via
`PUT /bots/me/subscriptions`. The hub delivers only subscribed events;
unsubscribed events are never sent.

### Available events

| Event | Key payload fields | Notes |
|---|---|---|
| `member.joined` | `pubkey`, `display_name`, `invited_by?` | Hub join |
| `member.left` | `pubkey` | Voluntary leave |
| `member.kicked` | `pubkey`, `by_pubkey`, `reason?` | Admin action |
| `member.banned` | `pubkey`, `by_pubkey`, `reason?` | |
| `member.unbanned` | `pubkey`, `by_pubkey` | |
| `member.role_changed` | `pubkey`, `role_id`, `action: 'added'|'removed'`, `by_pubkey` | |
| `member.invite_created` | `inviter_pubkey`, `invite_code`, `max_uses?`, `expires_at?` | |
| `member.invite_used` | `invitee_pubkey`, `invite_code`, `inviter_pubkey` | |
| `voice.joined` | `pubkey`, `channel_id` | |
| `voice.left` | `pubkey`, `channel_id` | |
| `voice.moved` | `pubkey`, `from_channel_id`, `to_channel_id` | |
| `voice.server_muted` | `pubkey`, `by_pubkey`, `muted: bool` | Admin mute/unmute |
| `voice.server_deafened` | `pubkey`, `by_pubkey`, `deafened: bool` | |
| `message.created` | `channel_id`, `message_id`, `author_pubkey`, `content_preview?` | High-volume; channel scope required — see below |
| `message.edited` | `channel_id`, `message_id`, `author_pubkey` | |
| `message.deleted` | `channel_id`, `message_id`, `deleted_by_pubkey` | |
| `message.bulk_deleted` | `channel_id`, `message_ids[]`, `deleted_by_pubkey` | |
| `message.reaction_added` | `channel_id`, `message_id`, `reactor_pubkey`, `emoji` | |
| `message.reaction_removed` | same shape | |
| `message.mention_bot` | `channel_id`, `message_id`, `author_pubkey`, `mention_preview` | Targeted; no capability needed — see below |
| `message.pinned` | `channel_id`, `message_id`, `pinned_by_pubkey` | |
| `channel.created` | `channel_id`, `name`, `kind`, `created_by_pubkey` | |
| `channel.deleted` | `channel_id`, `name` | |
| `channel.updated` | `channel_id`, `changed_fields[]`, `by_pubkey` | |
| `hub.settings_changed` | `changed_fields[]`, `by_pubkey` | |
| `hub.invite_created` | `invite_code`, `by_pubkey` | |
| `moderation.timeout` | `pubkey`, `until`, `by_pubkey` | When timeout feature ships |
| `bot.added` | `bot_pubkey` | |
| `bot.removed` | `bot_pubkey` | |

### Subscription scope

Subscriptions are declared per event type with an optional channel
filter:

```json
{
  "subscriptions": [
    { "event": "member.joined" },
    { "event": "member.banned" },
    { "event": "voice.joined" },
    { "event": "message.created", "channels": ["general", "announcements"] }
  ]
}
```

`message.created` (and `message.edited`, `message.deleted`) **require**
an explicit `channels` list — a hub-wide message firehose is too high
volume and a privacy concern for bots that don't need full message
access. All other events are hub-scope by default. The hub enforces
this at subscription time and silently drops `message.*` subscriptions
without a channel list.

`message.mention_bot` is the exception: it is **hub-scoped with no
channel list required**. The hub delivers it only to the bot(s) whose
name or pubkey appears in the message — it is already targeted, so the
privacy concern that gates `message.created` does not apply. The
payload carries a `mention_preview` (first 100 chars of the message
body), which is enough for a "you were mentioned, go look" handler.
Bots that need the full message body on mention should combine this
event with a `message.created` subscription on the relevant channels
(with `can_read_message_content`).

### Wire shape

Events arrive over the bot's WebSocket as a `hub_event` envelope:

```json
{ "type": "hub_event",
  "event": "member.joined",
  "hub_url": "https://...",
  "at": 1748217600,
  "payload": { "pubkey": "...", "display_name": "player42", "invited_by": "..." } }
```

Payload shapes per event type are defined in
`hub/src/routes/bot_models.rs` alongside the other bot wire types.

### Native audit log

The same event stream feeds a **native audit log** — a hub-admin-only
view in Hub Settings that records the last N days of key events (joins,
kicks, bans, role changes, bulk deletes, settings changes) with no bot
required. It is the minimum viable moderation tool for hubs that don't
run bots.

Advanced logging — message content archival, pattern matching,
cross-referencing, alerting — is left to the bot ecosystem. Wavvon
provides the event stream; bots provide the tooling on top of it. This
matches the gaming philosophy: we build the platform primitive, not
the application.

### Wire changes

- `bot_subscriptions(pubkey, event_type, channel_id NULL)` — one row
  per bot × event type × optional channel. Replaced atomically on
  `PUT /bots/me/subscriptions`.
- `PUT /bots/me/subscriptions` — replaces the full subscription set for
  the authenticated bot.
- Hub event dispatcher: `hub/src/routes/ws.rs` broadcast path extended
  to fan out `hub_event` envelopes to subscribed bots. New module
  `hub/src/bots/events.rs` owns subscription matching and push.
- `hub_audit_log(id, event_type, at, actor_pubkey, target_pubkey,
  channel_id, payload_json)` — append-only, retention configurable
  (default 90 days). Written by the same event dispatcher.
- `GET /admin/audit-log` — cursor-paginated, filterable by event type
  and date range. Admin-only.

---

## 9. Incoming webhooks

Incoming webhooks are a lighter primitive than external bots: a secret
URL the hub admin generates; a third-party service POSTs a message to
it; the hub publishes the message to a target channel. No Ed25519
keypair, no WebSocket session, no slash commands — just HTTP POST.

Typical use: CI/CD build results, uptime alerts, game score
announcements, any "push a message into a channel from an external
system" need that doesn't require two-way interaction.

### How it works

1. Hub admin opens Hub Settings → Integrations → Incoming Webhooks,
   picks a target channel, optionally sets a display name and avatar.
   Hub generates:
   ```
   POST https://{hub}/webhooks/{webhook_id}/{secret_token}
   ```
2. Admin copies the URL and configures the external service with it.
3. External service POSTs:

```json
{ "content": "Build #42 passed.",
  "username": "CI Bot",
  "avatar_url": "https://example.com/cibot.png",
  "embeds": [] }
```

4. Hub publishes the message to the target channel, authored by a
   webhook identity row (`is_bot=1`, `is_webhook=1`) using the webhook's
   name and avatar. The message gets an `APP` badge (see section 10).

`content` is required. `username` and `avatar_url` override the
webhook's stored name/avatar for that message. `embeds` is reserved
for a future rich-embed format; ignored today.

### What incoming webhooks are not

- They cannot read messages, receive events, or respond to commands.
- One webhook = one target channel. Cannot post to multiple channels.
- They don't hold a WS session and never appear in the member list.
- The secret URL is their only credential — there is no keypair.

### Security

- The secret token in the URL is the sole credential. Rotate if
  exposed: admin regenerates from the settings UI; the old token is
  invalidated immediately.
- Hub rejects webhook targets that resolve to private/loopback ranges
  (same rule as external bot `webhook_url` validation).
- Rate limit: 5 messages/minute per webhook, configurable by admin.
- Optional HMAC verification: the sender may include
  `X-Wavvon-Signature: <HMAC-SHA256 of body, keyed by the secret token>`.
  When present, the hub verifies it and rejects mismatches. Not
  required but recommended for sensitive channels.

### Wire changes

- `users` gains `is_webhook INTEGER DEFAULT 0` (analogous to `is_bot`).
- `webhooks(id, channel_id, secret_token_hash, display_name,
  avatar_url, created_by_pubkey, rate_limit, active)` table.
- `POST /webhooks/:id/:token` — public (no auth header), verifies token
  by constant-time hash comparison, publishes message to channel.
- `POST /admin/webhooks` — admin creates a webhook; returns the full
  URL including the raw token (only time the raw token is returned).
- `DELETE /admin/webhooks/:id` — deletes. `PATCH /admin/webhooks/:id`
  to regenerate the token or update name/avatar/rate-limit.

---

## 10. Visual identity

The client must make clear to every user whether a message came from a
human, an interactive bot, or an incoming webhook integration.

### BOT and APP badges

| Row type | Badge | Where it appears |
|---|---|---|
| `is_bot=1` | **BOT** | Message author line, member list, mention autocomplete, hover card |
| `is_webhook=1` | **APP** | Message author line only (webhooks have no session, no member list entry) |

The badge is small, uses the accent color, and is non-interactive. It
appears immediately after the display name in every context where the
name is shown. The distinction between BOT and APP signals: BOT means
"an interactive process you can talk to"; APP means "a one-way
integration posting notifications."

### Member list

Bots are grouped in a **Bots** subsection at the bottom of the member
list, below all human member sections, collapsed by default. The
section shows the bot count when collapsed (`Bots — 3`). Webhook
identities do not appear in the member list.

### Hover / click card

Clicking a bot's name or avatar opens a card showing:

- Display name + BOT badge.
- Avatar.
- Description (from `bot_profiles.description`).
- Declared slash commands (name + one-line description each).
- "This is an automated account" notice.
- No webhook URL, no private metadata, no operator pubkey fingerprint
  (that's admin-only, visible only in Hub Settings → Bots).

### Mention autocomplete

When a user types `@` in the composer, bots appear in the autocomplete
list with their BOT badge inline so the user can distinguish them from
human members at a glance.

### Ephemeral messages

Slash-command replies with `ephemeral=true` render with:

- A visually distinct background (slightly inset, lower opacity).
- The label **"Only you can see this"** beneath the message body.
- No persistent storage — the hub delivers them only to the invoker's
  active WS session. They disappear on reload. Other members never
  receive them.

---

## 11. Message components

Components are interactive elements attached to a bot message —
buttons and select menus that let users respond without typing a slash
command. Useful for confirmation flows, polls, role pickers, paginated
results, and any multi-step interaction.

### Component types (v1)

**Button**:
```json
{ "type": "button",
  "custom_id": "confirm_ban_abc123",
  "label": "Confirm",
  "style": "danger",
  "disabled": false }
```
`style`: `primary` (accent color), `secondary` (neutral), `danger`
(red). `disabled: true` greys the button without removing it.

**Select menu**:
```json
{ "type": "select",
  "custom_id": "pick_role",
  "placeholder": "Choose a role…",
  "min_values": 1,
  "max_values": 1,
  "options": [
    { "label": "Raider", "value": "raider", "description": "PvE content" },
    { "label": "Casual",  "value": "casual"  }
  ] }
```

Components are grouped into **rows** (max 5 components per row, max 5
rows per message = 25 total). Layout:

```json
"components": [
  { "type": "row", "components": [ ...buttons... ] },
  { "type": "row", "components": [ { select } ] }
]
```

### Attaching components to messages

- In a `BotResponse`: add a `components` field alongside `reply`.
- Via `POST /messages` directly: include `components` in the body.
  The hub rejects `components` on messages authored by non-bots.

### Interaction dispatch

1. User clicks a button or submits a select. Client sends over WS:
   ```json
   { "type": "component_interaction",
     "message_id": "...",
     "custom_id": "confirm_ban_abc123",
     "values": [] }
   ```
2. Hub resolves the message's author (the bot) and POSTs to its
   `webhook_url` with the same signing envelope as slash dispatch:
   ```json
   { "type": "component_interaction",
     "hub_url": "...", "channel_id": "...", "message_id": "...",
     "custom_id": "confirm_ban_abc123",
     "values": [],
     "user": { "pubkey": "...", "display_name": "..." } }
   ```
3. Bot responds within ~5s with a `ComponentResponse`:
   ```json
   { "update"?:          { "body"?: "...", "components"?: [...] },
     "ephemeral_reply"?: { "body": "Done." },
     "defer"?:           true }
   ```
   - `update` edits the original message in-place (body and/or
     components — e.g., disable the button after use, clear the select).
   - `ephemeral_reply` sends a reply visible only to the interacting user.
   - `defer` works the same as for slash commands (section 3).

4. Hub applies the update and fans out the changed message to channel
   members; ephemeral reply goes only to the interacting user.

Per-component anti-spam: hub rate-limits to **1 interaction per user
per component per 3 seconds**. Excess attempts are silently dropped
client-side without hitting the webhook.

### Component lifetime

Components expire after a configurable TTL (default 24 hours, set via
`expires_at` on the component row). After expiry the hub rejects
further interactions and the client renders them as disabled. A bot
can also explicitly clear components by updating the message with
`components: []`.

### Wire changes

- `message_components(id, message_id, row_idx, component_idx, type,
  config_json, expires_at)` table.
- `POST /messages` body gains `components?: Row[]` for bot authors.
- New client → hub WS envelope `component_interaction`.
- `hub/src/bots/dispatch.rs` handles `component_interaction` dispatch
  (same signing + timeout logic as slash commands).
- New `ComponentResponse` wire model in `hub/src/routes/bot_models.rs`.
- `PATCH /messages/:id/components` — internal route for applying an
  `update` response; not publicly documented.

---

## 12. Event replay on reconnect

When a bot's WS drops and reconnects, it can request a replay of
events it missed. This closes the audit-gap window for logging and
moderation bots.

### Sequence numbers

Every event written to `hub_audit_log` gets a **monotonic sequence
number** (`seq`) scoped to the hub. The hub includes the current `seq`
in the WS welcome envelope:

```json
{ "type": "hello", "hub_url": "...", "live_seq": 8471 }
```

### Resuming after a disconnect

On reconnect, the bot sends a `resume` message immediately after auth:

```json
{ "type": "resume", "since_seq": 8450 }
```

Hub replays audit log entries from `seq 8451` onward, filtered to the
bot's subscriptions, as `hub_event` envelopes with `"replayed": true`.
Live events are buffered during replay to avoid interleaving.

Replay complete:

```json
{ "type": "replay_complete", "replayed": 21, "live_from_seq": 8472 }
```

After this the bot is fully caught up and live delivery resumes.

### Limits

| Condition | Hub response |
|---|---|
| Within replay window (default 72 h) | Normal replay |
| Beyond window | `{ "type": "replay_unavailable", "earliest_seq": N, "earliest_at": T }` |
| Very large replay | Batched at 2 000 events/s; bot must consume before next batch |

When `replay_unavailable`, the bot must decide whether to resync from
scratch (e.g., re-read member list, re-audit pinned messages) or
accept the gap. The hub does not decide this on the bot's behalf.

### Wire changes

- `hub_audit_log` gains `seq INTEGER PRIMARY KEY AUTOINCREMENT`
  (SQLite auto-increment; Postgres equivalent: `BIGSERIAL`).
- WS welcome envelope `hello` gains `live_seq`.
- New client → hub envelope `resume: { since_seq }`.
- New hub → bot envelopes `replay_complete` and `replay_unavailable`.
- `hub_event` envelopes gain optional `"replayed": true`.

---

## 13. Message content access

By default, `message.created` and `message.edited` events deliver only
a `content_preview` — the first 100 characters of the body, with
attachments omitted. Full content requires the
`can_read_message_content` capability.

### Tiers

| Field | Default | With `can_read_message_content` |
|---|---|---|
| `content_preview` (≤100 chars) | ✓ | ✓ |
| Full `content` | — | ✓ |
| `attachments[]` | — | ✓ |
| `reply_to` (quoted message id) | — | ✓ |
| `before` / `after` on `message.edited` | — | ✓ |

### Declaring capabilities

A bot declares required capabilities in `bot_meta.capabilities` at
auth time:

```json
{ "capabilities": ["can_read_message_content"] }
```

The hub stores this in `bot_profiles`. The admin invite UI surfaces
a warning before generating the invite token:

> **⚠ This bot requests access to full message content.**
> It will be able to read every message in its subscribed channels.

This is a speed bump, not a hard block — the admin proceeds with full
knowledge. No bot gains full message access silently.

### Capability registry

Capabilities are a general mechanism. All currently defined values:

| Capability | What it unlocks |
|---|---|
| `can_read_message_content` | Full body + attachments in `message.*` events |
| `can_speak_voice` | Bot audio injection into voice relay (deferred) |
| `can_share_screen` | Bot video stream injection into screen-share (deferred) |

The hub rejects unknown capability strings at auth time so capability
strings can be validated without a catch-all.

### Wire changes

- `bot_profiles` gains `capabilities TEXT` (JSON array, default `'[]'`).
- `hub/src/bots/events.rs` checks `can_read_message_content` before
  populating `content`, `attachments`, `reply_to` on message event
  payloads.
- Invite UI renders capability warnings before generating the token.

---

## 14. Channel scope

A bot is invited to a hub but can be restricted to a subset of
channels. This limits what events it receives and where it can post.

### Default

Hub-wide access to all **public** channels — matching human member
behavior. Private channels are excluded unless explicitly granted.

### Restricting scope

Hub Settings → Bots → [bot name] → Channel Access: switch from "All
public channels" to a checklist. Only listed channels are in scope.

What "in scope" enforces:

- Hub delivers only events whose `channel_id` is in scope (including
  `message.*` events, `channel.updated`, voice events, etc.).
- `POST /messages` returns `403 channel_out_of_scope` if the target
  is outside scope.
- Slash commands from users in out-of-scope channels are not dispatched.
- Client autocomplete only shows the bot's commands in channels where
  the bot is in scope.
- Component interactions from out-of-scope channels are dropped.

Channel scope is **additive with** event subscriptions: both filters
must pass for an event to be delivered.

### Private channels

A private channel can be added to a bot's scope, but only by an admin
(same gate as admitting a human member to a private channel).
`can_read_message_content` applies as normal within private channels.

### Wire changes

- `bot_channel_scope(bot_pubkey, channel_id, PRIMARY KEY (bot_pubkey,
  channel_id))` — empty = hub-wide (default); populated = restricted.
- `PUT /admin/bots/:pubkey/channels` — replaces scope list atomically.
  Empty body resets to hub-wide.
- `hub/src/bots/events.rs` and the `POST /messages` middleware both
  check scope before acting.
- Client command-autocomplete filters by scope at query time.

---

## 15. Rich embeds

Embeds are structured cards rendered below a message body. They let
bots post formatted results — build reports, scoreboards, weather
cards, search results — without cramming everything into markdown text.

### Format

```json
{
  "embeds": [
    {
      "title":         "Build #42 passed",
      "url":           "https://ci.example.com/builds/42",
      "description":   "All 134 tests green. Deploy queued.",
      "color":         "#22c55e",
      "fields": [
        { "name": "Branch",   "value": "main",   "inline": true },
        { "name": "Duration", "value": "1m 23s", "inline": true }
      ],
      "thumbnail_url": "https://example.com/thumb.png",
      "image_url":     "https://example.com/graph.png",
      "footer":        { "text": "CI Bot · 14:32 UTC" }
    }
  ]
}
```

All fields except `title` or `description` (at least one required)
are optional.

| Field | Limit | Notes |
|---|---|---|
| `title` | 256 chars | Becomes a link if `url` is also set |
| `url` | — | https only; makes `title` clickable |
| `description` | 2 048 chars | Markdown supported |
| `color` | — | CSS hex `#rrggbb`; defaults to the theme accent |
| `fields` | max 25 | Each `name` ≤256, `value` ≤1 024; `inline: true` renders side-by-side |
| `thumbnail_url` | — | Small image top-right of the card; https only |
| `image_url` | — | Full-width image at the bottom of the card; https only |
| `footer.text` | 2 048 chars | |

Max 10 embeds per message. Hub validates URL schemes (https only,
no private ranges) at write time.

### Where embeds are accepted

- `BotResponse.reply.embeds` — slash-command and component responses.
- `POST /messages` body `embeds` — proactive bot posts (§16) and
  direct API calls. Rejected on messages authored by non-bots.
- Incoming webhook POST body (§9) — the `embeds` field reserved there
  now uses this format.

Embeds are stored as a JSON column on the `messages` row and
transmitted as-is in WS message envelopes to clients.

### Wire changes

- `messages` gains `embeds TEXT NULL` (JSON array; null = no embeds).
- `BotResponse.reply` and `POST /messages` body gain `embeds?: Embed[]`.
- New `Embed`, `EmbedField`, `EmbedFooter` wire models in
  `hub/src/routes/bot_models.rs`.
- Client renders embeds as cards stacked below the message body;
  `inline: true` fields render in a two-or-three-column grid.

---

## 16. Proactive messaging

A bot can post to any channel in its scope at any time without being
invoked by a slash command or component interaction. The existing
`POST /messages` route handles this — no special envelope or separate
path needed.

### When to use it

| Pattern | How |
|---|---|
| Deferred slash response | Bot receives `/remind` command, `defer: true`; posts the actual reply minutes later via `POST /messages` |
| Scheduled announcements | Bot runs a cron; posts to `#announcements` at the scheduled time |
| External trigger | Incoming webhook (§9) is read-only inbound; for two-way flows (receive event, then post a follow-up) the bot handles the logic and posts proactively |
| Status updates | Bot edits a previously posted message (`PATCH /messages/:id`) as state changes — e.g., a live match scoreboard |

### Rate limits

The per-bot-per-hub rate limits from §6 apply to all proactive posts:
5/sec sustained, 30/minute burst. There is no separate "proactive"
budget — a bot that also handles slash commands shares the same pool.
Admins can raise the limit per-bot for bots with a legitimate
high-volume need (polling-result announcer, bulk notification bot).

### Message editing and deletion

A bot can edit or delete its own messages using the standard routes:

- `PATCH /messages/:id` — edits body, embeds, or components in-place.
  All channel members see the update.
- `DELETE /messages/:id` — removes the message. If the bot holds the
  `manage_messages` permission it can delete any member's messages,
  same as a human moderator.

No new wire changes. These use existing routes with the bot's session
token.

---

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

## §17 — Mini-apps

A bot can embed an interactive web experience inside any channel. The bot
hosts a standard web page (HTML + JS + CSS); the hub handles auth and
sandboxing.

### Flow

1. **Bot announces** — bot sends `bot_app_announce` with a `title`,
   `description`, and `channel_id`. The hub fans `bot_app_launch` to all
   channel subscribers; clients render a launch card with a "Join" button.
2. **User joins** — user clicks "Join"; client sends `bot_app_join` with the
   `bot_id` and `channel_id`. The hub mints a **4-hour scoped session token**
   bound to this user + channel + bot, then delivers `bot_app_open` *only*
   to that connection.
3. **Client opens webview** — client loads `mini_app_url` in a sandboxed
   webview (desktop/Android: `WebviewWindow`; web: `<iframe sandbox>`). Four
   globals are injected before the page loads:
   - `window.__WAVVON_HUB__` — hub origin URL
   - `window.__WAVVON_TOKEN__` — the scoped session token
   - `window.__WAVVON_CHANNEL__` — channel id
   - `window.__WAVVON_BOT_ID__` — bot public key
4. **Mini-app connects** — the page connects to the hub WS with its token and
   exchanges messages via the normal WS surface (only channel-scoped events
   for its channel; admin endpoints are blocked by the scoped token).
5. **Bot closes** — bot sends `bot_app_dismiss`; hub fans `bot_app_close` to
   all subscribers; clients close open webviews.

### Camera access

A bot that needs webcam access (e.g. ML inference, AR filters) registers with
`requires_camera: true` at invite time (`POST /bots`). The hub only grants
camera to the webview when **both** conditions are met:
- The bot declared `requires_camera: true`
- The hub operator has set `bots_allow_camera = true` in `hub.toml`

The `bot_app_open` message carries a `requires_camera` boolean; clients gate
the webview `allow-camera` / `permissions: ["camera"]` on this flag. If the
operator has not enabled camera access, the flag is `false` and the webview
never sees the camera permission prompt.

### Bot registration

Set `mini_app_url` in the `POST /bots` invite body. Update it any time via
`PUT /bots/me/profile`.

### Scoped token limits

The 4-hour session token minted on `bot_app_join` is:
- Bound to the user's identity (same pubkey as their normal session)
- Scoped to the bot's channel — cross-channel events are not delivered
- Blocked from admin endpoints (`/admin/*`, `PUT /bots/*`)
- Revocable individually via `DELETE /bots/{id}/sessions/{token}` (planned)

---

## §18 — Voice and video bots

Bots can participate in voice channels and inject video streams into the
screen-share surface. Both paths reuse the same infrastructure as human
clients — no new wire format.

### Voice

1. **Join** — `POST /bots/{id}/voice/join` with `{ channel_id }`. The hub
   verifies the bot's bearer token and returns:
   ```json
   { "voice_ws_url": "/voice/ws", "channel_id": "..." }
   ```
2. **Connect** — bot opens `/voice/ws?token=<bot_token>&channel_id=<id>` and
   receives a `voice_ws_ready` frame with its `sender_id` and the current
   participant list.
3. **Stream** — bot sends binary Opus frames at 48 kHz, 20 ms per packet,
   in the same envelope as desktop/Android (`[seq:u16 BE][ts:u32 BE][opus…]`).
   The hub mixes it into the channel fan-out for both UDP (desktop/Android)
   and WS (web) participants.
4. **Leave** — `DELETE /bots/{id}/voice/leave` with `{ channel_id }`. Triggers
   the same cleanup as a normal WS disconnect.

The bot appears in `GET /voice/participants` with `is_bot: true`.

### Video (screen-share injection)

1. **Start** — `POST /bots/{id}/screenshare/start` with:
   ```json
   { "channel_id": "...", "kind": "screen", "mime": "video/webm", "has_audio": false }
   ```
   The hub assigns a `stream_id`, registers the stream in `screen_shares`,
   and broadcasts `screen_share_started` to all channel subscribers. Clients
   render the bot's feed in the existing `ScreenShareViewer` — no client
   changes required.
2. **Push frames** — bot sends `screen_share_chunk` binary envelopes over its
   WS connection using the `stream_id` returned above.
3. **Stop** — `DELETE /bots/{id}/screenshare/stop` with `{ channel_id, stream_id }`.
   Hub broadcasts `screen_share_stopped` and notifies cross-channel
   subscribers.

---

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
- **Outgoing webhooks** (no-bot event forwarding) — admin registers an
  external HTTPS URL; hub POSTs a filtered subset of hub events to it
  (same shapes as §8) with no reply expected and no bot identity
  required. Lighter than running a full bot process for pure
  "pipe events to an external system" uses (monitoring, alerting,
  archival). Unlike incoming webhooks (§9) which flow inward, this
  flows hub → external. Unlike event subscriptions (§8), no persistent
  WS session is needed. Main design question: signing — hub should
  include `X-Wavvon-Signature` so the receiver can verify authenticity
  (same header as slash dispatch). Deferred until a real use case
  pressures the design.
- **Hub-to-hub bot federation** — a bot invited on Hub A is *not*
  automatically known to Hub B in an alliance. The bot operator
  invites it per hub. Federated bot identity is a possible v2 if it
  proves painful.
- **Sandboxed in-hub bot execution** — running bot code inside the
  hub process (the internal-service-account path) is already shipped;
  external bots intentionally run outside the hub for isolation.
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

  Note: the primary no-bot game launch surface is the **Activities
  button** in the channel toolbar — a picker over hub-installed games
  that opens the same modal, no command or bot required. The bot launch
  card is an additive path on top of that. See
  [gaming.md — Activities button](gaming.md).
