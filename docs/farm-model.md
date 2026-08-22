# Farm Model

The **farm** is the layer above hub: one server process hosting many
hubs. A standalone `hub` binary still serves exactly one community; a
farm hosts N of them, routes to them, and owns their lifecycle.

> Partially built — the `farm` and `agent` crates exist (serial routing,
> reverse proxy, hub lifecycle, agent nodes). Implementation detail is
> in [farm-impl.md](farm-impl.md); the "Multi-node data plane" section
> below is designed and not built.

## Three terms

- **Farm** — one server process operated by one person/organization.
- **Hub** — an independent community living on a farm (today's "hub").
- **Channels / users / messages** — inside a hub (current model).

The farm is a new layer **above** hub. A single farm can host many hubs.

## Why a farm layer

- Self-hosters can run "communities for my friends" without a separate
  server per group.
- Farm operators set policy: max hubs per user, who can create hubs,
  whether the directory is public.
- Farm-internal hub directory = discovery without a global registry.

## The five-layer mental model

Bottom to top:

1. **Identity** — Ed25519 keypair (today)
2. **Hub** — a community: channels, users, voice (today)
3. **Hub federation** — peers, alliances, federated DMs (today, partial)
4. **Farm** — one server hosting many hubs, operator-set policy (future)
5. **Farm clusters / cross-farm discovery** — operator-claimed clusters
   + open-network discovery via the seed crate (future)

Each layer is a separate concern. Don't conflate them in conversation:

| Phrase                                       | Layer |
|----------------------------------------------|-------|
| "Federation" (today)                         | 3     |
| "I want one server for many communities"     | 4     |
| "I run 3 servers; group them together"       | 5     |
| "How do users find hubs they don't know yet?"| 5     |

## Identity stays public-key, full stop

The farm model does NOT turn users into farm-accounts. The pubkey
remains the canonical identity:

- Farm tokens are session credentials, scoped to that farm. Not identity.
- The same pubkey works on every farm.
- DMs are addressed `(pubkey, farm_url)` — pubkey says **who**, farm URL
  says **where to currently route to**.
- Friends, recovery phrase, federation — all keyed on pubkey.

We will NOT add: per-farm signup with email/password, a central "Wavvon
Account" service, addresses like `name@farm.com`, farm tokens not tied
to a user signature.

The farm is **hosting + SSO + inbox.** Not identity.

## Farm-level SSO

Auth moves from per-hub to per-farm:

- Farm exposes `/auth/challenge` and `/auth/verify`.
- User keypair signs a farm-issued challenge → farm-issued session token.
- Hubs verify the **farm's signature** on the token. No re-auth per hub.
- Security level proof (PoW, see [future-features.md](future-features.md))
  also lives at the farm — prove once, applies to every hub.
- Each hub still owns its own user record (roles, per-hub display name,
  bans). Auth is factored out; per-hub state stays.

Implication: hubs are no longer self-contained crypto islands. The farm
is the trust root. Migrating a hub between farms requires explicit
export/import; sessions don't survive the move.

## Discovery: four vectors, all opt-in

1. **Direct URL** — friend invites, links shared anywhere. Wavvon
   itself never ships a global directory.
2. **Farm directory** — farm operator decides whether the farm publishes
   a `/hubs` listing.
3. **Hub visibility flag** — hub admin decides whether the hub appears
   in the farm directory.
4. **User-curated** — public profile at `GET /profile/<pubkey>` lists
   the user's chosen hubs, signed by their key. Per-hub opt-in. Strongest
   real-world growth vector — social, self-policing, spam-resistant.

Visibility controls listing, not access. A hub hidden from the farm
directory is still reachable by direct URL.

A hub is discoverable only if the farm AND the hub admin both opt in
(for the directory path), or if a user puts it on their profile (for the
social path).

## Future: DMs and games at the farm level

When farms exist, both move up a layer:

- **DMs**: per-farm inbox, not per-hub. `dm_messages` / `dm_outbox`
  become farm-scoped. The retry worker is one farm-level supervisor
  instead of one per hub. See [federation.md](federation.md).
- **Games**: catalog, files, matchmaking, persistent state all live on
  the farm. Hubs opt in. See [gaming.md](gaming.md).

## Generic job queue (future refactor)

Today's `dm_worker.rs` is DM-specific. Once we have farms with multiple
async cross-farm operations (DMs, game invites, friend-request
federation, profile broadcasts), refactor into a generic `queue_worker`
with pluggable handlers per job kind:

```
queue_jobs(id, kind, payload_json, attempts, next_attempt_at, last_error, bounced_at)
register_handler("dm_delivery", deliver_dm)
register_handler("game_invite", deliver_game_invite)
```

One backoff/retry/dead-letter implementation, many job kinds.

## Implementation order (when the time comes)

Multi-month roadmap. Don't start without explicit direction.

> Detailed design for phases 1 and 2 lives in
> [farm-impl.md](farm-impl.md) — exact DB column shapes, route shapes,
> token format, migration strategy, and wire changes a backend
> engineer can implement against.

1. Farm-level auth — move `/auth/*` to farm, issue verifiable tokens
2. Hub multi-tenancy — many hubs in one farm process
3. Public/private flag on hubs + farm `/hubs` listing endpoint
4. Client model update — connect to farms, browse hubs per farm
5. Hub creation API + per-creator quotas
6. Hub migration export/import
7. `/info` enhancements + deep links (`wavvon://farm/hub/...`) for
   third-party indexers

Right time to start: when the user has 2+ hubs themselves OR a real
user complains about running multiple hub processes.

## Multi-node data plane

**Status**: designed, not built. Server-only — no hub route changes, no
client changes, so it is fully shippable against the web-only delivery
target.

The `agent` crate already lets a farm lifecycle-manage hub processes on
remote nodes (it reverse-connects over WebSocket and spawns hubs on the
farm's behalf), but those hubs are **unreachable through the farm
domain**: `farm/src/proxy.rs` resolves a serial to a `process_port` and
dials `http://127.0.0.1:<port>` — five hardcoded loopback literals, on
both the buffered HTTP path and the WebSocket socket-bridge — and the
`servers` table has no host column. So the control plane is
multi-node and the data plane is not.

Two design questions were blocking this. Both are answered below.

### Decision 1 — farm↔node is plain TLS to an advertised host, not a private network

The `servers` row gains a **host**, and the agent advertises its
reachable address in the WebSocket `hello` it already sends. The proxy
resolves serial → `(host, port)` and dials `https://<host>:<port>`, or
`http://` when host is loopback.

**Alternative considered**: require a private network (WireGuard, a
cloud VPC, an SSH tunnel) between farm and nodes and keep dialing
plaintext. Rejected — not because it is worse security (it is better),
but because it moves a prerequisite the farm cannot verify into the
operator's lap, and the operator this layer targets is a self-hoster
who wanted to stop running one process per community. A farm that
silently proxies plaintext over the open internet when the tunnel is
down is the worse failure. Making the transport the farm's own concern
means the farm can *check* it.

**Tradeoff**: each node needs a certificate the farm trusts. Two modes,
and the config names which:
- `WAVVON_NODE_TLS=ca` — ordinary CA validation. The node has a real
  cert for its hostname. The operator-friendly default for anyone who
  already terminates TLS.
- `WAVVON_NODE_TLS=pin` — the agent's `hello` carries the SHA-256
  digest of its self-signed cert and the farm pins it, refusing on
  mismatch. This is **the same primitive voice already uses**
  (`voice_cert_hash` in `/info`, browser `serverCertificateHashes` —
  [voice-transport-v2.md](voice-transport-v2.md)), so there is a
  rotating-self-signed-cert implementation to copy rather than invent.

A private network is not forbidden; it just becomes an operator choice
that happens to make `ca`/`pin` trivially satisfiable, rather than a
load-bearing assumption.

### Decision 2 — per-node PostgreSQL, with the farm holding only a URL template

Each node runs its own PostgreSQL and the hubs on it connect locally.
The farm stores a **per-server connection template** on the `servers`
row and never holds node database credentials; the agent substitutes
the per-hub database name when it spawns a hub and passes it through the
`wavvon-hub-env` key names.

**Alternative considered**: one central PostgreSQL that every node's
hubs dial across the network. Rejected: it makes the database a
single point of failure for every hub on every node, it puts every
query on the wire, and it multiplies the connection-pool arithmetic the
server CLAUDE.md already warns about (`WAVVON_DB_MAX_CONNECTIONS`
summed across hubs must stay under the server's `max_connections`) by
the node count.

**Tradeoff**: backup and restore become per-node operations. That is
acceptable and, given `backup`/`restore` are already per-hub `pg_dump`
logical dumps (shipped 2026-08-09), it is barely a change — the dump
runs where the data is. What it does mean: the farm's admin surface must
say *which node* a hub lives on, or an operator will look for its dump
in the wrong place.

**Prerequisite, not optional**: this decision only pays off once
[next-up.md](next-up.md)'s "A PostgreSQL role per hub" lands. Per-node
Postgres without a role per hub gives isolation between nodes and none
within one — the exact gap `farm/src/db/provision.rs` documents in its
own header, and the one `farm-impl.md` Phase 1 flags as undecided ("who
issues `CREATE DATABASE`, under which role, what happens on hub
deletion"). Sequence the role work first.

### Implementation surface (all Wavvon-server)

- `farm/src/db/migrations.rs` — additive on `servers`: `host TEXT`,
  `tls_mode TEXT NOT NULL DEFAULT 'ca'`, `cert_sha256 TEXT`,
  `db_url_template TEXT`. All nullable/defaulted, so existing
  single-node rows keep working as loopback.
- `agent` — the WebSocket `hello` carries `host`, `tls_mode`,
  `cert_sha256`; the agent passes the resolved database URL and the
  **public** host to each hub it spawns, so the hub's `/info` advertises
  a `voice_wt_url` clients can actually reach. Voice stays direct QUIC
  to the node and is never proxied (unchanged contract).
- `farm/src/proxy.rs` — resolve serial → `(host, port, tls_mode,
  cert_sha256)` in the one existing query; replace the five `127.0.0.1`
  literals on **both** paths (reqwest and the raw `TcpStream` bridge —
  the WS path is the one that will be forgotten). A row whose host is
  set but unreachable returns the existing `503 hub_not_running`, not a
  new error.
- `farm` monitor — drive remote hubs via the agent heartbeat rather than
  local process inspection.
- `hub/src/capabilities.rs` — **no new string**; nothing a client
  branches on changes. `openapi.yaml` — unchanged.

### Deferred

Farm-level UDP/QUIC voice multiplexing (one shared port, token demux) —
still out, as in `farm-impl.md`'s serial-routing slice. Cross-node hub
migration. Automatic node certificate issuance.

## How to apply

When a discussion involves "many hubs on one machine," "server hosting
hubs," or hub directories, this is the farm model. Don't confuse it with:

- **Hub federation** (layer 3 — hubs on different machines talking)
- **The `seed/` crate** in Wavvon-server (layer 5 — cross-farm discovery)
