# Store trait: database abstraction for the hub

**Status:** designed, not built.

The goal is a hub server that is agnostic to its database, so a community
can contribute a PostgreSQL or MySQL backend without touching a single route
handler. Today the hub is welded to SQLite.

---

## 1. Motivation

Every handler in `hub/src/routes/` reaches into `state.db` — a bare
`sqlx::SqlitePool` — and runs raw `sqlx::query*` strings.
`permissions::user_permissions(&state.db, ...)` does the same. Errors are
mapped ad-hoc (`sqlx::Error` → `(StatusCode, String)`, often by sniffing
`"UNIQUE"` in the message string). The schema lives in
`hub/src/db/migrations.rs` as SQLite DDL with FTS5 virtual tables and
triggers. There is no seam: swapping the database means rewriting every
route. Abstracting the data layer behind traits gives that seam.

---

## 2. Crate layout

Three crates in the Wavvon-server workspace:

| Crate | Purpose | DB deps |
|-------|---------|---------|
| `wavvon-store` | Trait definitions, `StoreError` enum, row/DTO structs | **none** |
| `wavvon-store-sqlite` | Current SQLite impl — all `sqlx::query*` calls move here | `sqlx` (sqlite feature) |
| `wavvon-store-postgres` | Future community backend | `sqlx` (postgres feature) |

`wavvon-store` is the contract. The hub binary depends on it and on exactly
one backend crate; it never names the other backends in code.

---

## 3. Trait granularity

No God trait. One trait per domain so a backend author can implement and
test one area at a time, and the compiler error surface stays small.

```rust
#[async_trait]
pub trait AuthStore: Send + Sync {
    async fn create_session(&self, token: &str, pubkey: &str, expires_at: Option<i64>) -> Result<(), StoreError>;
    async fn session_pubkey(&self, token: &str) -> Result<Option<String>, StoreError>;
    async fn delete_session(&self, token: &str) -> Result<(), StoreError>;
    async fn resolve_canonical_identity(&self, auth_pubkey: &str, master: Option<&str>) -> Result<(String, Option<String>), StoreError>;
    async fn record_subkey_cert(&self, cert: &SubkeyCertRow) -> Result<(), StoreError>;
    async fn is_subkey_revoked(&self, master: &str, subkey: &str) -> Result<bool, StoreError>;
}

#[async_trait]
pub trait UserStore: Send + Sync {
    async fn upsert_user(&self, pubkey: &str, now: i64) -> Result<(), StoreError>;
    async fn get_user(&self, pubkey: &str) -> Result<Option<UserRow>, StoreError>;
    async fn set_display_name(&self, pubkey: &str, name: &str) -> Result<(), StoreError>;
    async fn set_approval_status(&self, pubkey: &str, status: &str) -> Result<(), StoreError>;
    async fn list_members(&self, limit: i64, offset: i64) -> Result<Vec<UserRow>, StoreError>;
    async fn display_names_for(&self, pubkeys: &[String]) -> Result<HashMap<String, Option<String>>, StoreError>;
}

#[async_trait]
pub trait ChannelStore: Send + Sync {
    async fn create_channel(&self, ch: &NewChannel) -> Result<(), StoreError>;
    async fn get_channel(&self, id: &str) -> Result<Option<ChannelRow>, StoreError>;
    async fn list_channels(&self) -> Result<Vec<ChannelRow>, StoreError>;
    async fn update_channel(&self, id: &str, patch: &ChannelPatch) -> Result<(), StoreError>;
    async fn delete_channel(&self, id: &str) -> Result<(), StoreError>;
    async fn set_channel_order(&self, id: &str, order: i64) -> Result<(), StoreError>;
}

#[async_trait]
pub trait MessageStore: Send + Sync {
    async fn insert_message(&self, m: &NewMessage) -> Result<(), StoreError>;
    async fn get_message(&self, id: &str) -> Result<Option<MessageRow>, StoreError>;
    // Cursor pagination: `before` is a message id; None = newest page.
    async fn page_messages(&self, channel_id: &str, before: Option<&str>, limit: i64) -> Result<Vec<MessageRow>, StoreError>;
    async fn edit_message(&self, id: &str, content: &str, edited_at: i64) -> Result<(), StoreError>;
    async fn delete_message(&self, id: &str) -> Result<(), StoreError>;
    async fn toggle_reaction(&self, message_id: &str, emoji: &str, user: &str, now: i64) -> Result<(), StoreError>;
}

#[async_trait]
pub trait RoleStore: Send + Sync {
    async fn create_role(&self, r: &NewRole) -> Result<(), StoreError>;
    async fn list_roles(&self) -> Result<Vec<RoleRow>, StoreError>;
    async fn role_permissions(&self, role_id: &str) -> Result<Vec<String>, StoreError>;
    async fn set_role_permissions(&self, role_id: &str, perms: &[String]) -> Result<(), StoreError>;
    async fn assign_role(&self, pubkey: &str, role_id: &str, now: i64) -> Result<(), StoreError>;
    async fn user_permissions(&self, pubkey: &str) -> Result<UserPerms, StoreError>;
}

#[async_trait]
pub trait InviteStore: Send + Sync {
    async fn create_invite(&self, code: &str, by: &str, max_uses: Option<i64>, expires_at: Option<i64>, now: i64) -> Result<(), StoreError>;
    async fn get_invite(&self, code: &str) -> Result<Option<InviteRow>, StoreError>;
    async fn list_invites(&self) -> Result<Vec<InviteRow>, StoreError>;
    async fn consume_invite(&self, code: &str) -> Result<(), StoreError>; // atomic uses += 1
    async fn delete_invite(&self, code: &str) -> Result<(), StoreError>;
}

#[async_trait]
pub trait ModerationStore: Send + Sync {
    async fn ban_user(&self, target: &str, by: &str, reason: Option<&str>, now: i64) -> Result<(), StoreError>;
    async fn unban_user(&self, target: &str) -> Result<(), StoreError>;
    async fn is_banned(&self, target: &str) -> Result<bool, StoreError>;
    async fn is_muted(&self, target: &str) -> Result<bool, StoreError>;
    async fn channel_ban(&self, channel_id: &str, target: &str, by: &str, reason: Option<&str>, now: i64) -> Result<(), StoreError>;
    async fn create_report(&self, r: &NewReport) -> Result<(), StoreError>;
}

#[async_trait]
pub trait SettingsStore: Send + Sync {
    async fn get_setting(&self, key: &str) -> Result<Option<String>, StoreError>;
    async fn set_setting(&self, key: &str, value: &str) -> Result<(), StoreError>;
    async fn all_settings(&self) -> Result<HashMap<String, String>, StoreError>;
    // INSERT OR IGNORE equivalent — sets the value only when no row exists yet.
    async fn seed_default(&self, key: &str, value: &str) -> Result<(), StoreError>;
}
```

