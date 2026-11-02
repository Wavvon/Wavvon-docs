# Architecture

Wavvon is four repositories. The hub backend lives in one Rust
workspace; all clients live in one pnpm-workspace monorepo; the docs and
the discovery service are each their own repo.

## The repository map

```
Wavvon              ── docs, ROADMAP.md, openapi.yaml (this repo)
Wavvon-server       ── Rust workspace: crates/{hub, identity, hub-env,
                       farm, agent, demo-seed}
Wavvon-clients      ── pnpm + Cargo monorepo for every client:
                       apps/web (Vite + React, two builds),
                       apps/desktop (Tauri 2 + React),
                       crates/voice (Rust),
                       packages/core|i18n|ui (shared TS)
Wavvon-discovery    ── Next.js directory: hubs, clients, providers, docs
```

The clients were previously three separate repos (Wavvon-desktop,
Wavvon-web, Wavvon-android); they were consolidated into the single
**Wavvon-clients** monorepo, and those three names resolve to nothing today.
There is no Android app in the workspace — only `apps/web` and
`apps/desktop`. Older docs may still reference the split repos.

## The Wavvon-server workspace

A hub is **self-hosted**: somebody runs the `wavvon-hub` binary on their
own machine, and no client creates one (see [decisions.md](decisions.md),
"A hub is self-hosted"). The **Farm → Server → Hub** layering
("Architecture: Farm → Server → Hub") is an optional way for one operator
to run many hubs: a farm is the control plane, a server is a compute node
running the agent, and a hub is a process the agent spawns. *(Status
2026-11-02: an earlier version of this page called standalone hubs
deprecated; that was reversed by the self-hosted decision.)*

### `hub/` crate

A single hub. Owns:
- An axum HTTP+WebSocket API (port 3000 by default).
- A WebTransport (QUIC) voice relay on UDP 3001 by default, for web and
  desktop alike (`voice_wt.rs`; see [voice-transport-v2.md](voice-transport-v2.md)).
- A PostgreSQL database (configured via `WAVVON_DATABASE_URL`).
- An outbox worker for federated DMs (`dm_worker.rs`).
- A federation client for talking to other hubs.
- Background workers: federated ban-list sync (`banlist_worker.rs`),
  data retention (`retention_worker.rs`), cert maintenance
  (`cert_worker.rs`).

Entry: `Wavvon-server: crates/hub/src/main.rs` → `server.rs` (router setup).

Key submodules (all under `Wavvon-server: crates/hub/src/`):
- `auth/` — challenge-response signature auth (see [identity.md](identity.md))
- `routes/` — every HTTP endpoint, one file per resource
- `federation/` — hub-to-hub HTTP client + handlers
- `db/migrations.rs` — schema (see [data-model.md](data-model.md))

### `farm/` crate

The control plane. Manages a fleet of servers and the hubs running on
them: server registration (one-time tokens, `token.rs`), hub lifecycle
delegation to connected server agents (`hub_manager.rs`), reverse
proxying to hub processes (`proxy.rs`), and its own PostgreSQL database.
Rationale in [decisions.md](decisions.md) ("Farm model phases 1 + 2"
and "phase 3") and design in [farm-model.md](farm-model.md) /
[farm-impl.md](farm-impl.md).

### `agent/` crate

The server agent (`wavvon-agent` binary). Runs on each compute node,
reverse-connects to its farm over WebSocket (`agent.rs`), and spawns,
monitors, and stops local hub processes on the farm's behalf
(`hub_manager.rs`). No HTTP surface of its own.

### `identity/` crate

Ed25519 keypairs, BIP39 recovery phrases, proof-of-work helpers. No
networking, no storage. The hub consumes it directly, and it is the
**canonical wire-format authority**: signing bytes, key encodings, and
verification rules are defined by this crate. Non-Rust clients do not
link it — the Tauri shells carry their own `identity.rs`
(Wavvon-clients `apps/desktop`) and the browser
clients carry TypeScript implementations (Wavvon-clients
`packages/core/src/identity/`) —
so each reimplementation must match the crate byte-for-byte, validated
against shared test vectors. The spec is [wire-format.md](wire-format.md)
in this repo; the vectors are `Wavvon-server: crates/identity/wire-vectors.json`.
Apache-2.0, unlike the rest of the workspace, so third-party clients can link it.

- Lib entry: `crates/identity/src/lib.rs` (Wavvon-server)
- Recovery phrases: `crates/identity/src/recovery.rs` (Wavvon-server)
- PoW helpers: `crates/identity/src/pow.rs` (Wavvon-server)

The `store/` crate (a `HubStore` trait over PostgreSQL) is gone: the hub
queries PostgreSQL directly through `AppState.db`, a `PgPool`.
[store-trait-design.md](store-trait-design.md) is kept for the history.

### `crates/voice/` (in Wavvon-clients)

Audio pipeline: capture → denoise (RNNoise) → encode (Opus) → encrypt →
WebTransport → decode → playback. Used by the desktop Tauri shell; the
web client does the same in the browser.

- Pipeline orchestration: `crates/voice/src/pipeline.rs` (Wavvon-clients)
- Codec: `crates/voice/src/codec.rs` (Wavvon-clients)
- WebTransport client: `crates/voice/src/transport.rs` (Wavvon-clients)
- Wire protocol: `crates/voice/src/protocol.rs` (Wavvon-clients)

See [voice.md](voice.md) for the full data flow.

### `apps/desktop/` (in Wavvon-clients)

Tauri 2 (Rust shell) + React 19 (UI). The Rust side handles file I/O,
voice, and OS integration; the React side is everything you see.

- React entry: `apps/desktop/src/main.tsx` → `App.tsx` (Wavvon-clients)
- Tauri commands (Rust ↔ JS bridge): `apps/desktop/src-tauri/src/lib.rs` (Wavvon-clients)

See [client.md](client.md) for the structure.

## Federation, briefly

Hubs are independent. They peer over HTTPS + WebSocket using their own
Ed25519 keypairs as identity. There's no central directory — you connect
to a hub by URL. Federation enables:

- **DMs across hubs** — sender's hub queues to recipient's hub via outbox.
- **Alliances** — named groups of peer hubs sharing channels and reactions.

See [federation.md](federation.md) for the protocol and
[alliances.md](alliances.md) for alliances.

## Why this shape

- **Hubs over a central server**: communities own their data and their
  moderation policy. Federation lets them stay connected without a single
  operator. (See [decisions.md](decisions.md).)
- **One canonical identity implementation**: identity rules must agree
  exactly between hub and clients. The Rust `identity/` crate in
  Wavvon-server is the single source of truth for the wire format;
  client reimplementations (Rust shells and TypeScript) are verified
  against it with shared test vectors rather than linking the crate.
- **Self-hosted hubs, optional farm**: a community owns its hub by running
  it; the farm layering exists for an operator with many hubs, not as a
  required control surface. (See [decisions.md](decisions.md).)
- **Tauri over Electron**: smaller binaries, native voice, real OS APIs.
