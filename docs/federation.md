# Federation

Hubs are independent SQLite-backed servers. Federation lets them talk
without a central authority. Two federation features ship today:

- **Federated DMs** — sender's hub → recipient's hub via an outbox
- **Alliances** — named groups of peers sharing channels (see [alliances.md](alliances.md))

## Peer auth

Every hub has its own Ed25519 keypair. Hub A authenticates to Hub B with
the same challenge-response primitive used for users
([identity.md](identity.md)), just acting as itself rather than on behalf
of a user.

Code: `hub/src/federation/client.rs` (outbound, Wavvon-server),
`hub/src/federation/handlers.rs` (inbound, Wavvon-server).

## Federated DMs

Mailbox model — store-and-forward, not a sync protocol.

```
User on Hub A sends DM to User on Hub B
  ↓
Hub A writes to its outbox table
  ↓
dm_worker (hub/src/dm_worker.rs in Wavvon-server) picks it up
  ↓
Hub A POSTs to Hub B's federation endpoint, signed as Hub A
  ↓
Hub B verifies, stores in recipient's inbox
  ↓
Hub B pushes via WebSocket if recipient is online
```

Retry logic and failover live in the worker. The outbox survives
restarts because it's a SQLite table.

Routes: `hub/src/routes/dms.rs` (Wavvon-server). Models:
`hub/src/routes/dm_models.rs` (Wavvon-server).

### Why outbox-style

- The recipient's hub may be offline; the sender's hub holds the message.
- It maps to a familiar mental model (email).
- It avoids the "pick a home hub" problem — the message just lives in two
  places by design.

## Federated reactions on alliance reads

When Hub B reads messages from Hub A's shared alliance channel, Hub B
gets the messages *and* their reactions in one shot.
`hub/src/routes/alliances.rs::get_alliance_channel_messages` in
Wavvon-server loads reactions for both local and remote rows by
reusing `messages::load_reactions` (made `pub(crate)` for this).

## Cross-hub friends

Friends are kept locally per hub but can point at users on other hubs.
The `friends` table has optional `hub_url` and cached `display_name`
columns. When you add a friend with a `hub_url`, the friendship is
created already-accepted (no federated request flow exists yet, so
leaving them pending forever would be misleading) and DMs to them
route through the existing federated DM outbox using the stored URL.

Code: `hub/src/routes/friends.rs` (Wavvon-server). Schema in
`hub/src/db/migrations.rs`.

**v1 limitation**: cross-hub adds are one-sided. Bob doesn't get a
notification when Alice adds him; he has to add her back manually if
he wants the friendship to be mutual on his side. A federated
friend-request notification flow is a future addition.

## Alliance push invites

`POST /federation/alliance-invite` is an **unauthenticated** federation
endpoint — by design. Trust comes from the invite token inside the
payload, which is a hub-identity signature over the alliance id, the
same primitive the pull-flow join verifies. A fake push invite at
worst clutters a target hub's pending list; accepting it triggers the
normal `POST /alliances/:id/join`, which fails for unsigned/forged
tokens. Full design in [alliances.md](alliances.md) and rationale in
[decisions.md](decisions.md).

## What federation does **not** do

- **No global directory**. There's no DHT or seed-list mechanism in active
  use. The `seed/` crate in Wavvon-server is a scaffold; users connect by URL.
- **No automatic peer discovery**. Alliance members are added explicitly
  via invite tokens.
- **No cross-hub user identity sync**. Your pubkey is the same; your
  membership rows on each hub are independent.
- **No multi-device account sync** (today — see [decisions.md](decisions.md)).

## Where to look in code

All paths below live in the `hub/` crate of Wavvon-server.

| Concern              | File |
|----------------------|------|
| Outbound HTTP client | `hub/src/federation/client.rs` |
| Inbound handlers     | `hub/src/federation/handlers.rs` |
| DM outbox worker     | `hub/src/dm_worker.rs` |
| Wire models          | `hub/src/federation/models.rs` |
| Alliance routes      | `hub/src/routes/alliances.rs` |