**Remaining domains — same pattern:** `BotStore`, `DmStore`,
`FederationStore`, `PollStore`, `GameStore`, `EventStore`, `CertStore`,
`BadgeStore`, `RecoveryStore`, `UploadStore`. Each mirrors the corresponding
table group in `hub/src/db/migrations.rs`. Don't fold them into the ones
above.

---

## 4. The combined store bound

Route handlers don't want to thread a dozen trait objects. A super-trait is
the union, with a blanket impl so any type satisfying all parts automatically
satisfies `HubStore`:

```rust
pub trait HubStore:
    AuthStore + UserStore + ChannelStore + MessageStore + RoleStore
    + InviteStore + ModerationStore + SettingsStore + BotStore + DmStore
    + FederationStore + PollStore + GameStore + Transactional + Migrate
    + Send + Sync
{}

impl<T> HubStore for T
where
    T: AuthStore + UserStore + ChannelStore + MessageStore + RoleStore
     + InviteStore + ModerationStore + SettingsStore + BotStore + DmStore
     + FederationStore + PollStore + GameStore + Transactional + Migrate
     + Send + Sync
{}
```

`AppState.db: SqlitePool` becomes `AppState.store: Arc<dyn HubStore>`.
The SQLite-specific in-memory caches and broadcast channels on `AppState`
are unaffected — they are not database state. Handlers go from
`&state.db` + raw SQL to `state.store.page_messages(...)`. The
`permissions::user_permissions(&state.db, ...)` helper becomes
`state.store.user_permissions(...)`.

A single `From<StoreError> for (StatusCode, String)` in the hub replaces
the hand-rolled `.map_err(...)` and `"UNIQUE"` string-sniffing across every
route.

---

## 5. Async-trait strategy

Native `async fn` in traits is stable (Rust 1.75) but does **not** yet
support `dyn` dispatch without boxing the returned future — and we need
`Arc<dyn HubStore>`. The `async-trait` crate desugars each `async fn` into a
method returning `Pin<Box<dyn Future + Send>>`, which works cleanly behind
`Arc<dyn>` / `Box<dyn>`. We accept one heap allocation per call — negligible
against a DB round-trip. Annotate every trait and impl with `#[async_trait]`.
Revisit if/when native `dyn async fn` lands.

---

## 6. Transaction handling

A `with_transaction` closure scopes a unit of work; the backend begins, runs
the closure against a transaction-bound store handle, then commits on `Ok`
and rolls back on `Err`:

