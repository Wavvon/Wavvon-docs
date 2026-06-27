# Hub Operations

Operational features for the people who *run* a hub — self-hosters and
farm operators — rather than the people who chat on it. These are not
protocol changes a client sees; they keep a hub recoverable, observable,
bounded in storage, and able to rotate its long-lived identity without
breaking federation trust.

Everything here lives in the **Wavvon-server** hub crate
(`hub/` workspace). The CLI subcommands dispatch from `hub/src/main.rs`
(see the `migrate` arm at `main.rs:107` for the existing pattern); the
background jobs follow the `cert_worker` / `token_expiry` spawn pattern
(`main.rs:273`, `main.rs:276`). None of these features require a client
update, and none change the federation wire format except the new
`/key-rotation` endpoint.

> See also: [hosting.md](hosting.md) (the practical run guide that this
> design backs), [data-model.md](data-model.md) (schema), and
> [federation.md](federation.md) (why key rotation must preserve trust).

---

## 1. Hub backup & restore

**Status: designed, not started.**

**Decision**: two CLI subcommands, `wavvon-hub backup [<out-path>]` and
`wavvon-hub restore <path>`, that operate on durable state only. Backup
produces a single portable `.tar.gz` containing exactly three files:

- `hub.db` — the SQLite database (all messages, channels, roles,
  members, certs, sessions).
- `hub_identity.json` — the hub's Ed25519 keypair (loaded at
  `main.rs:124`).
- `backup_meta.json` — `{ timestamp, hub_pubkey, wavvon_version }`, for
  identity verification on restore and operator sanity-checking.

**What is deliberately *not* backed up**: voice packets and all
ephemeral in-memory state — `voice_channels`, `active_game_sessions`,
`video_channels`, screen shares, `online_users` (`state.rs:167–204`).
These are runtime state that is cleared on every restart by design; a
restored hub comes back with empty voice rooms, which is correct.

**No encryption at rest in v1.** The archive contains
`hub_identity.json`, which holds the hub's *signing key* — the secret
that lets the hub speak for itself in federation. The backup file is
therefore as sensitive as the live identity file and the operator is
responsible for securing it (file permissions, encrypted volume, or
piping the archive through their own `gpg`/`age`). The doc and the CLI
output both state this loudly.

**Restore behaviour** (`wavvon-hub restore <path>`):

1. Extract the archive to a staging directory (never operate on live
   files mid-extraction).
2. Read `backup_meta.json` and compare its `hub_pubkey` to the current
   on-disk `hub_identity.json`. If they differ, warn loudly — restoring
   a *different* hub's identity over this one changes who this hub is to
   the federation. Proceed only with an explicit `--force` (or an
   interactive confirm); otherwise abort.
3. Run forward-only, additive migrations on the staged DB (same
   migration set as the `migrate` subcommand) so a backup taken on an
   older binary restores cleanly onto a newer one.
4. Atomically replace the live `hub.db` and `hub_identity.json` with the
   staged copies, then exit.

The operator restarts the hub manually after restore. Restore does **not**
hot-swap a running process — it expects the hub to be stopped, which
avoids the in-flight-write problem entirely.

**Alternative considered — live hot backup via SQLite WAL** (online
backup API / `VACUUM INTO` against a running hub). Rejected for v1:
operationally complex (WAL checkpoint coordination, snapshot
consistency with concurrent writers) for a class of operator who is
overwhelmingly a single self-hoster who can afford a few seconds of
downtime. A plain file copy with the hub shut down is simpler and
correct. The WAL path stays open as a v2 if a no-downtime requirement
materializes for farm operators.

**Implementation side** (Wavvon-server): new subcommand arms in
`hub/src/main.rs` alongside `migrate`; the archive build/extract and
meta-file verify also live in `hub/src/main.rs` (no separate module
was needed). No new DB tables, no route changes.

**Not in scope for v1**: scheduled/automatic backups (operators use
`cron` + the CLI), remote/object-storage destinations, and incremental
backups.

---

## 2. Data retention policy

**Status: designed, not started.**

**Decision**: an opt-in, per-channel auto-purge of old messages,
configured by a hub admin and executed by a nightly background job.
Retention is an *unconditional purge*, not an archive.

**Where it is stored**: a new nullable `retention_days` column on the
`channels` table. `NULL` (the default and the migration backfill) means
*keep forever* — existing channels are unaffected. Set it via
`PATCH /admin/channels/:id` with `{ "retention_days": 30 }`, or
`{ "retention_days": null }` to disable. The route gates on the hub-admin
permission already used by the other `/admin/channels` handlers.

