# Apps

A program that talks to a hub is a client. That is the whole model.

It holds an Ed25519 keypair, answers the same challenge every other client
answers, carries the same session token, and is bound by the same
permissions. There is no bot account, no bot admission path, no bot
capability layer, and no way for a caller to declare itself a different kind
of thing. What used to be "a bot" is a member whose role carries
**`apps.register`**.

This replaced `apps.md`, `apps.md` and `apps.md` on
2026-09-26. The reasoning is in [decisions.md](decisions.md), "A bot is a
client like any other"; what follows is how the surface works now.

---

## 1. Getting in

Exactly like a person: `POST /auth/challenge`, sign, `POST /auth/verify`, and
on an `invite_only` hub present an invite code. A program can hold a code —
it is a string.

The one thing a program genuinely cannot do is solve the admission puzzle,
because the puzzle asks "are you a person" and the honest answer is no. That
gap is open and designed separately; see
[future-features.md](future-features.md).

There used to be a second admission path — `POST /bots` wrote a `users` row
with `is_bot = TRUE` and the caller asserted `is_bot: true` at verify to skip
the invite gate. It is gone, and so is the hole underneath it: a stranger's
pubkey could be flagged before its owner had ever arrived, and that person
then joined normally, kept the flag, and was silently excluded from DMs with
no way for them or an admin to see why.

## 2. `apps.register`

One permission, granted by a role like every other. It gates:

- `PUT /me/app/profile` — name, avatar, description, webhook URL, homepage,
  mini-app URL, and an optional game descriptor
- `PUT /me/app/commands` — the slash commands this identity answers
- `PUT /me/app/subscriptions` — the hub events it wants pushed
- authoring **embeds** and **game launch cards** on a message

That last one is why the permission exists at all. An embed nobody vouched
for is a forgery with a nice border, so the hub needs to know which members
speak for a program. It is not a kind of account: it is revocable by dropping
the role, visible in the roles UI, and never self-declared.

`GET /me/app` reads back the caller's own registration. `GET /apps` lists
every registered app with its commands, for any member — that is what a
client's slash-command autocomplete reads, and what an app says about itself
in public needs no permission to read.

## 3. Slash commands

An app registers commands with `PUT /me/app/commands`; each carries a name, a
description, optional args, a scope (`channel` or `hub`), a `privileged`
flag and a cooldown.

When a message starts with `/`, the hub looks for a registered command with
that name and POSTs an invocation to the app's `webhook_url` (https only, 5s
timeout). The reply is inserted as a message and broadcast like any other. A
reply may be ephemeral, may carry embeds and components, and may carry a game
launch card.

Component interactions (buttons, selects) travel the same way: the hub POSTs
the interaction to the webhook of the app that authored the message, and
applies the response. The app must be able to read the channel its own
component was clicked in — the same `messages.read` check a person passes.

## 4. Mini-apps and the game modal

An app that declares a `mini_app_url` can be opened as an embedded view: the
client sends `app_join`, the hub mints a **scoped session token**
(`scope = 'mini_app'`, bound to one channel, four hours, no voice) and
answers `app_open`. Web promotes it to a modal; desktop opens a native
window. The hub relays opaque `mini_app_message` payloads between the app and
every client that joined the modal, and knows nothing about rosters, games or
turns.

The host must still hold `apps.register` when a client joins, re-checked per
join rather than trusted from the profile row, so losing the role stops new
sessions immediately.

Camera inside the webview stays behind an operator switch
(`WAVVON_APPS_ALLOW_CAMERA`, default off) on top of the app's own
`requires_camera` declaration.

See [mini-apps.md](mini-apps.md) for the session-scoping details and
[gaming.md](gaming.md) for the sandboxed game SDK.

## 5. Hub events

`PUT /me/app/subscriptions` names the events an app wants. A `message.*`
subscription must name its channels; hub-wide it would be every conversation
at once.

Delivery is filtered by **the subscriber's own read access to the channel the
event happened in** — the same answer `GET /messages` would give them. This
replaced two mechanisms that were the permission model rewritten by hand: a
per-pubkey channel-scope table, and a capability that delivered message
events with the content stripped.

Two transports, same events:

- **WebSocket** — an app with a registered profile gets a `hub_event` push on
  its socket, and `Resume` replays the last 72 hours from the audit log.
- **HTTP polling** — `GET /me/events` and `DELETE /me/events` for a client
  that holds no persistent socket.

`GET /admin/audit-log` is the same stream as an admin view, gated on
`audit.read`.

## 6. Media

An app pushes video into a channel the way a person shares a screen. Over the
WebSocket it is the ordinary screen-share start; over HTTP it is
`POST /screenshare/start` and `DELETE /screenshare/stop`, for a client with
no socket to hold. Both check channel-scoped `voice.join`, which used to be
checked only inside the branch for bots and so applied to nobody else.

Streams started over HTTP are capped hub-wide by
`WAVVON_HTTP_VIDEO_STREAM_BUDGET` (default 2). The cap counts the route, not
the caller: a person clicking Share holds a socket, an unattended pusher
usually does not.

Audio works the same way — an app joins voice under the voice permissions
everyone else has. `DELETE /voice/leave` exists for a client that cannot drop
a socket to leave.

## 7. Incoming webhooks

Unchanged and unrelated: a webhook is a URL that posts into one channel, with
no identity and no session. `users.is_webhook` still exists, and a message
from one still carries an **APP** badge, because a webhook really is not a
member — nobody holds its key, since there is no key.

See [outgoing-webhooks.md](outgoing-webhooks.md) for the other direction.

## 8. What a program cannot do

Nothing special. It cannot do what its roles do not allow, and that is the
entire list. Two consequences worth stating, because they used to be
hard-coded:

- **DMs.** The guard that refused bots is gone. A client with no published DH
  key sits exactly where a person with no DH key has always sat: the
  conversation can only carry cleartext, and federates onward in the clear. A
  program that publishes a DH key and runs a ratchet is a participant like
  any other. If this should be policy rather than crypto, it belongs in the
  catalogue as a permission, not as a flag.
- **Sessions.** An app's session does not expire on a 30-day clock any more,
  because that clock was the bot token's and nothing else used it.
