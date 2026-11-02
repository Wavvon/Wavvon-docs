# Packaging & Release

How Wavvon ships to end users on Windows, Linux and macOS, and how the hub
server is distributed to operators. The Tauri 2 bundler does the heavy
lifting; this doc captures what surrounds it — signing, updates, CI, and
the secrets matrix.

macOS builds (`.dmg`) are produced but **not signed or notarized** — the
Apple Developer Program ($99/year) is a barrier for a zero-income
open-source project. The browser client has shipped
([browser-client.md](browser-client.md)); desktop and web live in the
Wavvon-clients monorepo. The Android client was removed 2026-07-12 and
never shipped an APK ([android-client.md](android-client.md)).

---

## 1. Target platforms and formats

Tauri 2's bundler produces these via `tauri build`. No custom packaging scripts.

| Platform | Primary format | Secondary | Notes |
|---|---|---|---|
| Windows | `.exe` (NSIS) | `.msi` (WiX) | NSIS gives a friendlier installer UX |
| Linux | `.AppImage` | `.deb` | AppImage works on every distro without installation |
| macOS | `.dmg` | `.app.tar.gz` (updater) | Unsigned; Gatekeeper warns until a Developer ID is affordable |

**Android** — none. A Tauri Android shell existed until 2026-07-12 but no
APK was ever released; see [android-client.md](android-client.md).

**Browser client** — shipped. The React frontend runs as a web app with
Tauri `invoke` calls replaced by direct HTTP/WebSocket calls to the hub,
and voice over WebTransport. See [browser-client.md](browser-client.md).

---

## 2. Code signing

Two tiers: **dev builds** ship unsigned (CI artifact, devs and early
testers click through OS warnings); **release builds** carry the updater
payload signature so the auto-updater can verify downloads.

### Windows — Authenticode (EV certificate)

- **Updater signature**: `TAURI_SIGNING_PRIVATE_KEY` (Ed25519) signs the
  update payload — unchanged.
- **Authenticode**: deferred — blocked until the project has meaningful
  popularity. When it lands: EV certificate via a CI-friendly cloud signing
  service. EV removes the SmartScreen warning permanently from day 1 — no
  reputation accumulation period.
  Full design and status in [`code-signing.md`](code-signing.md).
- **Cert rotation**: on renewal, update `WINDOWS_CERT_THUMBPRINT` in
  GitHub Actions secrets and the `bundle.windows.certificateThumbprint` in
  `tauri.conf.json`. All prior timestamped releases remain valid — no
  re-release needed.

### macOS — unsigned

Apple Developer Program ($99/year) is out of reach for a zero-income
open-source solo project, so the released `.dmg` is unsigned and
un-notarized. Revisit when the project gains sponsorship.

### Linux — optional GPG

No mandatory signing. We may GPG-sign the AppImage for users who want to
verify. Distro packages (PPA, COPR) are out of scope for now.

---

## 3. Auto-update (`tauri-plugin-updater`)

### Wire-up

- `tauri-plugin-updater` is registered in `tauri.conf.json` under
  `plugins.updater`.
- Endpoint: a `latest.json` asset on the GitHub Releases "latest"
  download URL, assembled by `release-desktop.yml`. (The original plan was
  `https://releases.wavvon.io/latest.json`; never set up.)

### Update manifest shape

Tauri 2 updater JSON, served from the endpoint:

```
{
  "version": "0.2.0",
  "notes": "...",
  "pub_date": "2026-06-01T12:00:00Z",
  "platforms": {
    "windows-x86_64": { "url": "...", "signature": "..." },
    "linux-x86_64":   { "url": "...", "signature": "..." },
    "darwin-...":     { "url": "...", "signature": "..." }
  }
}
```

### Update signing key

