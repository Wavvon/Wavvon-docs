# Hosting a Hub

The practical guide to **deploying** a Wavvon hub (the `hub/` crate in
Wavvon-server) as a real service. This doc is organized by deployment
*method* — pick one, follow it end to end. For *operating* a running hub
(config reference, ownership, backups, admin CLI, monitoring) see the
[hub-operator-guide.md](hub-operator-guide.md). For architecture, see
[architecture.md](architecture.md); for the threat model,
[threat-model.md](threat-model.md).

A hub is one process. It optionally **serves the browser client** from
its own URL (see [the web-client section](#serving-the-web-client)), so
many operators only ever run "the hub" and get both the API and a
ready-to-use web client from one container or binary.

## Which method should I pick?

| Method | Best for | TLS | Web client | Effort |
|---|---|---|---|---|
| [1. Docker Compose + Caddy](#1-docker-compose--caddy-quick-start) | A fresh box, you own the domain | Caddy auto-Let's-Encrypt | Baked in, served at `/` | Lowest |
| [2. Docker behind existing proxy](#2-docker-behind-an-existing-reverse-proxy) | Hub shares a box that already runs nginx/Apache for other sites | Existing proxy + wildcard cert | Baked in, served at `/` | Low |
| [3. Bare binary + systemd](#3-bare-binary--systemd) | No Docker; a long-lived native service | Hub or a proxy | Optional, download a dist | Medium |
| [4. Build from source](#4-build-from-source) | Custom builds, contributors, unsupported arch | Hub or a proxy | Build the dist yourself | Highest |

All four end with the same running hub. Methods 1 and 2 use the official
image, which **bakes a version-matched web client in** — visit
`https://your-hub/` and the client is already there. Methods 3 and 4
serve API-only by default; opt into the web client explicitly.

## What you need (any method)

- A Linux server with a public IP (or behind a reverse proxy with one).
- A domain name pointing at the server (A/AAAA record to the IP).
- Two open ports: HTTP/WS (default **3000**) and voice UDP (default
  **3001**). Voice UDP must be reachable directly — it never passes
  through an HTTP proxy.
- TLS — terminated at the hub or at a reverse proxy. Browser clients
  served over HTTPS cannot connect to a plain-`http://` hub.
- Disk for SQLite + inline attachments. Community-scale is modest; the DB
  grows with message count and inline attachments (each capped at 3 MB).

The hub's whole state is two files in its working directory: `hub.db`
(SQLite) and `hub_identity.json` (the hub's Ed25519 federation key).

> **Critical**: `hub_identity.json` *is* the hub's identity — whoever
> holds it can impersonate the hub to federation peers. Back it up
> off-box and restrict it to the running user. Lose it without a backup
> and the hub comes back as a *different* hub: alliance memberships break
> until peers re-add it under the new key.

---

## 1. Docker Compose + Caddy (quick start)

The fastest path on a fresh box you control. Caddy fronts the hub,
auto-provisions Let's Encrypt, and the official image serves the baked-in
web client. After this, **visit `https://your-hub/` and the web client is
already there** — send the link to a friend and they're in, no install.

**Firewall / cloud security group** — open before launching:

- **443/TCP** (HTTPS via Caddy)
- **80/TCP** (Let's Encrypt HTTP-01 challenge)
- **3001/UDP** (voice — cloud firewalls block UDP by default; voice fails
  silently if you forget this)
- 22/TCP for your own SSH

`docker-compose.yml`:

```yaml
services:
  hub:
    image: ghcr.io/wavvon/hub:latest
    restart: unless-stopped
    environment:
      WAVVON_OWNER_PUBKEY: "<your-64-hex-pubkey>"  # set before first boot
      # WAVVON_CORS_ORIGINS defaults to * — correct for a public hub
      # WAVVON_WEB_CLIENT_DIR defaults to /web-client in the image — leave it
    volumes:
      - hub-data:/data
    ports:
      - "3001:3001/udp"   # voice straight to the hub
    expose:
      - "3000"            # HTTP reachable only via Caddy

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data

volumes:
  hub-data:
  caddy-data:
```

`Caddyfile` (Caddy handles HTTPS and WebSocket upgrades automatically):

```
your-hub.example {
    reverse_proxy hub:3000
}
```

Launch and verify:

```bash
docker compose up -d
docker compose exec hub /wavvon-hub --doctor   # expect PASS lines
curl https://your-hub.example/health           # {"status":"ok",...}
curl https://your-hub.example/info             # hub identity JSON
```

Then open `https://your-hub.example/` in a browser — the served web
client loads and defaults its first connection to this hub.

Get your owner pubkey from the desktop client's **Settings → Identity**
(64 hex chars). Set `WAVVON_OWNER_PUBKEY` before first boot, or assign it
later without a restart:
`docker compose exec hub /wavvon-hub admin users set-owner <pubkey>`.
Ownership detail lives in the [operator guide](hub-operator-guide.md#hub-ownership).

> **Note (known issue, 2026-06):** on a fresh hub the *first* user to
> join can silently become owner before you assign one. Set
> `WAVVON_OWNER_PUBKEY` and join first, or keep the hub closed until
> ownership is assigned. Tracked in ROADMAP.

---

## 2. Docker behind an existing reverse proxy

For a box that already runs nginx (or Apache/Traefik) for other sites and
has a wildcard certificate. The hub binds HTTP to **loopback only**; the
existing proxy terminates TLS and forwards to it. Voice UDP is published
publicly and bypasses the proxy. This is the videogamezone pilot pattern,
deployed and verified on a shared OVH box (2026-06-12).

**Firewall**: the proxy already owns 80/443. You only need to open
**3001/UDP** (in `ufw` *and* any cloud-panel firewall). No public 3000.

`docker-compose.yml` (lives in an unprivileged user's home, e.g.
`~/wavvon/`):

```yaml
services:
  hub:
    image: ghcr.io/wavvon/hub:latest
    container_name: wavvon-hub
    restart: unless-stopped
    environment:
      WAVVON_OWNER_PUBKEY: "<your-64-hex-pubkey>"
      WAVVON_LOG_FORMAT: "text"
      # REQUIRED behind a proxy — see the warning below.
      WAVVON_TRUSTED_PROXY: "true"
    volumes:
      - hub-data:/data
    ports:
      # HTTP/WS on loopback only — the proxy terminates TLS and forwards here.
      # Never publish 3000 to the public interface (plain HTTP; HSTS is on).
      - "127.0.0.1:3000:3000"
      - "3001:3001/udp"   # voice — must be publicly reachable
volumes:
  hub-data:
```

> **`WAVVON_TRUSTED_PROXY=true` is not optional here.** Without it the
> rate limiter sees every request as coming from the proxy's single IP,
> so all clients share one auth bucket and a few bad logins lock out the
> *entire* hub. With it set, the limiter reads the real client IP from
> the last `X-Forwarded-For` entry — which means the proxy **must** send
> `X-Forwarded-For` (the vhost below does). See
> [the operator guide](hub-operator-guide.md#basic-hardening-checklist).

nginx vhost (`/etc/nginx/sites-available/your-hub`, symlinked into
`sites-enabled/`). The `Upgrade`/`Connection` headers and the long
timeouts are load-bearing — WebSocket sessions are long-lived and the
default 60 s read timeout would cut them off:

```nginx
server {
    listen 80;
    server_name your-hub.example;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-hub.example;

    # Reuse the box's existing wildcard cert — no separate cert for the hub.
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=63072000" always;
    client_max_body_size 10M;   # inline attachments are capped at 3 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;          # WebSocket upgrade
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 1h;   # long-lived WS — default 60s would drop it
        proxy_send_timeout 1h;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/your-hub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx   # ALWAYS test before reload
cd ~/wavvon && docker compose up -d
docker compose exec hub /wavvon-hub --doctor
curl -s https://your-hub.example/health
```

> **Wildcard-cert reuse**: a subdomain like `wavvon.example.com` is
> already covered by a `*.example.com` cert — point the vhost at the
> existing PEM files; no new certificate is needed.

> **Voice bypasses the proxy entirely.** nginx only handles the HTTP/WS
> upstream. Voice is UDP straight to the published container port 3001 —
> it does not pass through nginx, so the proxy config has nothing to do
> with whether voice works. Open 3001/UDP at the firewall or voice is
> silent with no error.

The baked-in web client is served at `/` here too, over the proxy's TLS —
`https://your-hub.example/` loads the client.

---

## 3. Bare binary + systemd

No Docker. Run the released `wavvon-hub` binary as a native systemd
service. Currently the published release binary is **Linux x86_64**
(an aarch64 binary build is a known-broken item in ROADMAP; on aarch64
use Docker or build from source).

**Install** from a GitHub release:

```bash
# Download wavvon-hub-linux-x86_64 from the Wavvon-server releases page,
# then:
sudo install -o root -g root -m 755 wavvon-hub-linux-x86_64 \
  /usr/local/bin/wavvon-hub
wavvon-hub --version
```

The cargo target is named `hub`; the install examples here keep the
on-disk name `wavvon-hub` for clarity.

**systemd unit** — `/etc/systemd/system/wavvon-hub.service`:

```ini
[Unit]
Description=Wavvon hub server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=wavvon
Group=wavvon
WorkingDirectory=/var/lib/wavvon
ExecStart=/usr/local/bin/wavvon-hub
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/wavvon
PrivateTmp=true

# Configuration (see the operator guide for the full env reference)
Environment=WAVVON_HTTP_PORT=3000
Environment=WAVVON_VOICE_UDP_PORT=3001
# TLS at the hub — omit these if a reverse proxy terminates TLS instead:
Environment=WAVVON_TLS_CERT=/etc/letsencrypt/live/hub.example/fullchain.pem
Environment=WAVVON_TLS_KEY=/etc/letsencrypt/live/hub.example/privkey.pem
# Optional: serve the web client (see "Serving the web client" below)
# Environment=WAVVON_WEB_CLIENT_DIR=/var/lib/wavvon/web-client

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /var/lib/wavvon --shell /usr/sbin/nologin wavvon
sudo mkdir -p /var/lib/wavvon
sudo chown wavvon:wavvon /var/lib/wavvon
sudo systemctl daemon-reload
sudo systemctl enable --now wavvon-hub
sudo systemctl status wavvon-hub
journalctl -u wavvon-hub -f
```

**TLS — two choices**:

1. **Hub terminates TLS** (the env vars above). Point `WAVVON_TLS_CERT` /
   `WAVVON_TLS_KEY` at PEM files; works with Let's Encrypt directly. Give
   the `wavvon` user read access to the cert (a `getcert` group or ACL).
2. **A reverse proxy terminates TLS** — drop the TLS env vars (hub serves
   plain HTTP), and put nginx/Caddy in front exactly as in
   [method 2's vhost](#2-docker-behind-an-existing-reverse-proxy)
   (proxy to `127.0.0.1:3000`, forward WebSocket upgrades, set
   `WAVVON_TRUSTED_PROXY=true`). Voice UDP still hits 3001 directly.

**Optional web client**: download the web-client `dist` from a Wavvon-client
release, unpack it (it must contain `index.html`), and point
`WAVVON_WEB_CLIENT_DIR` at that directory. See
[Serving the web client](#serving-the-web-client).

**Self-update**: `wavvon-hub update` replaces the binary in place from
the latest GitHub release (Linux x86_64 only). Stop the service, run it,
start the service — see [Upgrades](#upgrades-per-method).

---

## 4. Build from source

For contributors, custom builds, or an arch with no published binary.

```bash
git clone https://github.com/wavvon/Wavvon-server wavvon-server
cd wavvon-server
cargo build --release -p wavvon-hub
# Binary lands at target/release/wavvon-hub
sudo install -o root -g root -m 755 \
  target/release/wavvon-hub /usr/local/bin/wavvon-hub
```

From here, run it under [systemd as in method 3](#3-bare-binary--systemd).
TLS, firewall, and web-client options are identical — the only difference
is where the binary came from.

**Building the official Docker image** (bakes the web client in): the
image is a multi-stage build. CI checks out the Wavvon-client monorepo
into `web-client-src/` in the build context, and a `node:22` stage builds
the `apps/web` SPA into `/web-client`:

```bash
# With the web client (Wavvon-client checked out into web-client-src/):
docker build -f hub/Dockerfile -t wavvon-hub:local .

# Without web-client-src/ present, the image still builds, but /web-client
# is EMPTY (no index.html). The image still sets WAVVON_WEB_CLIENT_DIR=
# /web-client, so the hub will refuse to start with a clear error about the
# missing index.html. Run API-only by clearing the var:
docker run -e WAVVON_WEB_CLIENT_DIR= wavvon-hub:local
```

**Build the web-client dist standalone** (for method 3's optional serving):

```bash
git clone https://github.com/wavvon/Wavvon-client && cd Wavvon-client
pnpm install && pnpm --filter web build   # output in apps/web/dist (contains index.html)
```

---

## Serving the web client

A hub can host the browser client from its own origin. When
`WAVVON_WEB_CLIENT_DIR` points at a directory containing a built SPA
(`index.html` + assets), the hub serves it at `/`:

- Unmatched paths sent with `Accept: text/html` get `index.html`, so SPA
  deep links work.
- Unmatched paths *without* `Accept: text/html` get a plain 404, so REST
  error semantics are preserved.
- The served `index.html` is rewritten at startup to default the client's
  first hub connection to its own serving origin; the "type a hub URL"
  flow still works for adding other hubs.

The **official Docker image** (methods 1 and 2) bakes a version-matched
build in and sets `WAVVON_WEB_CLIENT_DIR=/web-client` by default — nothing
to configure. To run the image API-only, set `WAVVON_WEB_CLIENT_DIR=`
(empty).

For **bare-binary / source** installs (methods 3 and 4), serving is opt-in:
point the var at a web-client `dist`. If the var is set but `index.html` is
missing, the hub **exits at startup with a clear error** rather than
serving a broken page — `--doctor` reports the same. Leave the var unset
for API-only. Design rationale: [decisions.md](decisions.md) ("Hubs may
optionally self-serve the web client"); client details:
[browser-client.md](browser-client.md).

---

## --doctor first-aid

`wavvon-hub --doctor` is the first thing to run when something isn't
working. It checks port bindability, TLS file readability and PEM
validity, working-directory write access, and the web-client directory
(when `WAVVON_WEB_CLIENT_DIR` is set), then exits 0 on success or 1 on any
failure. Under Docker: `docker compose exec hub /wavvon-hub --doctor`.

The startup banner logs effective config before serving and warns when
TLS is disabled and that voice UDP must be open in cloud firewalls:

```
wavvon-hub 0.2.0 starting  port=3000 (http)  voice_udp=3001  tls=disabled  cors=*
data files: /data/hub.db  /data/hub_identity.json
WARN  TLS is disabled — browser clients served over HTTPS cannot connect to an http:// hub ...
INFO  Reminder: the voice UDP port 3001 must be open in any cloud firewall ...
```

For the full config reference, run `wavvon-hub --help` (it prints every
`WAVVON_*` var with defaults, generated from the binary) and see the
[operator guide's configuration section](hub-operator-guide.md#configuration).
Don't memorize an env table here — `--help` is authoritative.

---

## Firewall and UDP

- Open **3001/UDP** (or your `WAVVON_VOICE_UDP_PORT`). Cloud providers
  (AWS, GCP, Hetzner, OVH, …) block UDP by default and need an explicit
  security-group / control-panel rule **in addition to** any host
  firewall (`ufw`). Voice fails silently if UDP is closed.
- Voice **bypasses any HTTP reverse proxy** — it is UDP straight to the
  hub port. A working nginx/Caddy config says nothing about whether voice
  works; the UDP firewall rule is the only thing that matters there.
- **Cloudflare**: never put the hub's domain behind Cloudflare's proxy
  (the orange cloud). Cloudflare does not proxy arbitrary UDP, so voice
  breaks entirely, and federation peers see Cloudflare's fingerprint
  instead of the hub's. Use a **grey-cloud / DNS-only** record, or no
  Cloudflare at all, for the hub's hostname.
- Outbound: the hub initiates HTTPS to peer hubs for federation (alliance
  reads, DM delivery). Egress rules must allow it.

---

## Health checks

```bash
curl https://hub.example/health   # {"status":"ok","version":"...","uptime_seconds":...,"db_status":"ok"}
curl https://hub.example/info     # hub name, description, icon, public key
```

Point an uptime monitor (Uptime Kuma, Prometheus blackbox, …) at
`/health`. Prometheus-format metrics are at `GET /metrics` — see the
[operator guide](hub-operator-guide.md#observability).

---

## Backups

State is two files: `hub.db` and `hub_identity.json`, in the working
directory (`/data` in the Docker image; `WorkingDirectory=` for systemd).
Use SQLite's `.backup` (not `cp`) so the snapshot is consistent with the
running hub, and always copy `hub_identity.json` alongside it:

```bash
#!/bin/sh
# nightly cron — bare-binary example
set -e
DEST="/var/backups/wavvon/$(date +%Y%m%d-%H%M)"; mkdir -p "$DEST"
sqlite3 /var/lib/wavvon/hub.db ".backup '$DEST/hub.db'"
cp /var/lib/wavvon/hub_identity.json "$DEST/"
find /var/backups/wavvon -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

Under Docker, run `.backup` inside the container or copy the identity out
of the volume once:

```bash
docker compose exec hub sqlite3 /data/hub.db ".backup '/data/backup.db'"
docker compose cp hub:/data/hub_identity.json ./hub_identity.backup.json
```

The hub also has `wavvon-hub backup` / `restore` subcommands that bundle
both files into one archive. Full backup/restore procedure and the
`hub_identity.json` warning live in the
[operator guide](hub-operator-guide.md#backup-and-restore).

---

## Upgrades (per method)

Migrations run automatically on startup and are additive only (no
down-migrations); take a backup first for a major version.

| Method | Upgrade |
|---|---|
| Docker Compose (1, 2) | `docker compose pull && docker compose up -d` |
| Bare binary (3) | `wavvon-hub update` (self-update), then restart the service; or download the new binary and `install` it over the old one |
| Source (4) | `git pull && cargo build --release -p wavvon-hub`, `install` over the old binary, restart |

To apply migrations explicitly without starting the server (rare):
`wavvon-hub migrate`. Upgrade-path detail:
[operator guide](hub-operator-guide.md#upgrade-path).

---

## What this guide does NOT cover

- **Operating** a running hub — config reference, ownership, admin CLI,
  monitoring, hardening: [hub-operator-guide.md](hub-operator-guide.md).
- **Multi-tenant farm hosting** (many hubs on one server) — out of scope
  here; see [farm-model.md](farm-model.md).
- Auto-scaling / clustering. The hub is single-process by design.
- E2E DM setup ([e2e-encryption.md](e2e-encryption.md)) and bot
  management ([bots.md](bots.md)) — separate docs.
