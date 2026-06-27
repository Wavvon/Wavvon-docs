# Hub Operator Guide

Practical reference for **operating** a Wavvon hub that's already running:
configuration, ownership, backup/restore, upgrades, hardening, and
observability. For how to **deploy** one in the first place (Docker
Compose + Caddy, Docker behind an existing proxy, bare binary + systemd,
build from source — with TLS, firewall, and web-client serving per
method), see [hosting.md](hosting.md). For architecture background, see
[architecture.md](architecture.md) and [threat-model.md](threat-model.md).

---

## Configuration

The hub reads configuration from three sources, in priority order (highest last):

1. **Built-in defaults** — sensible values that work out of the box.
2. **`hub.toml`** — a TOML file in the working directory. Copy `hub.toml.example` (shipped with the binary) and edit it. The file is optional; missing it is fine.
3. **`WAVVON_*` environment variables** — override anything in the file. Useful for Docker / Kubernetes where env injection is the norm.

### hub.toml quick reference

```toml
http_port       = 3000           # HTTP / WebSocket port
voice_udp_port  = 3001           # Voice UDP relay port

# tls_cert = "/etc/wavvon/hub.crt"   # enable HTTPS (both must be set)
# tls_key  = "/etc/wavvon/hub.key"

owner_pubkey    = "<64-hex>"     # hub owner identity (set before first boot)
# farm_url      = "https://farm.example.com"

discovery_url   = "https://discovery.wavvon.io"
# template_url  = "https://example.com/template.json"
# bootstrap_token = ""

log_format      = "text"         # "text" or "json"
# otlp_endpoint = "http://localhost:4317"
```

Every option also has a `WAVVON_<OPTION_NAME>` env var equivalent (e.g. `WAVVON_HTTP_PORT`, `WAVVON_TLS_CERT`). `wavvon-hub --help` prints the full table generated directly from the binary — treat it as authoritative.

The hub binds to `0.0.0.0` on both ports. Data files (`hub.db`, `hub_identity.json`) are written to the process working directory; set `WorkingDirectory=` in your service unit to control where they land.

### CORS

The REST API ships with CORS fully open (`*`) by default. This is safe: every protected endpoint requires a bearer token and there is no cookie-based credential, so there is no CSRF surface. Any origin can read public data or authenticate with its own keypair.

To restrict origins (tightly-controlled deployments only):

```
WAVVON_CORS_ORIGINS=https://app.example.com,https://dashboard.example.com
```

If you restrict origins, add the serving origin of any browser client (including a hub that self-serves the web client) to the list. WebSocket connections (`/ws`) are not subject to CORS.

---

## Hub ownership

On a fresh hub **no owner is set by default**. You must assign one before opening the hub to users, otherwise nobody has admin access.

**Before first boot (recommended):**
```toml
# hub.toml
owner_pubkey = "<your-64-char-ed25519-pubkey>"
```

**After first boot (CLI):**
```bash
wavvon-hub admin users set-owner <pubkey>
```

**After first boot (web panel):**  
Visit `http://your-server:3000/admin/panel` → Ownership tab.  
Activate the panel first: `wavvon-hub admin rotate-admin-token`

Your public key is shown in the desktop client's identity / profile panel.

---

## First-run bootstrap

On an empty database, the hub runs all migrations automatically.

To pre-configure a hub for unattended deployment, set `template_url` in `hub.toml`
(or `WAVVON_TEMPLATE_URL`) to a JSON bootstrap URL and `bootstrap_token`
(or `WAVVON_BOOTSTRAP_TOKEN`) to authenticate against it. The hub fetches
the template on first run and creates channels, roles, and settings from it.
See [hub-creation-wizard.md](hub-creation-wizard.md) for the template schema.

---

## Backup and restore

The entire hub state lives in two files:

| File | Contents | Notes |
|------|----------|-------|
| `hub.db` | All community data (messages, roles, certs, sessions, …) | SQLite; WAL mode. |
| `hub_identity.json` | Hub Ed25519 key pair | **Critical** — back this up off-site. Loss = hub identity loss. |

**Backup procedure** (while hub is running):

```bash
# SQLite hot backup — safe while hub is online
sqlite3 hub.db ".backup /backup/hub-$(date +%F).db"

# Copy the identity file
cp hub_identity.json /backup/hub_identity.json
```

Or stop the hub and copy both files directly.

**Restore procedure**:

1. Stop the hub process.
2. Copy `hub.db` and `hub_identity.json` back to the working directory.
3. Start the hub. It resumes from the backup state.

Also available via the CLI subcommand:

```bash
wavvon-hub backup --out /backup/hub.tar.gz
wavvon-hub restore --from /backup/hub.tar.gz
```

---

## Upgrade path

1. Stop the current hub process.
2. Replace the binary with the new version.
3. Start the hub. New migrations run automatically on startup.

Wavvon uses additive migrations only — there are no destructive schema
changes in minor/patch upgrades. If a migration fails (e.g., disk full),
the hub exits and the database is left untouched.

---

## Basic hardening checklist

- [ ] **TLS**: terminate TLS at the hub (via `WAVVON_TLS_CERT` / `WAVVON_TLS_KEY`)
  or at a reverse proxy (nginx/Caddy). Never expose HTTP to the public internet.
- [ ] **Firewall**: allow only ports 443 (HTTPS) and `WAVVON_VOICE_UDP_PORT`
  (UDP). No SSH from the internet.
- [ ] **Service user**: run the hub as a dedicated non-root user.
  `hub_identity.json` must be readable only by that user (`chmod 600`).
- [ ] **Backups**: schedule daily `sqlite3 hub.db ".backup ..."` + off-site copy
  of `hub_identity.json`.
- [ ] **Auth rate limiting**: the hub limits auth attempts to 10 per IP per
  60-second window automatically. For additional protection, put a WAF in front
  (e.g., Cloudflare, rate-limit at nginx).
- [ ] **Approval gate**: consider enabling *require approval* in Hub Settings
  so new members are vetted before joining a community hub.
- [ ] **PoW level**: set a minimum proof-of-work level (Hub Settings → Auth)
  for open hubs to deter spam registrations.
- [ ] **Monitoring**: `GET /health` returns `{"status":"ok","version":"...","uptime_seconds":...,"db_status":"ok"}`.
  Point your uptime checker at it.

---

## Health check

```
GET /health
```

Returns:

```json
{
  "status": "ok",
  "version": "0.2.0",
  "uptime_seconds": 86400,
  "db_status": "ok"
}
```

`db_status` is `"ok"` when a `SELECT 1` probe against the pool succeeds,
`"error"` otherwise.

---

## Hub admin CLI

```bash
# Create an invitation link (bypasses approval gate)
wavvon-hub admin invite --expires 24h

# Revoke a session by token
wavvon-hub admin revoke-session <token>

# Promote a user to Owner
wavvon-hub admin grant-role <pubkey> builtin-owner

# Key rotation (updates hub_identity.json and publishes /key-rotation)
wavvon-hub rotate-key
```

For the full admin CLI reference, see [hub-admin-panel.md](hub-admin-panel.md).

---

## Observability

Prometheus-compatible metrics are exposed at `GET /metrics` (text format).
Key metrics:

| Metric | What it measures |
|--------|-----------------|
| `hub_active_ws_connections` | WebSocket connections right now |
| `hub_messages_total` | Chat messages sent (counter) |
| `hub_auth_attempts_total` | Auth verifications (labelled `ok`/`failed`) |
| `hub_voice_participants` | UDP voice relay participants right now |
| `hub_db_query_duration_seconds` | SQLite query latency histogram |

Logs are emitted in JSON to stdout (structured, `tracing`-based). Pipe to
`journald`, Loki, or any JSON log aggregator.