**The sweep job**: a `tokio::spawn` interval loop started at hub boot,
running once every 24 hours — the same pattern as `cert_worker::spawn`
(`main.rs:276`) and `token_expiry::spawn` (`main.rs:273`). For each
channel with a non-NULL `retention_days`, it hard-deletes messages where
`created_at < now - retention_days * 86400`. No soft-delete flag —
retention's contract is "gone means gone," so a tombstone would only add
storage and surprise.

**Attachments**: inline attachments are base64 in the
`messages.attachments` column and are deleted with the row. There is no
separate blob store to garbage-collect.

**Forum posts**: forum channels carry a separate `posts` table (see
[forum.md](forum.md)). A parallel sweep deletes posts older than the same
`retention_days`, and their reply threads go with them via the existing
`ON DELETE CASCADE` foreign key — using `posts.created_at`. The same
per-channel setting governs both message channels and forum channels.

**Alternative considered — archive messages before deleting** (export to
a side table or file, then purge). Rejected: it violates the
user-facing expectation that a deleted message is *gone*, and it
quietly recreates the storage problem retention exists to solve. An
operator who wants long-term retention simply leaves the setting NULL
and takes backups (feature 1).

**Implementation side** (Wavvon-server): migration adding
`channels.retention_days`; a new `hub/src/retention_worker.rs` spawned
from `main.rs`; the `retention_days` field wired into the existing
`PATCH /admin/channels/:id` handler and its response. No client change —
the admin UI picks up the field through the existing channel-settings
form once the API exposes it.

**Not in scope**: per-user opt-out, legal hold / per-message exemptions,
and any federated retention guarantee. Federation is best-effort: a
remote hub that mirrored a message keeps its own copy on its own
schedule, and a purge here does not (and cannot) reach across hubs. That
is consistent with [federation.md](federation.md) — there is no global
source of truth to enforce against.

---

## 3. Prometheus `/metrics` endpoint

**Status: designed, not started.**

**Decision**: a `GET /metrics` route returning the standard Prometheus
text exposition format, with **no auth**. Operators front this the way
they front any scrape target — firewalled, on loopback, or behind their
reverse proxy — rather than us inventing a metrics token. This matches
the dominant operator expectation for a pull-based scrape.

**Metrics in v1** (intentionally small; add more as they prove useful):

| Metric | Type | Source |
| --- | --- | --- |
| `wavvon_online_users` | gauge | `online_users.len()` (`state.rs:180`) |
| `wavvon_voice_participants` | gauge | sum of participants across `voice_channels` (`state.rs:167`) |
| `wavvon_active_game_sessions` | gauge | `active_game_sessions.len()` (`state.rs:201`) |
| `wavvon_active_video_channels` | gauge | `video_channels.len()` (`state.rs:204`) |
| `wavvon_messages_total` | counter | incremented when a message is stored |
| `wavvon_uptime_seconds` | gauge | `started_at.elapsed().as_secs()` (`state.rs:209`) |
| `wavvon_db_size_bytes` | gauge | `stat()` on the `hub.db` file |

The counter (`wavvon_messages_total`) needs a process-lifetime
`AtomicU64` on `AppState`, bumped at the message-store path; it resets on
restart, which is correct counter semantics (Prometheus handles counter
resets). Everything else is read live from existing `AppState` fields,
so the endpoint has no background cost between scrapes.

**Implementation approach — no external crate in v1.** The exposition
format for this set is plain text (`# HELP`/`# TYPE` lines plus
`metric_name value\n`); a handful of `format!()` calls covers it. Pulling
in the `prometheus` crate now would add a registry abstraction for seven
trivial values. We reach for the crate only once the metric set grows
enough that hand-formatting becomes error-prone (labels, histograms).

**Where it lives** (Wavvon-server): a new `GET /metrics` handler in
`hub/src/server.rs`, mounted *outside* the auth middleware, reading
`AppState` directly. No DB schema change beyond reading the file size.

**Alternative considered — OpenTelemetry OTLP as the only metrics
path.** The codebase already emits OTLP *traces*, so reusing it for
metrics is tempting. Rejected as the *sole* path: OTLP is push-based and
assumes a collector, while the overwhelming operator pattern for a
self-hosted service is Prometheus *pull*. The two are not in conflict —
they serve different deployments and can coexist (OTLP push for managed
farms with a collector, Prometheus pull for self-hosters). v1 ships the
one that unblocks the most operators with the least setup.

---

## 4. Hub key rotation

**Status: designed, not started.**

**Problem**: the hub's Ed25519 keypair (`hub_identity.json`) is a single,
long-lived identity. Peers, alliances, and certificate verifiers trust
that pubkey directly (see [federation.md](federation.md),
[alliances.md](alliances.md)). Today there is no way to rotate it without
silently becoming a "different hub" to everyone who cached the old key.

