# Performance ceiling

> Status: designed, not started. This doc covers what we expect to find
> when we measure, what the current code makes us suspect the bottleneck
> is, and how to attack each axis in order. No source changes happen
> until the first round of measurements lands.

Wavvon's selling point is "a community runs on one box." The wishlist
item this doc resolves is: *what does "one box" actually mean*? Three
subsystems decide it — WS broadcast, search, voice relay. This doc
designs the load tests, names the suspected ceiling for each, and
ranks them by impact-per-effort.

We are not trying to scale to a million users on one hub. Federation is
the answer to "more than one hub's worth of people." The goal here is
to know the ceiling, document it, and tell hub operators which axis
fails first.

## What the code says today

All three subsystems live in the `hub/` crate of Wavvon-server.

- **WS broadcast** — four `tokio::sync::broadcast` channels in
  `state.rs:84-102` (chat, voice events, DMs, screen share), each
  with capacity **256**, set in `main.rs:83-86`. Every WS connection
  subscribes to all four (`ws.rs:85-89`) and filters per-event after
  receive. There is no per-channel fan-out; one chatty channel sends
  events to every connected user's receive loop, which then drops them
  if the user isn't subscribed.
- **Search** — `routes/messages.rs:355-376` runs
  `WHERE m.channel_id = ? AND m.content LIKE '%q%' COLLATE NOCASE`.
  No FTS5 virtual table, no index on `content`. A leading `%` means
  the index on `channel_id` helps cut the scan to one channel's
  messages, but every row inside that channel is a string compare.
- **Voice relay** — `main.rs:151-182`, a single tokio task on one
  `UdpSocket`. For each packet: take a read lock on
  `voice_channels`, scan every channel's participant map looking for
  a match on the source `SocketAddr`, then `send_to` every other
  participant in that channel. The match is **linear in total voice
  participants across all channels** per packet.

Those three shapes set the three suspected ceilings below.

## 1. WS broadcast

### Suspected ceiling

The first thing to hit is the **broadcast lag bound**. Each broadcast
channel has capacity 256: if a slow subscriber is more than 256 events
behind, it gets a `Lagged(n)` error and skips. `ws.rs:230-231` logs
this and continues; the client just sees a hole. At, say, 50 chat
messages/sec on a busy hub (typing events count, and they're
per-keystroke), 256 events is roughly **5 seconds of buffer**. Any
client whose write half stalls for 5s during a flurry — a slow mobile
network, a paused tab the OS suspended — loses messages it has to refetch.

Memory and file descriptors come next, but later than people assume:

- Each WS connection on Linux is one FD plus tokio task overhead.
  Default `ulimit -n` is 1024; the hub's systemd unit (see
  `hosting.md`) raises it. Modern kernels and tokio happily run
  tens of thousands of WS connections per process — the connection
  count is not the ceiling, the **per-event fan-out cost** is.
- Per-event CPU is dominated by `serde_json::to_string` and the
  per-receiver `send`. With 1000 connected clients and one chat
  event, the loop in `ws.rs:174-235` runs 1000 times — each
  serialising the same JSON. We serialise per-receiver because
  `axum::extract::ws::Message::Text` consumes the string.

### Load test design

- **Tool**: a custom Rust harness in a new `loadtest/` workspace
  crate (alongside `hub/`, `seed/`, `identity/` in Wavvon-server).
  k6 doesn't speak our auth (challenge/sign/exchange) cleanly, and
  hand-rolling 10k concurrent WS clients in tokio is straightforward
  and gives us metrics in the same process. The harness reuses the
  `identity/` crate to generate test keypairs.
- **Scenario A — connection ceiling**: spin up N clients that connect,
  send `Subscribe` for one channel each, idle. Ramp N until something
  breaks (FDs, RAM, accept latency). Capture: time to reach steady
  state, hub RSS, hub CPU at idle, accept latency p99.
