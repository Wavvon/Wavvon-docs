# Hub admin tooling — Archived

> **Superseded: the hub web admin panel (`/admin/panel`) was removed.**
> Hub management belongs in the desktop client; hub ownership is set at
> hub-creation time through the client wizard. See
> [decisions.md](decisions.md) ("Hub admin panel removed — hub
> management moves to desktop client") and
> [admin-panel-auth.md](admin-panel-auth.md) (also archived). The
> `wavvon-hub admin` CLI and the farm console survive this removal;
> this doc is kept for the historical design of all three surfaces.

Three operator-facing administration surfaces, all sitting on top of
the admin functions a hub already exposes. None of them is a new source
of truth — they are skins over existing per-hub state plus, for the farm
console, a thin new heartbeat channel.

The three surfaces answer three different operator situations:

| Surface            | Who           | When                                      | Auth                         |
|--------------------|---------------|-------------------------------------------|------------------------------|
| Web admin panel    | hub operator  | "manage my hub from a browser, no client" | bearer admin token           |
| Admin CLI          | hub operator  | "script it / fix it offline"              | local DB / filesystem access |
| Farm console       | farm operator | "one pane across all my hubs"             | farm session (keypair)       |

The web panel and CLI are **hub-axis** tools — they manage one
community's state ([`home-hub.md`](home-hub.md)'s place axis). The farm
console is a **farm-axis** tool — it manages the hosting layer
([`farm-model.md`](farm-model.md)). The two axes never share a credential.

---

## Feature 1: Hub web admin panel

> **Superseded (auth only)**: the `web_admin_token` bearer login below is
> replaced by desktop-app Ed25519 signing + TOTP 2FA in
> [`admin-panel-auth.md`](admin-panel-auth.md). The panel sections and
> data endpoints in this Feature stay; only the auth wrapper changes. The
> token and `check_admin_token` are removed when that ships.

A standalone page served at `{hub-url}/admin`, gated by an admin token
rather than a user keypair. For operators who want to run their hub from
a browser without an active user session.

### Decision

`GET /admin/panel` returns a single self-contained HTML page (a
lightweight React or vanilla-JS app) embedded in or bundled with the
hub binary. The page drives the **existing** admin REST API using a
bearer token — no new admin business logic, only a UI skin over routes
the hub already serves.

Auth is a `web_admin_token`: a random 32-byte hex value generated on
first hub startup, stored in `hub_settings`, and printed **once** to the
startup log:

```
Hub admin panel: http://0.0.0.0:3000/admin  Token: <token>
```

The operator copies it to a password manager. Every admin API call from
the panel carries `Authorization: Bearer <admin_token>`. This token is
entirely separate from user session tokens, so a compromised user
session never grants admin-panel access, and admin access needs no
keypair, no challenge-response, no membership.

### Panel sections

Each section is a thin caller of an existing route family:

- **Overview** — online users, active voice/video sessions, messages
  today, storage used, uptime. Backed by a new `GET /admin/stats`
  (cheap aggregate query) or the `/metrics` endpoint when that wishlist
  item ships.
- **Users** — searchable member table (pubkey, display name, join date,
  role badges, status) with ban / mute / kick / timeout / role
  assignment; filter by role, status, join date. Existing moderation
  routes.
- **Channels** — list with visibility, message count, last activity;
  create / delete / reorder; set `retention_days`. Existing channel
  routes.
- **Moderation** — pending content reports (the content-reporting
  wishlist item), active bans, federated ban-list subscriptions.
- **Bots & webhooks** — installed bots, token create/revoke, moderation
  webhook URL. See [`bots.md`](bots.md).
- **Federation** — peers, alliance memberships, pending badge offers,
  issued certs. See [`federation.md`](federation.md),
  [`alliances.md`](alliances.md).
- **Settings** — hub name, icon, description, min PoW level, approval
  mode, invite-only, moderation webhook, and **admin-token rotation**.
- **Audit log** — filterable by event type, user, date range.
- **Backup / restore** — trigger a backup and download the archive;
  upload an archive to restore (requires a hub restart, so the UI shows
  a confirmation and the restart instruction rather than pretending to
  do it live).

### Security

- The token is **not** a user credential and is stored only in
  `hub_settings`; it is shown once and never re-displayed (rotation
  issues a new one).
- The panel is **localhost-only by default**. An operator who wants to
  reach it from elsewhere sets `WEB_ADMIN_ALLOWED_ORIGINS` to an
  explicit allow-list; CORS rejects everything else. This keeps the
  default-deploy posture safe (a hub on a public IP doesn't accidentally
  expose `/admin` to the internet).
- Token rotation (`Settings → rotate`, or the CLI command below)
  invalidates the old token immediately.

### Alternatives considered

- **Make the desktop client's Hub Admin page the only admin surface.**
  Rejected as the *sole* surface: it requires being logged in with an
  admin user keypair. An operator may need to administer the hub with no
  user session at all — during first-time setup, or while
  troubleshooting an auth problem that prevents login. The web panel
  fills exactly that gap. The desktop Hub Admin page stays; it is the
  member-facing admin experience, the web panel is the operator-facing
  one.