**Decision**: an operator-triggered rotation *ceremony* in which the old
key signs a statement endorsing the new key, published for a transition
window so federation peers can re-pin trust before the old key goes away.

The signed payload (`HubKeyRotation`):

```
{ old_pubkey, new_pubkey, effective_at, signature }
```

The `signature` is the old key's signature over the canonical bytes of
the other three fields. This is the same Ed25519 signer already used for
badges and hub certifications (see [server-tags.md](server-tags.md),
[hub-certifications.md](hub-certifications.md)), so verifiers reuse
existing primitives.

**How federation trusts it**:

- The hub serves the payload at a new `GET /key-rotation` endpoint for a
  configurable transition window (default **30 days**).
- A peer or alliance member that holds the *old* pubkey fetches
  `/key-rotation`, verifies the signature against the old pubkey it
  already trusts, and on success caches `new_pubkey` as this hub's
  identity. Because the endorsement is signed by the key they already
  trust, no out-of-band channel is needed.
- `GET /info` also carries an optional `rotation` field with the same
  payload while a rotation is active, so a peer making an ordinary `/info`
  call notices the rotation without a separate fetch.

**CLI flow**: `wavvon-hub rotate-key [--new-key-path <path>]`

1. Generate a new Ed25519 keypair (or load one from `--new-key-path`).
2. Build the `HubKeyRotation` payload and sign it with the *old* key.
3. Write the payload to `hub_rotation.json` and replace
   `hub_identity.json` with the new key.
4. Instruct the operator to restart the hub. (Like restore, this is not a
   hot swap — the running process keeps the old key until restart.)

After restart the hub signs new things with the new key and serves the
rotation payload from `hub_rotation.json` until `effective_at +
transition window` passes.

**What gets migrated — and what doesn't**:

- **Sessions**: nothing to do. Session tokens are bearer tokens with no
  hub-pubkey reference; they remain valid across rotation.
- **Certificate issuances** (`cert_issuances`): these are signed by, and
  explicitly *carry*, the issuer pubkey. Certs signed by the old key stay
  valid until their own expiry — a verifier checks them against the
  embedded old pubkey, which the rotation payload chains to the new one.
  Certs issued after rotation are signed by the new key.
- **Badges**: same as certs — old-key-signed badges remain valid through
  their expiry; new badges use the new key.

So rotation is non-destructive to outstanding signed credentials: nothing
is re-signed or invalidated, the old key's signatures simply age out
naturally while the endorsement chain lets verifiers follow the identity
forward.

**Alternative considered — automatic key rotation on a schedule** (the
hub rotates itself every N days). Rejected: rotation only works if peers
have *time and awareness* to re-fetch `/key-rotation` within the
transition window. A hub that rotates unattended can drop offline mid-
window (the most common self-hoster failure mode) and strand peers on a
stale key with no human watching. Manual, operator-triggered rotation
keeps a human in the loop who can confirm peers have re-pinned — the same
"operator is the authority on their own hub" stance as
[threat-model.md](threat-model.md).

**Implementation side** (Wavvon-server): `rotate-key` subcommand in
`hub/src/main.rs`; a `hub/src/routes/key_rotation.rs` serving
`GET /key-rotation`; the optional `rotation` field added to the `/info`
handler; the `HubKeyRotation` sign/verify helper placed in the
`identity` crate next to the existing bound-bundle signer so client and
hub agree on the canonical bytes; load `hub_rotation.json` at boot
alongside `hub_identity.json`.

---

## What's deferred

- **Scheduled / automatic backups and remote backup targets** — v1 leans
  on `cron` + the CLI; managed-farm scheduling is a farm-console concern
  ([farm-model.md](farm-model.md)).
- **Encrypted-at-rest backups** — v1 puts this on the operator; a
  built-in passphrase-wrap (mirroring the client's `.wavvon-backup`
  envelope in [identity-recovery.md](identity-recovery.md)) is a natural
  v2.
- **Live (no-downtime) hot backup via SQLite WAL** — deferred until a
  farm-scale no-downtime requirement appears.
- **Retention nuance** — per-user opt-out, legal hold, and any federated
  retention coordination are out of scope; federation stays best-effort.
- **Metrics depth** — labels, histograms, per-channel/per-route
  breakdowns, and OTLP metrics push all wait until the flat v1 set proves
  insufficient (at which point we adopt the `prometheus` crate).
- **Cross-farm key-rotation propagation** — broadcasting a rotation across
  every hub on a farm is a farm-layer feature, not a single-hub one.
- **Wallet-style key derivation** — deriving the hub key from a master
  seed (HD-wallet style) so rotation is deterministic is out of scope;
  v1 rotation generates an independent new keypair.