- Separate Ed25519 keypair, generated via `tauri signer generate`.
- **Private key** → CI secret (`TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- **Public key** → embedded in `tauri.conf.json` at
  `plugins.updater.pubkey`. Rotating it requires shipping a release; we
  treat the keypair as long-lived.

### UX

- Check on startup, non-blocking.
- Toast on available update: "Wavvon v0.x.y is available — restart to
  update."
- Silent background download. Apply on next restart. No forced
  interruptions.

---

## 4. GitHub Actions CI/CD

**Describe their structure; do not write the YAML here.** The workflow
files in Wavvon-clients `.github/workflows/` are authoritative; this
section is the shape.

Each repo carries its own workflows. The client ones live in the
Wavvon-clients monorepo: `build.yml` and `rust.yml` for PRs,
`release-desktop.yml` and `release-web.yml` on a version tag (set by
`auto-tag.yml` when a release PR merges to `main`).

### `release-desktop.yml` — on `v*` tag

| Step | Notes |
|---|---|
| Matrix | `windows-latest`, `macos-latest`, `ubuntu-22.04` |
| Checkout | shallow, with tags |
| Setup Node | LTS (currently 20.x) |
| Setup Rust | stable; on macOS add both `x86_64-apple-darwin` and `aarch64-apple-darwin` targets |
| Install `tauri-cli` | `cargo install tauri-cli --version "^2"` |
| Build | `tauri build`; macOS uses `--target universal-apple-darwin` |
| Upload | Attach artifacts to the GitHub Release for the tag |

### `build.yml` — on PR and push to `main`

| Step | Notes |
|---|---|
| Matrix | `windows-latest`, `ubuntu-22.04` |
| Setup Rust + Node | as above, no Tauri targets needed |
| Validate | `cargo check --workspace` + `tsc --noEmit` across `apps/*` (Wavvon-client) |
| No bundling | No installers, no signing — fast PR feedback |

### Secrets matrix

| Secret | Used by | Required for |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Windows + Linux | Updater payload signature |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Windows + Linux | Updater key passphrase (omit if key has no password) |
| `WINDOWS_CERT_THUMBPRINT` | Windows | EV Authenticode cert SHA-1 thumbprint |
| `SIGNING_HSM_CREDENTIALS` | Windows | Cloud HSM auth material for the CSP/KSP (unused until signing lands) |

macOS notarization secrets are not used today.

---

## 5. Hub server distribution

The hub (`crates/hub` in Wavvon-server) is a separate Rust binary
with its own release shape — no Tauri, no Tauri updater. Two artifacts per
release, produced by Wavvon-server's own CI:

### Docker image

- `crates/hub/Dockerfile` in Wavvon-server: multi-stage build.
  - `web-builder` (`node:22-slim`) builds the hub build of the web client
    (`apps/web/dist-hub`) when the clients checkout is in the context.
  - `rust:1-slim-trixie` builds the binary.
  - `debian:trixie-slim` runs it, with `postgresql-client` (backup/restore)
    and `libxml2` (bundled PostgreSQL), as uid 10001. Builder and runtime
    are pinned to the same Debian release so glibc matches. (The original
    plan was distroless; it cannot carry `pg_dump` or the bundled
    database.)
- Exposes port `3000` (HTTP/WS) and `3001/udp` (WebTransport voice).
- Pushed to `ghcr.io/wavvon/hub:<version>` and `:latest` on tag.

### Static binary

- `cargo build --release --target x86_64-unknown-linux-musl` for a
  portable single-file binary. Drops into `/usr/local/bin/wavvon-hub` on
  any Linux distro. Caveat: bundled PostgreSQL does not work on musl, so a
  musl binary needs an external database (`WAVVON_DATABASE_URL`).

### Environment

Every key is `WAVVON_*` and the authoritative table is
`wavvon-hub --help`, generated from the binary itself — see
[hub-operator-guide.md](hub-operator-guide.md). The four this page used to
list by hand (`DATABASE_URL`, `BIND_ADDR`, `HUB_IDENTITY_PATH`,
`VOICE_UDP_PORT`) were names the hub has never read; the real ones are
`WAVVON_DATABASE_URL`, `WAVVON_HTTP_PORT` and `WAVVON_VOICE_UDP_PORT`, and
`hub_identity.json` is written to the process working directory rather than
configured.

### Docker Compose for self-hosters

The release ships a sample `docker-compose.yml` that runs the hub
image, mounts a volume for the data directory + identity, maps ports 3000
(TCP) and 3001 (UDP), and wires the env vars above. The hub bundles its own
PostgreSQL and manages it when `WAVVON_DATABASE_URL` is unset, so the volume
holds a data directory rather than a single file. Operators who want
TLS terminate it in a reverse proxy (Caddy / nginx); see `hosting.md`.

---

## 6. Versioning

- **Semver**. `v0.x.y` until the wire protocol stabilises.
- **Each repo tags independently**. Wavvon-server, Wavvon-clients (one
  version for desktop and web together), and Wavvon-discovery each
  carry their own version. Wire-compat is the contract; the openapi.yaml
  in the docs repo is the authoritative shape. Mismatched client/hub
  versions are an operator concern only when wire-compat is broken.
- **`CHANGELOG.md`** at repo root, [Keep a Changelog](https://keepachangelog.com/)
  format. Sections: Added / Changed / Deprecated / Removed / Fixed /
  Security.
- **Minor bump on breaking wire protocol changes** (between major-zero
  releases this is our breaking-change signal). Patch bumps are
  protocol-compatible.

---

## 7. `tauri.conf.json`

Done: `bundle` is active with targets `nsis`, `appimage` and `dmg`, icons
set, and `plugins.updater` carries the pubkey and the GitHub Releases
endpoint. See Wavvon-clients `apps/desktop/src-tauri/tauri.conf.json`.
The `identifier` (`com.wavvon.desktop`) and `productName` (`Wavvon`) don't
change.

---

## 8. Open questions

- **macOS signing**: deferred until budget allows Apple Developer Program ($99/year).
- **Android**: removed 2026-07-12; a rewrite waits until mobile is
  prioritized ([android-rewrite-notes.md](android-rewrite-notes.md)).
- **Hub auto-update**: Tauri updater doesn't apply to the hub binary.
  `wavvon-hub update [--check]` exists for Linux x86_64; container hosts
  pull a new image.
- **Windows Store / App Stores**: store sandboxing breaks `wavvon://` deep
  links and unrestricted filesystem access. Not worth pursuing.
- **Delta updates**: Tauri downloads the full installer each time. Acceptable
  at current binary size (tens of MB). Revisit if the binary grows significantly.