- **A separate admin microservice.** Rejected — a second process to
  deploy, supervise, and secure for no benefit. One route on the hub
  binary is simpler and shares the hub's DB connection directly.

### What changes on the implementation side

- *Hub* (Wavvon-server): `GET /admin/panel` serving the embedded HTML;
  `GET /admin/stats` aggregate endpoint; `web_admin_token` row in
  `hub_settings` generated on first start and logged once; a
  bearer-token guard distinct from the user-session middleware; a
  `WEB_ADMIN_ALLOWED_ORIGINS` env var feeding the CORS layer; a
  token-rotation route. All other panel data uses existing admin routes.
- *Client* (Wavvon-desktop): none. The panel is served by the hub and
  rendered in a browser, not the Tauri client.

---

## Feature 2: Hub admin CLI

Subcommands on the existing `wavvon-hub` binary for shell-scriptable,
offline administration. Operates **directly on the local SQLite DB** —
no HTTP, no running hub process required.

### Decision

A `wavvon-hub admin <subcommand>` tree that opens the hub's SQLite DB
directly. The DB path resolves from `DATABASE_URL`, defaulting to
`hub.db`. Read commands query; write commands run inside a transaction.
Because it touches the DB and not the network, it works while the hub is
stopped — the right mode for bulk fixes and offline maintenance.

Subcommands mirror the web-panel sections:

```
wavvon-hub admin stats                         # JSON of current hub stats
wavvon-hub admin users list [--role R] [--limit N]
wavvon-hub admin users ban <master_pubkey> [--reason "..."]
wavvon-hub admin users unban <master_pubkey>
wavvon-hub admin channels list
wavvon-hub admin channels create <name> [--category <parent_id>]
wavvon-hub admin tokens list                   # active session + bot tokens
wavvon-hub admin tokens revoke <token_prefix>  # revoke by first 8 chars
wavvon-hub admin backup [--out <path>]
wavvon-hub admin restore <path>
wavvon-hub admin rotate-admin-token            # new web-panel token
```

Output is **JSON by default** (pipe-friendly, feeds `jq` and scripts);
`--text` switches to human-readable tables.

### Notes that matter for implementers

- `users ban` operates on `master_pubkey` to match the master+subkey
  identity model ([`multi-device.md`](multi-device.md)) — a ban applies
  to the human, not one device's subkey. Legacy single-key users pass
  their single key as the master.
- `tokens revoke <token_prefix>` matches on the first 8 chars so an
  operator copy-pasting from `tokens list` never has to handle the full
  secret. An ambiguous prefix (more than one match) is an error, not a
  silent pick.
- `restore` is the same archive shape the web panel produces and the
  hub-backup wishlist item defines; it requires the hub to be stopped
  (it overwrites `hub.db`), which the offline-by-design CLI enforces
  naturally.

### Alternative considered

- **Admin via the HTTP API driven by a local script.** Rejected as the
  primary path: it needs the hub running and a valid admin credential,
  and every operation pays HTTP + auth overhead. The direct-DB approach
  works offline, runs faster for bulk operations, and is the natural fit
  for a maintenance/recovery tool. The HTTP API still exists (the web
  panel uses it); the CLI is the offline complement, not a replacement.

### What changes on the implementation side

- *Hub* (Wavvon-server): a `clap` subcommand tree on the existing
  `wavvon-hub` binary under an `admin` module; it reuses the hub's DB
  layer (same migrations, same queries where possible) but opens its own
  short-lived `SqlitePool` instead of booting the full `AppState`.
  Backup/restore share the archive format with the web panel.

---

## Feature 3: Farm console

A single pane of glass for an operator running a **farm** (many hubs,
see [`farm-model.md`](farm-model.md)). It is the farm-axis sibling of
the hub web admin panel: it manages the hosting layer and aggregates
across hubs, never the internal community state of any one hub.

> Depends on the farm layer existing. The farm-admin surface is already
> sketched in [`farm-impl.md`](farm-impl.md) Phase 3B (Farm Settings:
> General / Hubs / Users). The console here is that surface plus a
> live-fleet view fed by hub heartbeats.

### Decision

The farm admin (the pubkey in `farms.admin_pubkey`) authenticates to
`GET /farm/admin/console` on the **farm** server using their normal
keypair-based farm session — the same credential as
`farm-impl.md` Phase 3's admin endpoints. No new auth model: the farm
admin already proves identity with a farm token whose `sub` matches
`admin_pubkey`. The console is the UI that hangs off those endpoints.

### Console sections

- **Hub fleet** — every hub on the farm: name, pubkey, URL,
  online/offline, member count, storage used. Liveness comes from the
  heartbeat channel below, not from the console polling each hub.
- **User management (farm-axis)** — search users by master pubkey across
  all farm hubs; see which hubs they're on, their per-hub roles, recent
  activity. **Farm-level ban**: ban a user from *all* hubs on the farm
  at once by writing to each hub's `bans` table through the farm→hub
  API.
