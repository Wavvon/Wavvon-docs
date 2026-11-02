# Farm → Server → Hub Architecture

How Wavvon manages geographically distributed servers under a single farm.

> Status (2026-11-02): built in Wavvon-server `crates/farm` and `crates/agent`.
> The farm is optional: the primary deployment is a standalone, self-hosted
> hub (see "A hub is self-hosted; no client creates one" in
> [decisions.md](decisions.md)). Code is authoritative for message and route
> shapes; this page keeps the model and the why.

---

## Hierarchy

```
Farm  (control plane — one per operator/organization)
 └── Server  (compute node — physical or virtual machine)
      ├── Hub A  (community space)
      └── Hub B  (community space)
```

| Layer | Binary | Responsibility |
|-------|--------|----------------|
| Farm | `wavvon-farm` | Lifecycle, placement, reverse proxy, farm SSO |
| Server | `wavvon-agent` | Spawns, restarts and stops hub processes on its node |
| Hub | `wavvon-hub` | Community — channels, users, voice, messages |

Under a farm, hubs are spawned by an agent (or by the farm's own process when
no agent is connected). Outside a farm, `wavvon-hub` runs standalone — that is
the primary path, not a deprecated one.

---

## Server Agent — Reverse Connection Model

Servers connect *outbound* to the farm rather than the farm polling inward. This means:

- Servers behind NAT, firewalls, or private networks work without any inbound port exposure.
- The farm needs exactly one public endpoint (`wss://farm.example.com:443`).
- Servers in different continents, cloud providers, or home labs all work identically.

### Protocol

Each `wavvon-agent` keeps a persistent **WebSocket** to the farm's `/ws/agent` (Wavvon-server: `crates/agent/src/agent.rs`), JSON text frames:

**Agent → Farm:** `hello` (first frame: registration token, node host, TLS mode, cert fingerprint), then replies `pong`, `hub_spawned`, `hub_restarted`, `hub_stopped`, `hub_list`, or `error` (`no_database`, `spawn_failed`, ...).

**Farm → Agent:** `ping`, `spawn_hub`, `restart_hub`, `stop_hub`, `list_hubs`. Spawn and restart carry hub id, ports (HTTP + voice), database URL or template, owner pubkey and farm URL.

There is no log or metrics stream over this socket. Liveness comes from each **hub** posting `POST /farm/heartbeat` every 60 s; three missed beats (180 s) mark it offline, and `crates/farm/src/monitor.rs` restarts hubs with auto-restart enabled.

---

## Server Registration

A server is added to a farm once, by the operator, before it is deployed.

```
Step 1 — Farm admin calls POST /farm/admin/server-token {name, region?}
  → {server_id, token}   (32-byte hex, shown once, stored as SHA-256)

Step 2 — wavvon-agent starts with the farm URL and that token
  (WAVVON_* env) and sends it in its `hello` frame.

Step 3 — Every reconnect presents the same token. Losing it means
  generating a new one; deleting the server row revokes it.
```

The farm's CLI has only `migrate`; servers are registered through the route
above. The `servers` table stores id, name, region, token hash, last-seen and
a hub cap (`max_hubs`).

---

## Hub Lifecycle

### Creation

No client creates a hub (decisions.md, "A hub is self-hosted; no client
creates one"). An operator calls `POST /farm/hubs`:

```
POST /farm/hubs
  → farm provisions the hub's database or schema (crates/farm/src/db/provision.rs)
  → farm picks a node (crates/farm/src/placement.rs)
  → spawn_hub to that agent (or spawns locally)
  → agent replies hub_spawned; the hub claims its row on first heartbeat
```

The owner pubkey travels in the spawn payload and is seated by the hub at
startup — no separate setup step, no web panel.

### Shutdown / Deletion / Restart

Farm sends `stop_hub` / `restart_hub`; the agent replies `hub_stopped` /
`hub_restarted`. There is no live config-update message.

---

## Server Selection

When a new hub is created, the farm picks a server using:

What is built (`crates/farm/src/placement.rs`): an explicit server requested by
the operator is honoured or refused; otherwise the node with the most free room under
its `max_hubs` cap wins, ties going to agents over the farm's own process. Placement is **refused, never overflowed** — the cap is the
operator's, for reasons the farm cannot see. Region hints, CPU/memory
thresholds and latency- or cost-aware placement are future work.

---

## Client Routing

HTTP and WebSocket go through the farm's reverse proxy at
`https://farm.example.com/hub/<serial>/...` (`crates/farm/src/proxy.rs`), which
forwards to the hub's node — so one certificate and one hostname serve every
hub (rationale and the multi-node data plane: [farm-impl.md](farm-impl.md),
[farm-model.md](farm-model.md)). Voice is the exception: each hub has its own
voice port and publishes `voice_wt_url` in its `/info`; the client dials that
WebTransport endpoint directly ([voice-transport-v2.md](voice-transport-v2.md)).
So each node still needs a public address reachable on its voice ports.

---

## No farm panel

The web panel once planned here (`/farm/admin/panel`, `web_admin_token`) was
never built and will not be. Farm administration is the farm-admin-only
routes (`/farm/settings`, `/farm/hubs`, `/farm/users`, `/farm/admin/servers`,
`/farm/admin/fleet`), authenticated as `WAVVON_FARM_ADMIN_PUBKEY`. Community
management stays in the client, per hub.

---

## Open Questions / Future Work

**Hub migration** — moving a hub from one server to another without losing data. Requires: pause hub, copy its PostgreSQL database, start on new server, update routing table, unpause. Non-trivial; deferred.

**Server failover** — if a server crashes, its hubs are unavailable. A failover strategy would replicate hub DBs (streaming WAL to a standby) and restart hubs on another server. High complexity; out of scope for v1.

**Voice and NAT traversal** — voice (WebTransport over UDP) requires the node to be reachable by clients. A node behind strict NAT has no answer yet; deferred.

**Hub clustering** — running multiple hub processes for the same hub (for scale). The hub keeps in-process state (broadcast channels, voice relay), so a shared PostgreSQL alone is not enough. Far future.

**Server-to-server communication** — hubs on different servers have no direct link. Cross-server features (DMs between users on different hubs, federated search) are a federation problem, not a farm problem.
