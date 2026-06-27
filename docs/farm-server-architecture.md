# Farm → Server → Hub Architecture

How Wavvon manages geographically distributed servers under a single farm.

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
| Farm | `wavvon-farm` | Lifecycle, routing table, discovery, farm panel |
| Server | `wavvon-server` | Hub process management, metrics, log forwarding |
| Hub | `wavvon-hub` | Community — channels, users, voice, messages |

**A hub is never started directly.** It is always spawned and managed by a server agent. The `wavvon-hub` binary is an internal implementation detail of `wavvon-server`, not a user-facing deployment target.

---

## Server Agent — Reverse Connection Model

Servers connect *outbound* to the farm rather than the farm polling inward. This means:

- Servers behind NAT, firewalls, or private networks work without any inbound port exposure.
- The farm needs exactly one public endpoint (`wss://farm.example.com:443`).
- Servers in different continents, cloud providers, or home labs all work identically.

### Protocol

Each `wavvon-server` maintains a persistent **WebSocket** connection to its farm. The connection is authenticated (see Registration below) and multiplexes two message flows:

**Server → Farm (push):**
- `heartbeat` — sent every 15 s; includes CPU %, memory %, disk %, hub process states
- `hub-started` / `hub-stopped` — lifecycle events with hub ID and listening address
- `log-line` — streamed log output (throttled, farm-side ring buffer per server)
- `metrics` — periodic extended stats (connections, voice sessions, DB size per hub)

**Farm → Server (commands):**
- `hub-create` — start a new hub process (payload: hub ID, config)
- `hub-stop` — graceful stop
- `hub-restart` — rolling restart
- `hub-config-update` — push a config change without restart (where supported)
- `ping` — liveness probe

The farm treats a server as **offline** if no heartbeat arrives within 45 s. Hubs on an offline server are marked unavailable in the routing table.

---

## Server Registration

A server is added to a farm once, by the operator, before it is deployed.

```
Step 1 — Operator generates a registration token on the farm:
  wavvon-farm server add --name "eu-1" --label region=eu --label provider=hetzner
  → Registration token: <one-time 32-byte hex>

Step 2 — Server agent starts and presents the token:
  wavvon-server --farm wss://farm.example.com --token <token>

Step 3 — Farm verifies the token (single use), records the server,
  and issues a long-lived server credential for subsequent reconnects.
  The one-time token is consumed and cannot be replayed.

Step 4 — All future reconnects use the long-lived credential.
  Losing it requires re-registration (step 1–2 again).
```

The farm's `servers` table stores: ID, name, labels, credential hash, last-seen, status.

---

## Hub Lifecycle

### Creation (from desktop client wizard)

```
Client wizard
  → POST /farm/hubs/create  {name, region_preference?, template?}
  → Farm selects a server (see Server Selection)
  → Farm sends hub-create command to that server's agent connection
  → Server starts the hub process, reports hub-started {id, address}
  → Farm records hub→server mapping, sets creator pubkey as hub owner
  → Farm returns {hub_id, hub_address} to client
  → Client connects directly to hub_address
```

The creator's Ed25519 pubkey is written as the hub owner by the server at creation time — no separate setup step, no web panel, no bootstrap token.

### Shutdown / Deletion

Farm sends `hub-stop` to the server. The server gracefully stops the process, archives or deletes the DB (based on farm policy), and sends `hub-stopped`. Farm removes the hub from the routing table.

### Restart / Config Update

Farm sends `hub-restart` or `hub-config-update`. No client disruption for config-only changes; brief reconnect on restart.

---

## Server Selection

When a new hub is created, the farm picks a server using:

1. **Region preference** — client (or operator template) can hint a region label.
2. **Capacity** — farm skips servers above a CPU or memory threshold.
3. **Hub count** — prefer servers with fewer existing hubs (spread load).
4. **Round-robin** — tiebreak among equally-ranked candidates.

This is intentionally simple for v1. More sophisticated placement (latency-based, cost-aware) is a future concern.

---

## Client Routing

The farm is **not** on the hot path for real-time traffic. After discovery:

```
1. Client asks farm: GET /farm/hubs
   Farm returns: [{hub_id, hub_address: "s1.example.com:3000", name, ...}, ...]

2. Client connects directly to hub_address for:
   - WebSocket (messages, presence)
   - UDP (voice)
   - REST (API calls)

3. Farm is only contacted again for:
   - Hub list refresh
   - Creating or leaving a hub
   - Billing / identity lookups (future)
```

### Addressing

Each server needs a stable public address reachable by clients:

| Setup | Server address |
|-------|---------------|
| VPS / cloud VM | Public IP or A record: `s1.farm.example.com` |
| Home lab with dynamic IP | DDNS or Tailscale funnel |
| Strict NAT (voice) | TURN relay (voice only — see Open Questions) |

The farm domain (`farm.example.com`) is control plane only. Hub addresses point directly at server hostnames/IPs and are unrelated to the farm's domain.

---

## Farm Panel (server operator view)

A minimal web UI served by `wavvon-farm` at `/farm/admin/panel`. Protected by `web_admin_token` in `farm.toml` — the operator already has shell access; no Ed25519 ceremony needed here.

**What it shows:**
- Server list: name, region labels, status (online/offline), last heartbeat
- Per-server: CPU / memory / disk gauges, hub count, uptime
- Hub list: which hub is on which server, hub name, user count
- Recent log tail per server (last N lines, streamed)
- Config summary (farm.toml values, no secrets)

**What it does NOT do:**
- Community management (ban users, manage roles) — that is the desktop client's job
- Hub content (messages, files) — out of scope for a server operator

---

## Open Questions / Future Work

**Hub migration** — moving a hub from one server to another without losing data. Requires: pause hub, copy SQLite DB, start on new server, update routing table, unpause. Non-trivial; deferred.

**Server failover** — if a server crashes, its hubs are unavailable. A failover strategy would replicate hub DBs (streaming WAL to a standby) and restart hubs on another server. High complexity; out of scope for v1.

**Voice and NAT traversal** — voice UDP requires the server to be reachable by clients. For servers behind strict NAT, a TURN relay is needed. STUN is already used for peer addresses; TURN integration is deferred.

**Hub clustering** — running multiple hub processes for the same hub (for scale). Requires a shared DB layer (not SQLite). Far future.

**Server-to-server communication** — hubs on different servers have no direct link. Cross-server features (DMs between users on different hubs, federated search) are a federation problem, not a farm problem.