- **Scenario B — broadcast throughput**: N=1000 idle subscribers on
  one channel, one sender posts M messages/sec via HTTP POST. Ramp M.
  Capture: end-to-end delivery latency (sender timestamp → receiver
  recv) p50/p95/p99, `Lagged` warning count, hub CPU.
- **Scenario C — slow consumer**: same as B, but 10% of clients
  artificially throttle their WS read (sleep 50ms between reads).
  Capture: at what M do the slow clients start dropping?
- **Metrics**: emit a Prometheus text endpoint from the hub during
  the test (gated behind a feature flag so it's not in release
  builds) and have the harness scrape it. Bonus: this gives ops a
  permanent monitoring story later.

### Suspected "good enough" threshold

- **Connections**: 5,000 concurrent WS on a 4-core / 8 GB VPS.
  Beyond that, recommend a second hub and federation.
- **Throughput**: sustain 100 chat events/sec across 1,000 subscribers
  with p95 delivery under 250 ms and zero `Lagged` warnings for
  well-behaved clients.

### Optimizations to consider, in order

1. **Pre-serialise once per event**, then send the same `Arc<str>` to
   every receiver. The current loop reserialises per-connection — a
   trivial win that removes per-receiver JSON cost.
2. **Per-channel broadcast channels** (lazy-created in a `DashMap` on
   first subscriber). Today one chatty channel wakes every connection
   on the hub. Per-channel fan-out reduces wake count to actual
   subscribers. Tradeoff: more channel handles, slightly more
   complex teardown. Probably worth it only if scenario B shows the
   filter loop is a real CPU sink.
3. **Bump broadcast capacity** from 256 to e.g. 1024 once we know what
   actual lag profiles look like. Free RAM cost, but only buys time —
   doesn't fix a real slow consumer, just hides it longer.
4. **Connection cap per hub**, configurable via env, default 5000.
   Returns 503 on accept past the cap. Operators can tune up if their
   box is bigger. This is a release valve, not a fix.

Backpressure (slow down the sender if receivers are lagging) is
**rejected up front**: it makes one bad client degrade everyone else.
The current "drop and log" policy is correct for a chat system; the
client refetches on reconnect or scroll.

## 2. Search

### Suspected ceiling

`LIKE '%q%' COLLATE NOCASE` is a sequential scan over every message
row in the channel. SQLite on a modern SSD scans roughly **300k–1M
rows/sec** for short rows; messages are short (median ~50 bytes of
content), so a channel with 100k messages probably searches in well
under a second cold and tens of milliseconds warm. A 1M-message
channel — plausible for a multi-year community hub — starts hurting.

The ceiling we actually hit is **concurrent search queries blocking
writes**, because SQLx's pool serialises writers and we run on
WAL mode where readers don't block writers but a long-running reader
holds a snapshot. Practical: search latency p95 stays under 100ms up
to ~500k messages per channel; past that it starts to feel slow and
two users searching at once compete for the I/O.

### Benchmark design

- **Tool**: same `loadtest/` harness, a new scenario file.
- **Setup**: seed N messages into one channel (100k, 500k, 1M, 5M
  steps). Content sampled from a corpus of realistic short messages
  (no Lorem Ipsum — token distribution affects FTS5 in particular).
- **Run**: M concurrent clients (M = 1, 5, 20) issue searches against
  random query terms with varying selectivity (common word vs rare
  word vs phrase).
- **Metrics**: query latency p50/p95/p99, hub CPU during query, hub
  RSS, SQLite WAL size growth. Compare LIKE-baseline vs FTS5 (run
  twice, once with and once without the index built).

### Suspected "good enough" threshold

p95 search latency under **200 ms** at 500k messages/channel with 5
concurrent searches. That covers any realistic community-scale hub
through several years of activity.

### Optimizations to consider, in order