```rust
#[async_trait]
pub trait Transactional: Send + Sync {
    async fn with_transaction<F, T>(&self, f: F) -> Result<T, StoreError>
    where
        F: for<'tx> FnOnce(&'tx dyn HubStore) -> BoxFuture<'tx, Result<T, StoreError>> + Send,
        T: Send;
}
```

**Tradeoff.** The closure receives `&'tx dyn HubStore`, binding the
transaction lifetime into every future it creates. This works for linear
scopes ("insert message, then bump reply_count") but gets awkward when a
caller wants to hold intermediate results across `.await`s or branch — the
borrow checker fights the `for<'tx>` HRTB.

The alternative is an explicit `Transaction` object with `begin` /
`commit` / `rollback` and its own method set. Rejected: it doubles the
trait surface (every method needs a transaction-aware twin), and
"what is a transaction handle" differs enough across SQLite
(`&mut Connection`) and Postgres (a pooled `Transaction<'c>`) that
abstracting the object leaks backend types. The closure form keeps the
transaction type private to the backend. See open question 4 for the
composition limits this imposes.

---

## 7. Error type

```rust
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),        // duplicate key / unique violation
    #[error("permission denied")]
    PermissionDenied,
    #[error("internal: {0}")]
    Internal(String),        // catch-all — wraps any backend error
}
```

Each backend maps its native error type into this. Route handlers map
`StoreError` to HTTP: `NotFound` → 404, `Conflict` → 409,
`PermissionDenied` → 403, `Internal` → 500.

---

## 8. Migration contract

Each backend crate owns its schema. The trait exposes:

```rust
#[async_trait]
pub trait Migrate: Send + Sync {
    async fn run_migrations(&self) -> Result<(), StoreError>;
}
```

The hub binary calls `store.run_migrations().await?` at startup — identical
for any backend. The SQLite impl keeps the current `hub/src/db/migrations.rs`
DDL (FTS5 virtual tables and triggers included). The Postgres impl ships
separate `tsvector`-based DDL. The hub never sees the schema text.

---

## 9. Open questions

1. **Full-text search.** SQLite uses FTS5 virtual tables + sync triggers;
   Postgres uses `tsvector` + GIN. These don't share a query shape. Options:
   put search behind an *optional* `SearchStore` trait that the combined bound
   does not require (so a minimal backend skips it and the hub degrades to
   `LIKE`), or keep search SQLite-only for v1 and gate the routes. Undecided.

2. **Notification / pub-sub.** The current design assumes in-process fanout
   via `chat_tx: broadcast::Sender` in `AppState`. A multi-process Postgres
   deployment would need `LISTEN/NOTIFY` to fan out across hub instances. How
   a `NotifyStore` trait composes with the in-memory `broadcast::Sender` is
   unresolved. Out of scope for v1 (single-process only).

3. **Test strategy.** Each backend needs integration tests against a real
   engine. A shared `wavvon-store-testsuite` crate of conformance tests that
   each backend runs against its own engine would keep behaviour aligned — but
   needs design. CI: SQLite runs anywhere; Postgres needs a service container.

4. **Atomic multi-table composition.** Callers needing several trait methods
   in one transaction must call them through `with_transaction`'s
   `&dyn HubStore`. The closure form prevents the transaction type from
   leaking, but makes multi-step flows with intermediate branching awkward.
   We must identify which handler flows are transactional, document them, and
   keep them inside the closure. Callers that try to compose transactions
   across multiple `with_transaction` calls will silently lose atomicity.

---

## 10. Migration path from today

No flag-day rewrite. Four steps, each leaving the hub compiling and green:

1. **Create `wavvon-store`** with traits, `StoreError`, and row structs.
   No implementation. Nothing depends on it yet.

2. **Create `wavvon-store-sqlite`**, moving the current `sqlx::query*`
   bodies out of the routes and behind trait impls one domain at a time.
   The hub still works — it is a pure refactor, functionally identical.

3. **Update the hub** to hold `Arc<dyn HubStore>` in `AppState` instead of
   `SqlitePool`, and rewrite handlers to call store methods. Replace the
   ad-hoc `.map_err` and string-sniffing with the `StoreError` mapping.

4. **`wavvon-store-postgres`** arrives independently as a community
   contribution, selected by config (`database_url = "postgresql://..."`
   in `hub.toml`). No hub change required.

---

## Cross-references

- `hub/src/state.rs` — `AppState`, the `db` field that becomes `store`
- `hub/src/db/migrations.rs` — current SQLite schema; becomes the SQLite backend's migrations
- `hub/src/routes/*.rs` — the handlers being refactored
- [data-model.md](data-model.md) — table-by-table schema map
- [decisions.md](decisions.md) — rationale log
