# Packaging & Release

How Wavvon ships to end users across Windows and Linux (the current active
targets), and how the hub server is distributed to operators. The Tauri 2
bundler does the heavy lifting; this doc captures what surrounds it —
signing, updates, CI, and the secrets matrix.

macOS is **deferred** — the Apple Developer Program ($99/year) is a
barrier for a zero-income open-source project. macOS users can build from
source. The Android and browser clients have shipped (see
[android-client.md](android-client.md), [browser-client.md](browser-client.md));
all three apps now live in the Wavvon-client monorepo.

---

## 1. Target platforms and formats

Tauri 2's bundler produces these via `tauri build`. No custom packaging scripts.

| Platform | Primary format | Secondary | Notes |
|---|---|---|---|
| Windows | `.exe` (NSIS) | `.msi` (WiX) | NSIS gives a friendlier installer UX |
| Linux | `.AppImage` | `.deb` | AppImage works on every distro without installation |

**macOS** — deferred. Apple Developer ID + notarization required for Gatekeeper;
costs $99/year. Build from source works fine in the meantime.

**Android** — shipped. Tauri 2 Android shell, side-loaded APK signed with a
self-signed release keystore (Android keystore, not Apple). See
[android-client.md](android-client.md) and [install-android.md](install-android.md).

**Browser client** — shipped. The React frontend runs as a web app with
Tauri `invoke` calls replaced by direct HTTP/WebSocket calls to the hub
(including voice over the `/voice/ws` relay). See [browser-client.md](browser-client.md).

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

### macOS — deferred

Apple Developer Program ($99/year) is out of reach for a zero-income
open-source solo project. macOS users can build from source (`cargo tauri
build`). Revisit when the project gains sponsorship.

### Linux — optional GPG

No mandatory signing. We may GPG-sign the AppImage for users who want to
verify. Distro packages (PPA, COPR) are out of scope for now.

---

## 3. Auto-update (`tauri-plugin-updater`)

### Wire-up

- Add `tauri-plugin-updater` to `Cargo.toml` and register it in
  `tauri.conf.json` under `plugins.updater`.
- Endpoint: `https://releases.wavvon.io/latest.json` (cuttable to GitHub
  Releases API in development).

### Update manifest shape

Tauri 2 updater JSON, served from the endpoint:

```
{
  "version": "0.2.0",
  "notes": "...",
  "pub_date": "2026-06-01T12:00:00Z",
  "platforms": {
    "windows-x86_64": { "url": "...", "signature": "..." },
    "linux-x86_64":   { "url": "...", "signature": "..." }
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

Two workflows. **Describe their structure; do not write the YAML here.**

Each repo carries its own workflows. The client workflows below live in
the Wavvon-client monorepo and cover all three apps (`apps/desktop`,
`apps/web`, `apps/android`) — `build.yml` is a single workflow across
them rather than one per former repo.

### `release.yml` — on `git tag v*`

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

The hub (the `hub/` crate in Wavvon-server) is a separate Rust binary
with its own release shape — no Tauri, no updater. Two artifacts per
release, produced by Wavvon-server's own CI:

### Docker image

- `hub/Dockerfile` in Wavvon-server: multi-stage build.
  - Stage 1: `rust:1-slim` builds the binary.
  - Stage 2: `gcr.io/distroless/cc` runs it. Distroless = no shell,
    no package manager, tiny attack surface.
- Exposes port `3000` (HTTP/WS) and `3001/udp` (voice).
- Pushed to `ghcr.io/wavvon/hub:<version>` and `:latest` on tag.

### Static binary

- `cargo build --release --target x86_64-unknown-linux-musl` for a
  portable single-file binary. Drops into `/usr/local/bin/wavvon-hub` on
  any Linux distro without runtime deps.

### Environment

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite://hub.db` | SQLite path |
| `BIND_ADDR` | `0.0.0.0:3000` | HTTP/WS listener |
| `HUB_IDENTITY_PATH` | `~/.wavvon/hub_identity.json` | Ed25519 keypair location |
| `VOICE_UDP_PORT` | `3001` | Voice relay UDP socket |

### Docker Compose for self-hosters

The release ships a sample `docker-compose.yml` that runs the hub
image, mounts a volume for the SQLite file + identity, maps ports 3000
(TCP) and 3001 (UDP), and wires the env vars above. Operators who want
TLS terminate it in a reverse proxy (Caddy / nginx); see `hosting.md`.

---

## 6. Versioning

- **Semver**. `v0.x.y` until the wire protocol stabilises.
- **Each repo tags independently**. Wavvon-server, Wavvon-client (one
  version for desktop/web/Android together), and Wavvon-discovery each
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

## 7. `tauri.conf.json` additions

Fields to add when packaging lands. Described, not written:

- `bundle.active: true` — enable the bundler in `tauri build`.
- `bundle.targets: ["nsis", "appimage"]` — Windows NSIS installer and Linux AppImage.
- `bundle.icon` — paths to platform-specific icons
  (`icons/icon.ico`, `icons/icon.png`).
- `plugins.updater.pubkey` — public half of the updater signing key (already set).
- `plugins.updater.endpoints` — array containing the
  `releases.wavvon.io/latest.json` URL.

The `identifier` (`com.wavvon.desktop`), `productName` (`Wavvon`), and
`version` already exist and don't change.

---

## 8. Open questions

- **macOS**: deferred until budget allows Apple Developer Program ($99/year).
  Users on macOS can `cargo tauri build` from source.
- **Android**: Tauri 2 supports Android with no cost barrier (Android
  keystore signing is free). Requires Android SDK/NDK setup in CI. Planned
  after Windows/Linux desktop is stable.
- **Browser client**: the existing React frontend can run as a web app by
  replacing `invoke(...)` calls with direct HTTP/WebSocket to the hub.
  No Tauri dependency — planned as a lightweight companion to the desktop client.
- **Hub auto-update**: Tauri updater doesn't apply to the hub binary.
  Options: `systemd` unit with `ExecStartPre` pulling a new Docker image;
  Watchtower for container hosts; or fully manual. Deferred.
- **Windows Store / App Stores**: store sandboxing breaks `wavvon://` deep
  links and unrestricted filesystem access. Not worth pursuing.
- **Delta updates**: Tauri downloads the full installer each time. Acceptable
  at current binary size (tens of MB). Revisit if the binary grows significantly.