1. **Add an FTS5 virtual table** mirroring `messages.content`, kept in
   sync via SQL triggers (insert/update/delete on `messages` → same on
   `messages_fts`). Switch the search query to use `MATCH` instead of
   `LIKE`. FTS5 indexing changes the search from O(rows) to O(matches),
   which is the actual right shape. Disk cost: roughly 20–40% on top
   of the messages table — acceptable.
2. **Pagination on search results** (already implicit with `LIMIT`,
   but expose a search cursor in the API). Current `LIMIT 100` is
   fine for v1, but a "load more" button on search needs an
   ordered cursor — `rowid < ?` works for FTS5 too if we keep the
   rowid alignment.
3. **Reject empty/whitespace queries** early (already done in
   `messages.rs:357-359`) — keep this.
4. **Cache popular searches**? Rejected for now: search queries are
   user-typed and rarely repeated. Not worth the invalidation
   complexity. Revisit if benchmarks show the same few queries
   dominate (they won't).

Read replica / move-to-Postgres are explicitly **deferred**. SQLite
with FTS5 is sufficient for community scale; the moment a hub needs
Postgres it needs the farm model (see `farm-model.md`) — that's a
different conversation.

## 3. Voice relay

### Suspected ceiling

The relay loop has two costs per packet:

- A read-lock on `voice_channels` (a `RwLock<HashMap<...>>`).
  Contention-free with one task, but it still atomic-ops on every
  packet.
- A linear scan over every channel and every participant looking for
  the source `SocketAddr` (`main.rs:163-175`). This is **O(total
  participants on the hub)** per inbound packet, not O(channel).

At Opus 32 kbps, one stream is ~40 packets/sec (Opus frames typically
20ms). Bandwidth per participant out of the hub is `(N-1) × 32 kbps`
where N is the room size — a 10-person voice room costs the hub
~288 kbps **per participant**, or ~2.88 Mbps total egress for that
room. The CPU per packet is small (one `send_to` syscall per other
participant) but the syscall count is N×(N-1)×40 per second per room.

Suspected first bottleneck: **single-task fan-out** caps at maybe
500–1000 packet-sends/sec on a small VPS before syscall latency
serialises the loop. That's 5–10 person voice rooms maxed out at one
per hub, *or* one larger 15-person room with no headroom.

### Benchmark design

- **Tool**: a Rust harness (also under `loadtest/`) that opens N UDP
  sockets, registers each with the hub via the WS `VoiceJoin` flow,
  then synthetically pumps Opus-shaped packets (the right size, the
  right cadence — 40 pkts/sec at ~80–120 bytes payload). No real
  audio needed; the relay doesn't decode.
- **Scenarios**:
  - **One room growing**: 2, 5, 10, 15, 20 participants in one room.
    Measure relay latency (sender clock vs receiver clock — clients
    are on the same host so this is meaningful), packet loss,
    hub CPU.
  - **Many rooms**: 10 rooms × 5 participants. Tests whether the
    cross-channel linear scan starts mattering.
- **Metrics**: per-packet relay latency p50/p95/p99, packet drop
  rate, hub CPU split between the UDP task and the rest, kernel
  UDP send buffer overruns (`netstat -su`).

### Suspected "good enough" threshold

A single hub should sustain **one 10-person voice room with p95 relay
latency under 20 ms** on a 2-vCPU VPS. That's the common community
case. Beyond 10 in one room, recommend splitting the conversation.

### Optimizations to consider, in order

1. **Reverse the source-address lookup**: keep a second
   `HashMap<SocketAddr, (channel_id, public_key)>` alongside
   `voice_channels`. Lookup goes O(total participants) → O(1).
   This is the single biggest expected win and costs maybe 30 lines.
2. **Pre-collect destination addresses outside the lock**: clone the
   per-channel `Vec<SocketAddr>` under the read lock, drop the lock,
   then do the `send_to`s. Today the lock is held across every
   syscall in the fan-out.
3. **One forwarding task per room** above some threshold (e.g. 5
   participants). The current single-task design is fine for low
   total throughput; per-room tasks remove cross-room contention and
   let the kernel parallelise UDP sends across CPU cores. Tradeoff:
   task lifecycle (spawn on first join, despawn on last leave).
4. **SFU vs MCU**: stay SFU (we are today). MCU = decode + mix + re-encode
   on the hub. That's where you go when CPU is cheap and bandwidth
   is expensive (mobile clients on bad networks). For a self-hosted
   community hub on a VPS, CPU is the scarce resource — SFU stays.
   Documenting this here so we don't redebate it.
5. **Jitter buffer tuning**: client-side concern, not hub-side.
   Defer to the `voice/` crate in Wavvon-desktop. Mentioned for
   completeness; not part of this work.

## 4. Recommended implementation order

Rank: **voice relay first, search second, WS broadcast third**.

- **Voice first** because (a) the O(N) source lookup is a real bug,
  not just a ceiling — it degrades with every other voice user on the
  same hub, even ones not in your room; (b) the fix is small; (c)
  voice latency is the most user-visible quality metric we have.
- **Search second** because adding FTS5 is mechanical, the
  user-visible payoff is "search doesn't hang on big channels," and
  the migration is non-destructive (the FTS5 table can be built
  alongside the existing data and the query switched atomically).
- **WS broadcast third** because the current code probably already
  hits the suspected "good enough" threshold (5k connections, 100
  msg/sec). The measurement matters more than any fix; we may find
  out there's nothing to do here for a year.

"Good enough" gates per axis are stated under each section. When all
three are green on the benchmarks, the wishlist item closes and the
results go into [`hosting.md`](hosting.md) as a sizing guide.

## 5. Tooling and CI integration

- **In CI**: a smoke benchmark for **search** only. Insert 10k
  messages into a test channel, run 100 queries, assert p95 latency
  under a generous bound (say 500 ms). This catches regressions like
  "someone accidentally dropped the FTS5 index" without burning CI
  minutes. Add it under `hub/tests/perf_search.rs` in Wavvon-server
  and gate with `#[ignore]` so it runs only on `cargo test -- --ignored`
  in the perf CI job. Total runtime budget: 30 seconds.
- **Not in CI**: WS broadcast and voice relay benchmarks. Both need
  thousands of sockets / FDs and a stable network — GitHub Actions
  runners are noisy enough that the numbers wouldn't be comparable
  run-to-run. Run these as **manual pre-release checks** on a
  dedicated benchmark VPS, capture the report, and tag releases with
  the perf numbers in the release notes. The `loadtest/` crate is
  invoked manually (`cargo run --release -p loadtest -- ws-broadcast
  --clients 5000 --duration 60s`).
- **Regression detection**: store benchmark JSON output in a
  separate `Wavvon-server-perf-history` repo (or a long-lived
  branch). Two consecutive releases give us a delta. We don't need
  Grafana for this — a CSV and a release-notes line is enough at
  community scale.

## What's deferred

- Cross-hub performance (alliance fan-out across federated peers).
  Federation already has rate limits per peer; ceilings there are a
  different exercise. Revisit when alliance traffic in practice gets
  high enough to ask the question.
- Disk I/O profiling (attachments, hub icons). Capped at 3 MB
  per attachment, no current evidence it's near a limit.
- Memory profiling beyond RSS sampling. If RSS grows during the
  scenarios above, that's a leak — separate bug, separate doc.

## Files referenced

- `hub/src/state.rs:84-102` (Wavvon-server) — broadcast channels
- `hub/src/main.rs:83-86` (Wavvon-server) — channel capacity
- `hub/src/main.rs:151-182` (Wavvon-server) — UDP voice relay loop
- `hub/src/routes/ws.rs:85-89, 174-235` (Wavvon-server) — fan-out loop
- `hub/src/routes/messages.rs:355-376` (Wavvon-server) — search query
- `hub/src/db/migrations.rs` (Wavvon-server) — where FTS5 will be added
- `voice/` crate in Wavvon-desktop — see [voice.md](voice.md)
