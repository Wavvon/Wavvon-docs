# Hub Scaling Architecture

How Wavvon scales a single hub from a handful of users to one million,
and what changes at each threshold.

---

## Current State and Its Limits

A hub today is a single `wavvon-hub` process with a SQLite database and
FTS5 full-text search. This is intentionally simple — it makes self-hosting
trivial — but it has hard ceilings:

| Layer | Current | Hard limit |
|---|---|---|
| Database | SQLite (WAL mode) | ~50k registered users, light write concurrency |
| Search | SQLite FTS5 | Embedded in DB, degrades past a few million messages |
| WebSocket connections | Single process, tokio | ~50k–100k concurrent connections (memory) |
| Message fanout | Direct push in handler | Becomes a bottleneck with large channels |
| Voice | Single UDP server | Works for small channels; no SFU |

The goal is to remove each ceiling in turn, without breaking self-hosted
simplicity for operators who don't need the scale.

---

## Scaling Tiers

Each tier extends the previous one. Operators only adopt what they need.

```
Tier 1 — Small        < 50k users     SQLite + FTS5 (today)
Tier 2 — Medium     50k–500k users    SQLite + Tantivy search
Tier 3 — Large    500k–2M users       PostgreSQL + Tantivy
Tier 4 — XL           2M+ users       PostgreSQL + multi-process + message queue + SFU
```

---

## Tier 2 — Search: Replace FTS5 with Tantivy

**What breaks first:** FTS5 search degrades as the message corpus grows, and
it is SQLite-specific (blocks database portability). This is the first thing
to fix, and it helps every deployment regardless of scale.

### Why Tantivy