- **Farm ban propagation** — when one hub bans a user, optionally
  propagate that ban to the other hubs on the farm: with farm-admin
  approval by default, or automatically for severity-flagged violations.
- **Games** — farm-level game installs, enable/disable per hub. See
  [`gaming.md`](gaming.md).
- **Missions / sparks** (when `MISSIONS_ENABLED`) — view spark balances,
  flag anomalies. See [`missions.md`](missions.md).
- **Resource overview** — aggregate storage, message volume, user count
  across the fleet.

### Hub heartbeat

Each hub sends `POST /farm/heartbeat` every 60 seconds carrying its
current stats:

```json
{ "online_users": 12, "storage_bytes": 90431488, "uptime_seconds": 84211 }
```

The farm stores the last heartbeat per hub and marks a hub **offline**
after 3 missed beats (~3 minutes). This is a **push** model: hubs report
up to the farm, the console reads farm-stored state. The heartbeat is
authenticated by the hub's own Ed25519 key — the same hub→farm trust
relationship Phase 1 of `farm-impl.md` already establishes for token
verification (the hub knows the farm pubkey; the farm knows each hub's
pubkey from `hubs.hub_pubkey`).

### Where farm vs hub ban lives — axis note

A farm-level ban writes into each target hub's per-community `bans`
table. That respects the two-axis rule
([`home-hub.md`](home-hub.md)): a ban is a *place's* statement that a
user is unwelcome, so it lives on each community hub. The farm console
is a convenience that issues the same per-hub ban to many hubs at once;
it does **not** introduce a new farm-axis ban store. There is
deliberately no single farm-wide "this pubkey is banned" record — that
would put a community-axis decision on the hosting layer. (This matches
`farm-impl.md`'s "there is no `DELETE /farm/users/:pubkey`" stance: the
farm can suspend hubs and revoke sessions, but community membership is
the hub's call.)

### Alternative considered

- **Poll each hub individually from the console UI.** Rejected: the
  console would need each hub's admin token to read its stats, which
  means distributing hub-axis secrets to the farm-axis tool — exactly
  the credential mixing the whole design avoids. The hub→farm trust
  relationship (hubs already authenticate to the farm) makes a hub→farm
  **push** cleaner: the hub signs its heartbeat with the key the farm
  already trusts, and no admin token leaves the hub.

### What changes on the implementation side

- *Farm* (Wavvon-server, `farm/` crate): new
  `POST /farm/heartbeat` route in `farm/src/routes/` (verifies the hub's
  Ed25519 signature against `hubs.hub_pubkey`, upserts a
  `hub_heartbeats` row); `GET /farm/admin/console` serving the console
  data (or the data endpoints the desktop Farm Settings view consumes);
  the farm-level ban + ban-propagation endpoints that fan out to each
  hub's existing ban route.
- *Hub* (Wavvon-server, `hub/` crate): a 60-second background task that
  POSTs `/farm/heartbeat` when `WAVVON_FARM_URL` is set; a route that
  accepts farm-issued ban writes (an authenticated farm→hub call) if not
  already covered by the existing admin ban route.
- *Client* (Wavvon-desktop): the Farm console UI lives in the Phase 3B
  Farm Settings view (`farm-impl.md`) — adds the live Hub Fleet panel
  (heartbeat-driven status), the cross-hub user search, and the
  ban-propagation approval UI. Web/Android mirror.

---

## What's deferred

- **Web-panel live push** — the Overview section polls; a WS live feed
  for stats is a later refinement, not v1.
- **Multiple web-admin tokens / per-operator scoping** — v1 is a single
  shared token. Per-operator admin tokens with role scopes wait until
  there's a real multi-operator hub demanding it.
- **CLI write commands beyond the listed set** — channel edit, role
  CRUD, settings mutation from the CLI are deferred; the web panel
  covers them and the CLI's first job is stats + moderation + backup.
- **Farm-wide ban store** — explicitly *not* built (axis rule above);
  fan-out per-hub bans cover the need. A true farm-axis ban is a
  `farm-model.md` Phase 4+ question.
- **Auto ban-propagation severity classifier** — the propagation channel
  ships; the automatic-for-severe path needs a severity taxonomy that
  the content-reporting / moderation work owns first.
- **Heartbeat-driven autoscaling / alerting** — the farm stores liveness;
  acting on it (restart a dead hub, page the operator) is ops tooling
  outside this doc.

## Cross-references

- [`farm-model.md`](farm-model.md) — the farm layer the console manages
- [`farm-impl.md`](farm-impl.md) — Phase 3 farm-admin endpoints the
  console builds on; hub→farm trust the heartbeat reuses
- [`home-hub.md`](home-hub.md) — the two-axis rule (why bans stay on hubs)
- [`multi-device.md`](multi-device.md) — master+subkey (why CLI bans key
  on master pubkey)
- [`bots.md`](bots.md) — bot/webhook management surfaced in the panel
- [`decisions.md`](decisions.md) — new top entry for the
  separate-admin-credential decision