[Tantivy](https://github.com/quickwit-oss/tantivy) is a full-text search
library written in Rust, embedded directly in the hub process. It is the
foundation of Quickwit (a production search engine). Characteristics:

- **No separate service.** The index lives on disk next to `hub.db`. Zero
  operational overhead for self-hosters.
- **Lucene-quality.** BM25 ranking, prefix matching, phrase search, filters.
  Faster than Elasticsearch on single-node benchmarks.
- **Real-time.** Messages are indexed on write and removed on delete within
  the same request.
- **Handles scale.** Hundreds of millions of documents on a single node,
  sub-100ms queries.

### Abstraction layer

All search goes through a trait so that large operators can plug in an
external engine:

```rust
pub trait MessageSearch: Send + Sync {
    async fn index(&self, msg: &IndexedMessage) -> Result<()>;
    async fn delete(&self, msg_id: &str) -> Result<()>;
    async fn query(&self, params: &SearchParams) -> Result<Vec<SearchHit>>;
}

pub struct IndexedMessage {
    pub id: String,
    pub channel_id: String,
    pub author_pubkey: String,
    pub content: String,
    pub timestamp: i64,
}
```

**Implementations:**

| Impl | When to use | Config |
|---|---|---|
| `TantivySearch` | Default, all deployments | No config — index path derived from DB path |
| `MeilisearchSearch` | Operator preference, multi-hub index | `search_url = "http://..."` in hub.toml |
| `NullSearch` | Testing, read-only hubs | `search = "none"` in hub.toml |

Elasticsearch / OpenSearch can be added the same way when needed.

### What is removed

- `CREATE VIRTUAL TABLE messages_fts USING fts5(...)` — gone from migration
- All `INSERT INTO messages_fts` / `DELETE FROM messages_fts` triggers — gone
- FTS5-specific search queries replaced by trait calls

SQLite remains for all structured data. Only unstructured text search moves
to Tantivy.

---

## Tier 3 — Database: SQLite → PostgreSQL

**What breaks next:** SQLite has a single writer. At ~50k registered users
with active concurrent traffic, write contention (messages, presence updates,
session refreshes) starts causing lock waits. PostgreSQL handles many
concurrent writers and supports read replicas for query-heavy workloads.

### Configuration-driven selection

```toml
# hub.toml — leave blank or omit for SQLite (default)
database_url = "postgresql://wavvon:secret@localhost/hub_prod"
```

The hub detects the URL scheme at startup and initialises the correct sqlx
pool. The migration is the same SQL (Wavvon targets modern SQLite and
PostgreSQL syntax compatibility — no SQLite-isms in migrations).

**Known incompatibilities to resolve when PostgreSQL is added:**

| Feature | SQLite | PostgreSQL |
|---|---|---|
| Upsert | `INSERT OR REPLACE` | `INSERT ... ON CONFLICT DO UPDATE` (also works in SQLite 3.24+) |
| Boolean | `0` / `1` integer | `true` / `false` |
| JSON | `json()` functions | `jsonb` type + operators |
| Autoincrement | `INTEGER PRIMARY KEY` | `BIGSERIAL` or `GENERATED ALWAYS AS IDENTITY` |
| WAL tuning | `PRAGMA journal_mode=WAL` | N/A (PostgreSQL handles this) |

Tantivy handles search for both backends — no `tsvector` needed.

### Read replicas (PostgreSQL only)

Heavy read workloads (channel history, user lists, audit logs) can be routed
to read replicas:

```rust
pub struct DbPool {
    pub write: PgPool,          // all writes + transactions
    pub read: Option<PgPool>,   // replicas, optional
}
```

Queries that don't need the latest write use `pool.read.as_ref().unwrap_or(&pool.write)`.

---

## Tier 4 — Multi-Process: Breaking the Single-Process Ceiling

**What breaks next:** A single tokio process tops out at roughly 50k–100k
concurrent WebSocket connections (memory, file descriptors, CPU). Beyond that,
multiple hub processes are needed.

### The shared-state problem

Multiple hub processes cannot share in-memory state (online users, voice
channels, typing indicators). Two options:

**Option A — PostgreSQL LISTEN/NOTIFY (simpler)**
- Events (message posted, user joined, typing) published via PostgreSQL
  `NOTIFY` from the writing process
- All hub processes subscribe via `LISTEN`; each fan-out to its own WebSocket
  connections
- No extra service; PostgreSQL is already present at this tier
- Latency: ~1–5ms fan-out within a datacenter — acceptable for chat

**Option B — NATS / Redis Streams (higher throughput)**
- Dedicated message broker for event fan-out
- NATS: lightweight, Rust-native client, no persistence required for this use
- Redis Streams: if Redis is already in the stack
- Latency: sub-millisecond; better for very high message rates (thousands/sec)

Recommendation: start with PostgreSQL LISTEN/NOTIFY (no new service), migrate
to NATS when message rates justify it.

### Load balancing WebSocket connections

```
Client
  └─► Load balancer (HAProxy / Nginx / Cloudflare)
        ├─► hub-process-1  (WebSocket connections, set A)
        ├─► hub-process-2  (WebSocket connections, set B)
        └─► hub-process-3  (WebSocket connections, set C)
              │
              └─► Shared PostgreSQL + NATS
```

The load balancer must use **sticky sessions** (based on user pubkey or session
cookie) so that a user's connections consistently land on the same process.
This is important for typing indicators and presence, which are cheapest to
track in-process.

### Presence and online-user tracking

Currently tracked in an in-memory `HashSet` per process. In multi-process:

- Each process owns a shard of connected users
- Presence queries hit a shared `online_users` table in PostgreSQL (TTL-based:
  each process heartbeats its connected users every 10s; rows older than 30s
  are considered offline)
- Fan-out for presence changes goes through LISTEN/NOTIFY or NATS

---

## Voice at Scale: The SFU

**Current:** hub relays UDP packets between participants directly (mesh or
simple relay). Fine for small channels (2–10 speakers).

**Problem at scale:** a channel with 50+ participants broadcasting audio would
require O(n²) packet copies. The server CPU explodes.

**Solution: Selective Forwarding Unit (SFU)**

An SFU receives each participant's media stream once and selectively forwards
it only to participants who need it (based on who is speaking, which channels
are active, spatial audio zones).

```
Participant A  ──► SFU ──► Participant B
                    │───► Participant C
                    └───► Participant D  (only if B,C,D are listening)
```

Options:

| Option | Language | Complexity | Notes |
|---|---|---|---|
| **mediasoup** | Node.js + Rust worker | Medium | Production-proven, used by many platforms |
| **LiveKit** | Go | Low (managed or self-hosted) | Full SFU + SDK, excellent DX |
| **ion-sfu** | Go | Medium | Open source, flexible |
| **Custom (Rust)** | Rust | High | Full control; deferred |

For Wavvon, LiveKit is the pragmatic choice: self-hostable, has a Rust SDK,
handles routing, recording, and simulcast. The hub becomes an orchestrator that
creates LiveKit rooms and hands out tokens — the SFU handles all media.

SFU integration is a separate project from hub scaling and can be designed
independently.

---

## What the Farm Does at Scale

As hubs scale up, the farm's role expands slightly:

- **Server selection** becomes load-aware: don't assign new hubs to servers
  already running large hubs.
- **Hub metrics** reported by the server agent help the farm decide when to
  recommend an operator upgrade their deployment tier.
- **Connection brokering**: for multi-process hubs, the farm returns a list of
  hub process endpoints rather than a single address; the client picks one
  (or the load balancer picks).

The farm itself does not need to scale with hub users — it is a control plane,
not on the hot path.

---

## Implementation Order

Do these in sequence. Each delivers standalone value.

```
1. ✦ Tantivy search   — replaces FTS5, works with SQLite, unblocks DB portability
2.   PostgreSQL       — configure via database_url, keeps Tantivy for search
3.   Read replicas    — PostgreSQL only; route read-heavy queries
4.   Multi-process    — PostgreSQL LISTEN/NOTIFY for fan-out; sticky LB
5.   NATS fan-out     — replace LISTEN/NOTIFY when message rates demand it
6.   SFU (LiveKit)    — voice scalability; parallel track, not dependent on above
```

Step 1 is the right next implementation task. Steps 2–4 are designed but not
started. Steps 5–6 are directional.

---

## What We Are Not Doing

**Sharding the hub database** — splitting one hub's data across multiple
database instances. Extreme complexity, only needed at tens of millions of
users. PostgreSQL table partitioning handles the interim.

**Custom SFU** — building a media server from scratch is a multi-year project.
LiveKit gives 90% of the benefit immediately.

**Global CDN for messages** — messages are not static assets. Edge caching of
message history is a product-level feature (offline sync, caching client),
not a server-side concern at this stage.

**Kubernetes by default** — operators should be able to run a hub on a single
VPS with a `systemd` unit. Kubernetes manifests can be provided as a
convenience for large operators, but they are not the primary deployment model.
